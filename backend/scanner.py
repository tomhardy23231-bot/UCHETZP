# scanner.py - Мониторинг и управление аппаратным сканером HARIZMA
#
# Сканер живёт за NAT в локальной сети — сервер к нему подключиться не может.
# Поэтому связь односторонняя: устройство само раз в N секунд шлёт heartbeat
# ("я жив, вот моё состояние"), а сервер в ответе отдаёт накопившиеся команды,
# новый конфиг и задание на обновление прошивки. Задержка выполнения команды —
# до одного интервала heartbeat, мгновенной реакции тут быть не может.
#
# Отдельный модуль (а не очередной кусок main.py), потому что это самостоятельная
# подсистема: своя авторизация (ключ устройства, а не JWT) и свой набор таблиц.
import hashlib
import hmac
import json
import os
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import (
    APIRouter, Depends, File, Form, Header, HTTPException, Response,
    UploadFile, status,
)
from sqlalchemy.orm import Session

import auth
import database
import models
import schemas

router = APIRouter(prefix="/api/scanner", tags=["scanner"])


# ========== КОНФИГ УСТРОЙСТВА ==========

# Значения по умолчанию. Реальный конфиг хранится в scanner_devices.config_json
# и накладывается поверх этих значений — так добавление нового параметра не
# ломает уже прописанные на устройствах настройки.
DEFAULT_CONFIG = {
    "heartbeat_sec": 30,        # как часто устройство выходит на связь
    "sleep_enabled": True,      # уходить ли в глубокий сон вне рабочих часов
    "work_start": "06:00",      # просыпаться
    "work_end": "19:30",        # засыпать
    "work_days": [1, 2, 3, 4, 5],  # 1=Пн .. 7=Вс — в остальные дни спит весь день
    "night_checkin_min": 30,    # во сне просыпаться на heartbeat раз в N минут (0 — не просыпаться)
    "volume_percent": 50,
    "led_brightness": 100,      # 0..255
    "debounce_sec": 300,        # окно, в котором повторный скан той же карты игнорируется
    "no_sleep_until": None,     # ISO-время: до него не спать (режим обслуживания)
}

ALLOWED_COMMANDS = {
    "reboot": "Перезагрузка",
    "clear_queue": "Очистка очереди",
    "flush_queue": "Досыл очереди",
    "identify": "Звуковой сигнал",
    "reload_config": "Перечитать настройки",
}

# Сколько интервалов молчания прощаем, прежде чем считать устройство офлайн.
MISSED_BEATS_BEFORE_OFFLINE = 3
# Если устройство ушло в долгий сон и молчит дольше — значит оно не просто спит,
# а действительно умерло (на выходные закладываем с запасом).
MAX_SLEEP_SILENCE_SEC = 62 * 3600
# Команда, которую устройство забрало, но не отчиталось — считаем потерянной.
COMMAND_SENT_TIMEOUT_SEC = 10 * 60
# Невостребованная команда протухает — чтобы после недельного простоя на
# устройство не прилетела пачка старых «перезагрузись».
COMMAND_PENDING_TTL_SEC = 24 * 3600
# Точки для графиков пишем реже, чем приходят heartbeat'ы: при интервале 30 с
# иначе набежит 2880 строк в сутки, а для графика хватит одной на 5 минут.
HISTORY_MIN_GAP_SEC = 300
HISTORY_RETENTION_DAYS = 14


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    """Postgres может вернуть naive datetime — приводим к UTC, чтобы вычитать."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def load_config(device: models.ScannerDevice) -> dict:
    """Конфиг устройства = дефолты, перекрытые сохранёнными значениями."""
    cfg = dict(DEFAULT_CONFIG)
    if device.config_json:
        try:
            saved = json.loads(device.config_json)
            if isinstance(saved, dict):
                cfg.update({k: v for k, v in saved.items() if k in DEFAULT_CONFIG})
        except (ValueError, TypeError):
            pass
    return cfg


# ========== АВТОРИЗАЦИЯ УСТРОЙСТВА ==========

def _expected_device_key() -> str:
    key = os.getenv("SCANNER_DEVICE_KEY", "")
    if not key:
        # Намеренно отказываем, а не пускаем всех: через эти эндпоинты можно
        # перезагрузить железо и стереть неотправленные отметки.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="SCANNER_DEVICE_KEY не задан на сервере — приём данных сканера отключён",
        )
    return key


def require_device_key(x_device_key: Optional[str] = Header(None)) -> str:
    """Проверяет общий секрет устройства (заголовок X-Device-Key)."""
    expected = _expected_device_key()
    if not x_device_key or not hmac.compare_digest(x_device_key, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный ключ устройства",
        )
    return x_device_key


def require_device_key_or_basic(
    x_device_key: Optional[str] = Header(None),
    authorization: Optional[str] = Header(None),
) -> str:
    """То же, но дополнительно принимает Basic-авторизацию.

    Нужно для скачивания прошивки: HTTPUpdate на ESP32 умеет подставлять только
    Basic (setAuthorization), произвольный заголовок туда не прокинуть.
    """
    expected = _expected_device_key()

    if x_device_key and hmac.compare_digest(x_device_key, expected):
        return x_device_key

    if authorization and authorization.lower().startswith("basic "):
        import base64
        try:
            decoded = base64.b64decode(authorization[6:]).decode("utf-8")
            _, _, password = decoded.partition(":")
            if password and hmac.compare_digest(password, expected):
                return password
        except (ValueError, UnicodeDecodeError):
            pass

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Неверный ключ устройства",
    )


def firmware_uploader(
    x_upload_token: Optional[str] = Header(None),
    token: Optional[str] = Depends(auth.oauth2_scheme),
    db: Session = Depends(database.get_db),
) -> str:
    """Кто загружает прошивку: администратор или автосборка.

    Автосборке админский пароль давать незачем — ей нужно ровно одно действие,
    поэтому у неё свой токен (FIRMWARE_UPLOAD_TOKEN) и никаких других прав.
    Назначить прошивку устройству она всё равно не может: это по-прежнему
    решает человек, глядя на собранную версию.
    """
    if x_upload_token:
        expected = os.getenv("FIRMWARE_UPLOAD_TOKEN", "")
        if expected and hmac.compare_digest(x_upload_token, expected):
            return "автосборка"
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный токен сборки",
        )

    user = auth.get_current_user(token=token, db=db)
    if user.role != models.UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Доступ только для администратора",
        )
    return user.username


# ========== СОСТОЯНИЕ И ДИАГНОСТИКА ==========

def _wifi_quality(rssi: Optional[int]) -> Optional[int]:
    """dBm → проценты для шкалы. -50 и выше = 100%, -100 = 0%."""
    if rssi is None:
        return None
    return max(0, min(100, 2 * (rssi + 100)))


def _human_duration(seconds: Optional[int]) -> str:
    if seconds is None:
        return "—"
    seconds = int(seconds)
    if seconds < 60:
        return f"{seconds} с"
    minutes = seconds // 60
    if minutes < 60:
        return f"{minutes} мин"
    hours = minutes // 60
    if hours < 24:
        return f"{hours} ч {minutes % 60} мин"
    return f"{hours // 24} д {hours % 24} ч"


def compute_status(device: models.ScannerDevice, cfg: dict) -> tuple:
    """Онлайн / спит / офлайн — по времени и режиму последнего heartbeat.

    Расписание сна на сервере не пересчитываем: устройство само сообщает режим
    ("presleep" перед долгим сном, "night" на коротком пробуждении), поэтому
    возиться с его часовым поясом не приходится.
    """
    last_seen = _aware(device.last_seen_at)
    if last_seen is None:
        return "never", "Ни разу не выходил на связь", None

    age = int((_now() - last_seen).total_seconds())
    mode = device.last_mode or "active"

    if mode == "presleep":
        if age <= MAX_SLEEP_SILENCE_SEC:
            return "sleeping", "Спит по расписанию", age
        return "offline", f"Не просыпается — молчит {_human_duration(age)}", age

    if mode == "night":
        allowed = max(int(cfg.get("night_checkin_min") or 30), 1) * 60 * MISSED_BEATS_BEFORE_OFFLINE
        if age <= allowed + 120:
            return "sleeping", "Спит, но выходит на связь", age
        return "offline", f"Не выходит на связь {_human_duration(age)}", age

    allowed = max(int(cfg.get("heartbeat_sec") or 30), 5) * MISSED_BEATS_BEFORE_OFFLINE
    if age <= allowed + 20:
        return "online", "На связи", age
    return "offline", f"Не выходит на связь {_human_duration(age)}", age


# Причины перезагрузки, которые означают сбой, а не штатный цикл питания.
_CRASH_RESETS = {"panic", "wdt", "task_wdt", "int_wdt", "brownout"}


def build_alerts(device: models.ScannerDevice, status_key: str, age: Optional[int]) -> List[str]:
    """Готовые тексты проблем — их же показывает плашка на дашборде."""
    alerts = []

    if status_key == "offline":
        alerts.append(f"Сканер не выходит на связь {_human_duration(age)}")
    elif status_key == "never":
        alerts.append("Сканер ни разу не выходил на связь — проверьте прошивку и ключ устройства")

    if status_key in ("online", "sleeping"):
        if device.battery_percent is not None and device.battery_percent <= 20:
            alerts.append(f"Батарея {device.battery_percent}% — скоро сядет")
        if device.queue_size is not None and device.queue_size >= 20:
            alerts.append(f"В очереди {device.queue_size} неотправленных отметок")
        if device.rssi is not None and device.rssi <= -80:
            alerts.append(f"Слабый сигнал Wi-Fi ({device.rssi} dBm)")
        if device.free_heap is not None and device.free_heap < 30000:
            alerts.append(f"Мало свободной памяти ({device.free_heap // 1024} КБ)")
        if device.time_synced is False:
            alerts.append("Время не синхронизировано — отметки уйдут без точной метки")
        if (device.reset_reason or "").lower() in _CRASH_RESETS:
            if device.uptime_sec is not None and device.uptime_sec < 3600:
                alerts.append(f"Только что перезагрузился по сбою ({device.reset_reason})")
        if device.last_ota_error:
            alerts.append(f"Обновление не встало: {device.last_ota_error}")

    return alerts


def serialize_device(db: Session, device: models.ScannerDevice) -> schemas.ScannerDeviceOut:
    cfg = load_config(device)
    status_key, status_label, age = compute_status(device, cfg)

    pending = db.query(models.ScannerCommand).filter(
        models.ScannerCommand.device_id == device.device_id,
        models.ScannerCommand.status.in_(["pending", "sent"]),
    ).count()

    fw_ok = None
    if device.target_firmware_id:
        target = db.query(models.ScannerFirmware).filter(
            models.ScannerFirmware.id == device.target_firmware_id
        ).first()
        if target:
            fw_ok = (device.fw_version == target.version)

    return schemas.ScannerDeviceOut(
        device_id=device.device_id,
        name=device.name,
        status=status_key,
        status_label=status_label,
        seconds_since_seen=age,
        last_seen_at=device.last_seen_at,
        first_seen_at=device.first_seen_at,
        last_mode=device.last_mode,
        fw_version=device.fw_version,
        ip_address=device.ip_address,
        ssid=device.ssid,
        rssi=device.rssi,
        wifi_quality=_wifi_quality(device.rssi),
        battery_percent=device.battery_percent,
        battery_voltage=device.battery_voltage,
        queue_size=device.queue_size,
        free_heap=device.free_heap,
        uptime_sec=device.uptime_sec,
        reset_reason=device.reset_reason,
        time_synced=device.time_synced,
        config=cfg,
        config_version=device.config_version or 1,
        pending_commands=pending,
        alerts=build_alerts(device, status_key, age),
        target_firmware_id=device.target_firmware_id,
        firmware_up_to_date=fw_ok,
        last_ota_error=device.last_ota_error,
    )


def _get_device_or_404(db: Session, device_id: str) -> models.ScannerDevice:
    device = db.query(models.ScannerDevice).filter(
        models.ScannerDevice.device_id == device_id
    ).first()
    if not device:
        raise HTTPException(status_code=404, detail="Сканер не найден")
    return device


# ========== ЭНДПОИНТЫ УСТРОЙСТВА ==========

def _expire_stale_commands(db: Session, device_id: str):
    """Чистим застрявшие команды, чтобы они не висели в панели вечно."""
    now = _now()
    sent_deadline = now - timedelta(seconds=COMMAND_SENT_TIMEOUT_SEC)
    pending_deadline = now - timedelta(seconds=COMMAND_PENDING_TTL_SEC)

    db.query(models.ScannerCommand).filter(
        models.ScannerCommand.device_id == device_id,
        models.ScannerCommand.status == "sent",
        models.ScannerCommand.sent_at < sent_deadline,
    ).update({"status": "expired", "result": "Устройство не отчиталось о выполнении",
              "finished_at": now}, synchronize_session=False)

    db.query(models.ScannerCommand).filter(
        models.ScannerCommand.device_id == device_id,
        models.ScannerCommand.status == "pending",
        models.ScannerCommand.created_at < pending_deadline,
    ).update({"status": "expired", "result": "Устройство не забрало команду за сутки",
              "finished_at": now}, synchronize_session=False)


def _record_history(db: Session, device_id: str, hb: schemas.ScannerHeartbeatIn):
    """Пишем точку графика, но не чаще раза в HISTORY_MIN_GAP_SEC."""
    last = db.query(models.ScannerHeartbeat).filter(
        models.ScannerHeartbeat.device_id == device_id
    ).order_by(models.ScannerHeartbeat.at.desc()).first()

    if last is not None:
        last_at = _aware(last.at)
        if last_at and (_now() - last_at).total_seconds() < HISTORY_MIN_GAP_SEC:
            return

    db.add(models.ScannerHeartbeat(
        device_id=device_id,
        mode=hb.mode,
        rssi=hb.rssi,
        battery_percent=hb.battery_percent,
        battery_voltage=hb.battery_voltage,
        queue_size=hb.queue_size,
        free_heap=hb.free_heap,
        uptime_sec=hb.uptime_sec,
    ))

    cutoff = _now() - timedelta(days=HISTORY_RETENTION_DAYS)
    db.query(models.ScannerHeartbeat).filter(
        models.ScannerHeartbeat.device_id == device_id,
        models.ScannerHeartbeat.at < cutoff,
    ).delete(synchronize_session=False)


@router.post("/heartbeat", response_model=schemas.ScannerHeartbeatOut)
def scanner_heartbeat(
    hb: schemas.ScannerHeartbeatIn,
    db: Session = Depends(database.get_db),
    _key: str = Depends(require_device_key),
):
    """Сканер отчитывается о себе и забирает накопившиеся команды.

    Единственная точка, через которую сервер вообще может что-то сказать
    устройству — своего адреса у сканера нет.
    """
    device = db.query(models.ScannerDevice).filter(
        models.ScannerDevice.device_id == hb.device_id
    ).first()

    if not device:
        device = models.ScannerDevice(
            device_id=hb.device_id,
            name=hb.device_id,
            config_json=json.dumps(DEFAULT_CONFIG),
            config_version=1,
        )
        db.add(device)
        db.flush()

    now = _now()
    device.last_seen_at = now
    device.last_mode = hb.mode
    if hb.fw_version:
        device.fw_version = hb.fw_version
    device.ip_address = hb.ip
    device.ssid = hb.ssid
    device.rssi = hb.rssi
    device.battery_percent = hb.battery_percent
    device.battery_voltage = hb.battery_voltage
    device.queue_size = hb.queue_size
    device.free_heap = hb.free_heap
    device.uptime_sec = hb.uptime_sec
    device.reset_reason = hb.reset_reason
    device.time_synced = hb.time_synced
    if hb.ota_error:
        device.last_ota_error = hb.ota_error[:300]

    _record_history(db, device.device_id, hb)
    _expire_stale_commands(db, device.device_id)

    cfg = load_config(device)
    device_config_version = device.config_version or 1

    # Конфиг отдаём только когда у устройства версия старее — чтобы не гонять
    # его в каждом ответе.
    config_payload = cfg if hb.config_version < device_config_version else None

    # Забираем очередь команд. На коротком ночном пробуждении лишнего не шлём:
    # у устройства несколько секунд до возврата в сон.
    limit = 3 if hb.mode == "night" else 10
    pending = db.query(models.ScannerCommand).filter(
        models.ScannerCommand.device_id == device.device_id,
        models.ScannerCommand.status == "pending",
    ).order_by(models.ScannerCommand.created_at).limit(limit).all()

    commands = []
    for cmd in pending:
        cmd.status = "sent"
        cmd.sent_at = now
        payload = None
        if cmd.payload:
            try:
                payload = json.loads(cmd.payload)
            except (ValueError, TypeError):
                payload = None
        commands.append(schemas.ScannerCommandOut(id=cmd.id, command=cmd.command, payload=payload))

    # Задание на обновление прошивки — если назначено и версия не совпадает.
    ota = None
    if device.target_firmware_id:
        fw = db.query(models.ScannerFirmware).filter(
            models.ScannerFirmware.id == device.target_firmware_id
        ).first()
        if fw and fw.version != (hb.fw_version or ""):
            ota = schemas.ScannerOtaOut(
                version=fw.version,
                url=f"/api/scanner/firmware/{fw.id}/download",
                md5=fw.md5,
                size=fw.size_bytes,
            )
        elif fw:
            # Устройство уже на нужной версии — снимаем задание и забываем
            # прошлые неудачи: они больше ни о чём не говорят.
            device.target_firmware_id = None
            device.last_ota_error = None

    db.commit()

    next_sec = int(cfg.get("heartbeat_sec") or 30)
    return schemas.ScannerHeartbeatOut(
        server_time=now,
        config_version=device_config_version,
        config=config_payload,
        commands=commands,
        ota=ota,
        next_heartbeat_sec=next_sec,
    )


@router.post("/command-result")
def scanner_command_result(
    res: schemas.ScannerCommandResult,
    db: Session = Depends(database.get_db),
    _key: str = Depends(require_device_key),
):
    """Устройство отчитывается, что стало с командой."""
    cmd = db.query(models.ScannerCommand).filter(
        models.ScannerCommand.id == res.command_id,
        models.ScannerCommand.device_id == res.device_id,
    ).first()
    if not cmd:
        raise HTTPException(status_code=404, detail="Команда не найдена")

    cmd.status = "done" if res.ok else "failed"
    cmd.finished_at = _now()
    cmd.result = (res.message or "")[:500] or ("Выполнено" if res.ok else "Ошибка")
    db.commit()
    return {"ok": True}


@router.get("/firmware/{firmware_id}/download")
def download_firmware(
    firmware_id: int,
    db: Session = Depends(database.get_db),
    _key: str = Depends(require_device_key_or_basic),
):
    """Отдаёт .bin устройству. Сюда ходит HTTPUpdate на сканере."""
    fw = db.query(models.ScannerFirmware).filter(
        models.ScannerFirmware.id == firmware_id
    ).first()
    if not fw:
        raise HTTPException(status_code=404, detail="Прошивка не найдена")

    return Response(
        content=fw.data,
        media_type="application/octet-stream",
        headers={
            "Content-Disposition": f'attachment; filename="{fw.filename or "firmware.bin"}"',
            "x-MD5": fw.md5,  # HTTPUpdate сверяет контрольную сумму по этому заголовку
        },
    )


# ========== АДМИНСКИЕ ЭНДПОИНТЫ ==========

@router.get("/devices", response_model=List[schemas.ScannerDeviceOut])
def list_devices(
    db: Session = Depends(database.get_db),
    _admin: models.User = Depends(auth.require_admin),
):
    """Все известные сканеры с текущим состоянием."""
    devices = db.query(models.ScannerDevice).order_by(models.ScannerDevice.id).all()
    return [serialize_device(db, d) for d in devices]


@router.get("/devices/{device_id}", response_model=schemas.ScannerDeviceOut)
def get_device(
    device_id: str,
    db: Session = Depends(database.get_db),
    _admin: models.User = Depends(auth.require_admin),
):
    return serialize_device(db, _get_device_or_404(db, device_id))


@router.get("/devices/{device_id}/history", response_model=List[schemas.ScannerHistoryPoint])
def get_device_history(
    device_id: str,
    hours: int = 24,
    db: Session = Depends(database.get_db),
    _admin: models.User = Depends(auth.require_admin),
):
    """История состояния для графиков сигнала, батареи и очереди."""
    hours = max(1, min(hours, 24 * HISTORY_RETENTION_DAYS))
    since = _now() - timedelta(hours=hours)
    rows = db.query(models.ScannerHeartbeat).filter(
        models.ScannerHeartbeat.device_id == device_id,
        models.ScannerHeartbeat.at >= since,
    ).order_by(models.ScannerHeartbeat.at).all()
    return rows


@router.get("/devices/{device_id}/commands", response_model=List[schemas.ScannerCommandEntry])
def get_device_commands(
    device_id: str,
    limit: int = 50,
    db: Session = Depends(database.get_db),
    _admin: models.User = Depends(auth.require_admin),
):
    """История команд — что отправляли и чем закончилось."""
    limit = max(1, min(limit, 300))
    return db.query(models.ScannerCommand).filter(
        models.ScannerCommand.device_id == device_id
    ).order_by(models.ScannerCommand.created_at.desc()).limit(limit).all()


@router.post("/devices/{device_id}/commands", response_model=schemas.ScannerCommandEntry,
             status_code=status.HTTP_201_CREATED)
def send_device_command(
    device_id: str,
    req: schemas.ScannerCommandRequest,
    db: Session = Depends(database.get_db),
    admin: models.User = Depends(auth.require_admin),
):
    """Ставит команду в очередь. Устройство заберёт её на ближайшем heartbeat."""
    device = _get_device_or_404(db, device_id)

    if req.command not in ALLOWED_COMMANDS:
        raise HTTPException(
            status_code=400,
            detail=f"Неизвестная команда. Доступны: {', '.join(sorted(ALLOWED_COMMANDS))}",
        )

    # Дубликат той же команды в очереди смысла не имеет — вернём существующую,
    # иначе двойной клик по «Перезагрузить» положит в очередь две перезагрузки.
    existing = db.query(models.ScannerCommand).filter(
        models.ScannerCommand.device_id == device_id,
        models.ScannerCommand.command == req.command,
        models.ScannerCommand.status == "pending",
    ).first()
    if existing:
        return existing

    cmd = models.ScannerCommand(
        device_id=device.device_id,
        command=req.command,
        payload=json.dumps(req.payload) if req.payload else None,
        status="pending",
        created_by=admin.username,
    )
    db.add(cmd)
    db.commit()
    db.refresh(cmd)
    return cmd


@router.delete("/devices/{device_id}/commands/{command_id}")
def cancel_device_command(
    device_id: str,
    command_id: int,
    db: Session = Depends(database.get_db),
    _admin: models.User = Depends(auth.require_admin),
):
    """Отменяет команду, которую устройство ещё не забрало."""
    cmd = db.query(models.ScannerCommand).filter(
        models.ScannerCommand.id == command_id,
        models.ScannerCommand.device_id == device_id,
    ).first()
    if not cmd:
        raise HTTPException(status_code=404, detail="Команда не найдена")
    if cmd.status != "pending":
        raise HTTPException(status_code=409, detail="Устройство уже забрало эту команду")

    db.delete(cmd)
    db.commit()
    return {"message": "Команда отменена"}


@router.put("/devices/{device_id}/config", response_model=schemas.ScannerDeviceOut)
def update_device_config(
    device_id: str,
    req: schemas.ScannerConfigUpdate,
    db: Session = Depends(database.get_db),
    _admin: models.User = Depends(auth.require_admin),
):
    """Меняет настройки сканера. Устройство подхватит их на следующем heartbeat."""
    device = _get_device_or_404(db, device_id)
    cfg = load_config(device)

    changes = req.model_dump(exclude_unset=True)

    if "heartbeat_sec" in changes and changes["heartbeat_sec"] is not None:
        if not 10 <= changes["heartbeat_sec"] <= 3600:
            raise HTTPException(status_code=400, detail="Интервал heartbeat: от 10 до 3600 секунд")
    if "night_checkin_min" in changes and changes["night_checkin_min"] is not None:
        if not 0 <= changes["night_checkin_min"] <= 720:
            raise HTTPException(status_code=400, detail="Ночная проверка связи: от 0 до 720 минут")
    if "debounce_sec" in changes and changes["debounce_sec"] is not None:
        if not 0 <= changes["debounce_sec"] <= 7200:
            raise HTTPException(status_code=400, detail="Окно дебаунса: от 0 до 7200 секунд")
    if "volume_percent" in changes and changes["volume_percent"] is not None:
        if not 0 <= changes["volume_percent"] <= 100:
            raise HTTPException(status_code=400, detail="Громкость: от 0 до 100")
    if "led_brightness" in changes and changes["led_brightness"] is not None:
        if not 0 <= changes["led_brightness"] <= 255:
            raise HTTPException(status_code=400, detail="Яркость: от 0 до 255")
    for field in ("work_start", "work_end"):
        if changes.get(field) is not None:
            try:
                datetime.strptime(changes[field], "%H:%M")
            except ValueError:
                raise HTTPException(status_code=400, detail=f"{field}: ожидается формат ЧЧ:ММ")
    if changes.get("work_days") is not None:
        days = changes["work_days"]
        if not days or any(d not in range(1, 8) for d in days):
            raise HTTPException(status_code=400, detail="Рабочие дни: числа от 1 (Пн) до 7 (Вс)")
        changes["work_days"] = sorted(set(days))
    if "no_sleep_until" in changes and changes["no_sleep_until"] is not None:
        changes["no_sleep_until"] = changes["no_sleep_until"].isoformat()

    cfg.update(changes)
    device.config_json = json.dumps(cfg)
    device.config_version = (device.config_version or 1) + 1
    db.commit()
    db.refresh(device)
    return serialize_device(db, device)


@router.put("/devices/{device_id}/name", response_model=schemas.ScannerDeviceOut)
def rename_device(
    device_id: str,
    name: str,
    db: Session = Depends(database.get_db),
    _admin: models.User = Depends(auth.require_admin),
):
    """Человеческое имя сканера («На проходной», «Цех 2»)."""
    device = _get_device_or_404(db, device_id)
    device.name = name.strip()[:100] or device.device_id
    db.commit()
    db.refresh(device)
    return serialize_device(db, device)


# ========== ПРОШИВКИ ==========

@router.get("/firmware", response_model=List[schemas.ScannerFirmwareEntry])
def list_firmware(
    db: Session = Depends(database.get_db),
    _admin: models.User = Depends(auth.require_admin),
):
    """Загруженные сборки, новые сверху."""
    return db.query(models.ScannerFirmware).order_by(
        models.ScannerFirmware.uploaded_at.desc()
    ).all()


@router.post("/firmware", response_model=schemas.ScannerFirmwareEntry,
             status_code=status.HTTP_201_CREATED)
async def upload_firmware(
    version: str = Form(...),
    notes: Optional[str] = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(database.get_db),
    uploader: str = Depends(firmware_uploader),
):
    """Загрузка .bin для обновления по воздуху.

    Версия должна совпадать с FW_VERSION внутри самой прошивки — иначе после
    обновления сервер решит, что устройство так и не обновилось, и будет
    гонять его по кругу.
    """
    version = version.strip()
    if not version:
        raise HTTPException(status_code=400, detail="Укажите версию прошивки")

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Файл пустой")
    if len(data) > 4 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Файл больше 4 МБ — это точно прошивка ESP32?")
    # Образ ESP32 начинается с магического байта 0xE9.
    if data[0] != 0xE9:
        raise HTTPException(
            status_code=400,
            detail="Это не похоже на прошивку ESP32 (.bin). Нужен файл сборки, а не .elf или архив.",
        )

    if db.query(models.ScannerFirmware).filter(models.ScannerFirmware.version == version).first():
        raise HTTPException(status_code=409, detail=f"Версия {version} уже загружена")

    fw = models.ScannerFirmware(
        version=version,
        filename=file.filename,
        size_bytes=len(data),
        md5=hashlib.md5(data).hexdigest(),
        data=data,
        notes=(notes or "").strip() or None,
        uploaded_by=uploader,
    )
    db.add(fw)
    db.commit()
    db.refresh(fw)
    return fw


@router.delete("/firmware/{firmware_id}")
def delete_firmware(
    firmware_id: int,
    db: Session = Depends(database.get_db),
    _admin: models.User = Depends(auth.require_admin),
):
    fw = db.query(models.ScannerFirmware).filter(
        models.ScannerFirmware.id == firmware_id
    ).first()
    if not fw:
        raise HTTPException(status_code=404, detail="Прошивка не найдена")

    assigned = db.query(models.ScannerDevice).filter(
        models.ScannerDevice.target_firmware_id == firmware_id
    ).count()
    if assigned:
        raise HTTPException(
            status_code=409,
            detail="Эта прошивка назначена устройству — сначала отмените обновление",
        )

    db.delete(fw)
    db.commit()
    return {"message": f"Прошивка {fw.version} удалена"}


@router.post("/devices/{device_id}/update", response_model=schemas.ScannerDeviceOut)
def assign_firmware(
    device_id: str,
    firmware_id: int,
    db: Session = Depends(database.get_db),
    _admin: models.User = Depends(auth.require_admin),
):
    """Назначает устройству прошивку — оно скачает и поставит её само."""
    device = _get_device_or_404(db, device_id)
    fw = db.query(models.ScannerFirmware).filter(
        models.ScannerFirmware.id == firmware_id
    ).first()
    if not fw:
        raise HTTPException(status_code=404, detail="Прошивка не найдена")
    if fw.version == device.fw_version:
        raise HTTPException(status_code=409, detail=f"На устройстве уже версия {fw.version}")

    device.target_firmware_id = fw.id
    db.commit()
    db.refresh(device)
    return serialize_device(db, device)


@router.delete("/devices/{device_id}/update", response_model=schemas.ScannerDeviceOut)
def cancel_firmware_update(
    device_id: str,
    db: Session = Depends(database.get_db),
    _admin: models.User = Depends(auth.require_admin),
):
    """Снимает назначенное обновление (если устройство ещё не успело его забрать)."""
    device = _get_device_or_404(db, device_id)
    device.target_firmware_id = None
    db.commit()
    db.refresh(device)
    return serialize_device(db, device)


# ========== СВОДКА ДЛЯ ДАШБОРДА ==========

@router.get("/health")
def scanner_health(
    db: Session = Depends(database.get_db),
    _admin: models.User = Depends(auth.require_admin),
):
    """Короткая сводка для плашки на дашборде: есть ли проблемы."""
    devices = db.query(models.ScannerDevice).all()
    if not devices:
        return {"known": False, "ok": True, "alerts": [], "devices": [], "new_firmware": None}

    summary = []
    all_alerts = []
    for device in devices:
        cfg = load_config(device)
        status_key, status_label, age = compute_status(device, cfg)
        alerts = build_alerts(device, status_key, age)
        all_alerts.extend(alerts)
        summary.append({
            "device_id": device.device_id,
            "name": device.name or device.device_id,
            "status": status_key,
            "status_label": status_label,
            "battery_percent": device.battery_percent,
            "queue_size": device.queue_size,
            "alerts": alerts,
        })

    # Собранная, но ещё не установленная прошивка. Без этого о новой сборке
    # узнаёшь, только случайно заглянув на страницу сканера: автосборка кладёт
    # файл молча, а сама себя на устройство она намеренно не ставит.
    newest = db.query(models.ScannerFirmware).order_by(
        models.ScannerFirmware.uploaded_at.desc()
    ).first()
    new_firmware = None
    if newest:
        installed = {d.fw_version for d in devices if d.fw_version}
        assigned = {d.target_firmware_id for d in devices if d.target_firmware_id}
        if newest.version not in installed and newest.id not in assigned:
            new_firmware = {
                "version": newest.version,
                "notes": newest.notes,
                "uploaded_by": newest.uploaded_by,
                "uploaded_at": newest.uploaded_at,
            }

    return {
        "known": True,
        "ok": not all_alerts,
        "alerts": all_alerts,
        "devices": summary,
        "new_firmware": new_firmware,
    }

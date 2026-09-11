# models.py - Модели базы данных (SQLAlchemy)
from sqlalchemy import (
    Column, Integer, String, Float, DateTime, Enum, ForeignKey, UniqueConstraint,
    Boolean, Text, LargeBinary,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base
import enum


class TransactionType(enum.Enum):
    """Типы финансовых транзакций."""
    BONUS = "bonus"       # Премия
    ADVANCE = "advance"   # Аванс
    FINE = "fine"         # Удержание
    POINTS = "points"     # Сдельная работа (баллы)


class UserRole(enum.Enum):
    """Роли пользователей системы."""
    ADMIN = "admin"        # Владелец системы — полный доступ
    EMPLOYEE = "employee"  # Сотрудник — только свой личный кабинет


class Employee(Base):
    """Модель сотрудника."""
    __tablename__ = "employees"

    id = Column(Integer, primary_key=True, index=True)
    card_id = Column(String, unique=True, nullable=True)
    name = Column(String, nullable=False)  # ФИО
    position = Column(String, nullable=False)  # Должность
    phone = Column(String)  # Телефон
    bank_acc = Column(String(16))  # Номер счёта (16 цифр)
    rate = Column(Float, default=0.0)  # Базовая ставка (грн/мес)
    point_val = Column(Float, default=0.0)  # Стоимость одного балла (грн)

    # Связи с другими таблицами
    attendance_records = relationship("Attendance", back_populates="employee", cascade="all, delete-orphan")
    financial_transactions = relationship("FinancialTransaction", back_populates="employee", cascade="all, delete-orphan")
    salary_snapshots = relationship("SalarySnapshot", back_populates="employee", cascade="all, delete-orphan")
    user = relationship("User", back_populates="employee", uselist=False, cascade="all, delete-orphan")

    @property
    def account_username(self) -> "str | None":
        """Логин личного кабинета сотрудника (None если кабинет не создан)."""
        return self.user.username if self.user else None

    @property
    def account_password(self) -> "str | None":
        """Открытый пароль кабинета — для админ-UI. None если кабинета нет или пароль не хранится."""
        return self.user.password_plaintext if self.user else None


class Attendance(Base):
    """Модель учёта посещаемости (табель)."""
    __tablename__ = "attendance"

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    date = Column(String, nullable=False, index=True)  # Дата в формате YYYY-MM-DD
    in_time = Column(DateTime, nullable=False)  # Время прихода
    out_time = Column(DateTime, nullable=True)  # Время ухода (может быть пустым)

    # Связь с сотрудником
    employee = relationship("Employee", back_populates="attendance_records")


class FinancialTransaction(Base):
    """Модель финансовых транзакций (премии, авансы, удержания и прочие, сдельная работа)."""
    __tablename__ = "financial_transactions"

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    type = Column(Enum(TransactionType), nullable=False)  # Тип транзакции
    amount = Column(Float, nullable=False)  # Сумма в гривнах
    points_count = Column(Float, nullable=True)  # Количество баллов (для сдельной работы)
    comment = Column(String, nullable=True)  # Комментарий/описание (опционально)
    created_at = Column(DateTime(timezone=True), server_default=func.now())  # Дата создания
    date = Column(String, nullable=False, index=True)  # Дата в формате YYYY-MM-DD для группировки

    # Связь с сотрудником
    employee = relationship("Employee", back_populates="financial_transactions")


class SalarySnapshot(Base):
    """Модель снимков параметров зарплаты для сотрудников."""
    __tablename__ = "salary_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    month = Column(String, nullable=False, index=True)  # Формат "YYYY-MM"
    salary_rate = Column(Float, nullable=False)  # Ставка за месяц (грн)
    point_rate = Column(Float, nullable=False)  # Стоимость одного балла (грн)

    # Связь с сотрудником
    employee = relationship("Employee", back_populates="salary_snapshots")

    # Уникальный constraint на пару (employee_id, month)
    __table_args__ = (
        UniqueConstraint('employee_id', 'month', name='_employee_month_uc'),
    )


class ForecastSnapshot(Base):
    """Снимок прогноза ФОТ на конкретный день — для самокоррекции и метрик точности.

    Раз в день бэкенд при запросе аналитики записывает текущий прогноз с разбивкой
    по сигналам (темп / день-недели / история). Когда месяц завершается, запись
    дополняется фактом — `actual_accrued`. По истории ошибок каждого сигнала
    подбираются веса для будущих прогнозов: сигнал, который ошибался меньше,
    получает больший вес.
    """
    __tablename__ = "forecast_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    month = Column(String, nullable=False, index=True)            # "YYYY-MM" — месяц прогноза
    snapshot_date = Column(String, nullable=False, index=True)    # "YYYY-MM-DD" — день, когда прогноз снят
    elapsed_workdays = Column(Integer, nullable=False, default=0)
    pace_value = Column(Float, nullable=True)                     # сигнал: текущий темп
    dow_value = Column(Float, nullable=True)                      # сигнал: day-of-week per-employee
    history_value = Column(Float, nullable=True)                  # сигнал: средняя по прошлым месяцам
    blended_value = Column(Float, nullable=False)                 # итоговый прогноз
    actual_accrued = Column(Float, nullable=True)                 # фактический ФОТ (заполняется по итогу месяца)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint('month', 'snapshot_date', name='_forecast_month_date_uc'),
    )


class MonthClosure(Base):
    """Закрытый (зафиксированный) расчётный месяц.

    Когда админ закрывает месяц — добавляется одна строка с месяцем "YYYY-MM".
    После этого транзакции этого месяца и корректировки часов/баллов блокируются
    на бэкенде, чтобы цифры за уже выплаченную зарплату нельзя было поменять
    задним числом. Снятие закрытия = удаление строки.
    """
    __tablename__ = "month_closures"

    id = Column(Integer, primary_key=True, index=True)
    month = Column(String, nullable=False, unique=True, index=True)  # "YYYY-MM"
    closed_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    closed_by_user_id = Column(Integer, nullable=True)  # админ, который нажал «Закрыть»
    closed_by_username = Column(String, nullable=True)  # снимок логина (на случай удаления юзера)


class AttendanceLog(Base):
    """Модель логов сканирований (успехи и ошибки) - для просмотра администратором."""
    __tablename__ = "attendance_logs"

    id = Column(Integer, primary_key=True, index=True)
    received_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)  # когда сервер получил
    card_id = Column(String, nullable=False, index=True)  # ID карты которую отсканировали
    scan_timestamp = Column(DateTime, nullable=True)  # время с самого сканера (когда было сканирование)
    employee_id = Column(Integer, nullable=True)  # ID сотрудника (если карта была опознана)
    employee_name = Column(String, nullable=True)  # ФИО снимок (на момент скана)
    status = Column(String, nullable=False, index=True)  # checked_in / checked_out / re_checked_out / debounced / duplicate / unknown_card / error
    result = Column(String, nullable=False, index=True)  # success / warning / error
    message = Column(String, nullable=True)  # человеческое объяснение причины


class CabinetActivityLog(Base):
    """Лог активности кабинета: кто/когда зашёл, что смотрел, с какого IP/браузера."""
    __tablename__ = "cabinet_activity_logs"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    user_id = Column(Integer, nullable=True, index=True)  # NULL для login_failed
    employee_id = Column(Integer, nullable=True, index=True)  # NULL для admin/login_failed
    role = Column(String, nullable=True)  # admin/employee/None для failed
    username_attempted = Column(String, nullable=True)  # для login_failed
    employee_name = Column(String, nullable=True)  # снимок ФИО на момент события
    event_type = Column(String, nullable=False, index=True)
    # event_type: login_success | login_failed | view_profile | view_calendar
    #             | view_payroll | view_transactions
    ip_address = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)


class User(Base):
    """Пользователь системы (админ или сотрудник с личным кабинетом)."""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    # Открытая копия пароля — только для удобства админа (видеть/менять). Используется
    # для отображения, а проверка логина идёт через bcrypt-хеш. Хранение plaintext —
    # компромисс безопасности, но для one-admin системы оправдано.
    password_plaintext = Column(String, nullable=True)
    role = Column(Enum(UserRole), nullable=False, default=UserRole.EMPLOYEE)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=True, unique=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    employee = relationship("Employee", back_populates="user")

# ========== СКАНЕР: МОНИТОРИНГ И УПРАВЛЕНИЕ ==========
# Сканер за NAT — сервер к нему достучаться не может. Поэтому устройство само
# раз в N секунд шлёт heartbeat, а сервер в ответе отдаёт накопленные команды.


class ScannerDevice(Base):
    """Состояние аппаратного сканера — обновляется каждым heartbeat."""
    __tablename__ = "scanner_devices"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(String, unique=True, nullable=False, index=True)  # "HARIZMA-SCANNER"
    name = Column(String, nullable=True)  # человеческое имя ("Сканер на проходной")

    first_seen_at = Column(DateTime(timezone=True), server_default=func.now())
    last_seen_at = Column(DateTime(timezone=True), nullable=True, index=True)
    # "active" — обычный рабочий heartbeat, "night" — короткое пробуждение из сна.
    # От этого зависит, через сколько секунд молчания считать устройство офлайн.
    last_mode = Column(String, nullable=True)

    fw_version = Column(String, nullable=True)
    ip_address = Column(String, nullable=True)
    ssid = Column(String, nullable=True)
    rssi = Column(Integer, nullable=True)           # dBm, обычно -30..-90
    battery_percent = Column(Integer, nullable=True)
    battery_voltage = Column(Float, nullable=True)
    queue_size = Column(Integer, nullable=True)     # строк в /offline.jsonl
    free_heap = Column(Integer, nullable=True)      # байт — видно утечки
    uptime_sec = Column(Integer, nullable=True)
    reset_reason = Column(String, nullable=True)    # panic/wdt/poweron/deepsleep/sw
    time_synced = Column(Boolean, nullable=True)    # отработал ли NTP

    # Конфиг устройства (JSON-строка). Сканер применяет его, когда config_version
    # в ответе heartbeat выше той, что у него сохранена.
    config_json = Column(Text, nullable=True)
    config_version = Column(Integer, nullable=False, default=1)

    # Какую прошивку устройство должно на себя поставить (id из scanner_firmware).
    # NULL — обновление не назначено.
    target_firmware_id = Column(Integer, nullable=True)
    # Текст последней неудачи обновления, как его прислало устройство. Сканер
    # пробует одну и ту же сборку максимум трижды, поэтому без этого поля
    # обновление молча не встало бы и никто бы не узнал почему.
    last_ota_error = Column(String, nullable=True)


class ScannerCommand(Base):
    """Очередь команд устройству. Забираются в ответе на heartbeat."""
    __tablename__ = "scanner_commands"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(String, nullable=False, index=True)
    # reboot | clear_queue | flush_queue | identify | ota_update | reload_config
    command = Column(String, nullable=False)
    payload = Column(Text, nullable=True)  # JSON с параметрами, если нужны

    # pending -> sent -> done / failed. expired — устройство не забрало вовремя.
    status = Column(String, nullable=False, default="pending", index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    sent_at = Column(DateTime(timezone=True), nullable=True)
    finished_at = Column(DateTime(timezone=True), nullable=True)
    result = Column(String, nullable=True)      # что ответило устройство
    created_by = Column(String, nullable=True)  # username админа


class ScannerHeartbeat(Base):
    """История heartbeat'ов — для графиков сигнала, батареи и очереди."""
    __tablename__ = "scanner_heartbeats"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(String, nullable=False, index=True)
    at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    mode = Column(String, nullable=True)
    rssi = Column(Integer, nullable=True)
    battery_percent = Column(Integer, nullable=True)
    battery_voltage = Column(Float, nullable=True)
    queue_size = Column(Integer, nullable=True)
    free_heap = Column(Integer, nullable=True)
    uptime_sec = Column(Integer, nullable=True)


class ScannerFirmware(Base):
    """Загруженные админом сборки прошивки (.bin) для обновления по воздуху.

    Бинарник лежит прямо в базе: контейнеры пересобираются при автодеплое, а
    отдельного тома под файлы нет — так сборка переживает пересборку.
    """
    __tablename__ = "scanner_firmware"

    id = Column(Integer, primary_key=True, index=True)
    version = Column(String, nullable=False)   # "2.0.1" — сравнивается с FW_VERSION сканера
    filename = Column(String, nullable=True)
    size_bytes = Column(Integer, nullable=False)
    md5 = Column(String, nullable=False)       # сканер сверяет после скачивания
    data = Column(LargeBinary, nullable=False)
    notes = Column(String, nullable=True)
    uploaded_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    uploaded_by = Column(String, nullable=True)

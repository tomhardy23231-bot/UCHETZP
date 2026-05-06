# main.py - Главное приложение FastAPI
import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI, Depends, HTTPException, status, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from typing import List, Optional
from datetime import datetime, timedelta, timezone
from pydantic import BaseModel
import calendar

import database
import models
import schemas
import crud
import auth

# Глобальная переменная для временного хранения ID неизвестной карты (для регистрации новых сотрудников)
latest_scanned_card = None

def _migrate_users_table_if_stale():
    """Чиним старую таблицу users + старый ENUM userrole от прошлых попыток auth.

    Постгрес-ENUM-тип ('userrole') живёт отдельно от таблицы — DROP TABLE его
    не уносит. От старого кода (commit 1a77c70 cleanup dead auth) мог остаться
    enum со значениями {'admin'} или {'admin','user'}, без 'employee'. Тогда
    seed_admin (admin) работает, а создание сотрудника-кабинета (employee)
    падает с 500 на INSERT.

    Безопасность: автодроп users ТОЛЬКО если строк ≤ 1 (только админ, который
    тут же пересеется из ENV). Если 2+ — отказываемся, чтоб не потерять данные.
    """
    try:
        from sqlalchemy import inspect, text
        inspector = inspect(database.engine)
        actions = []

        # 1) Проверяем колонки users
        users_needs_drop = False
        users_needs_alter = []
        users_row_count = 0
        if inspector.has_table("users"):
            columns = {c["name"] for c in inspector.get_columns("users")}
            # Структурно обязательные — без них нужно дропать и пересоздавать
            required = {"id", "username", "password_hash", "role", "employee_id", "created_at"}
            missing = required - columns
            with database.engine.connect() as conn:
                users_row_count = conn.execute(text("SELECT COUNT(*) FROM users")).scalar() or 0
            if missing:
                users_needs_drop = True
                actions.append(f"users-cols-missing={sorted(missing)}")
            # Опциональные колонки которые можно добавить через ALTER без потери данных
            if "password_plaintext" not in columns:
                users_needs_alter.append("password_plaintext VARCHAR")

        # 2) Проверяем значения ENUM userrole
        enum_needs_drop = False
        try:
            with database.engine.connect() as conn:
                rows = conn.execute(text(
                    "SELECT enumlabel FROM pg_enum "
                    "JOIN pg_type ON pg_enum.enumtypid = pg_type.oid "
                    "WHERE pg_type.typname = 'userrole'"
                )).fetchall()
                existing_values = {r[0].lower() for r in rows}
                if existing_values and existing_values != {"admin", "employee"}:
                    enum_needs_drop = True
                    actions.append(f"userrole-enum-stale={sorted(existing_values)}")
        except Exception as e:
            actions.append(f"enum-check-error: {type(e).__name__}: {e}")

        # 3) Если структура в порядке — может быть только ALTER нужен
        if not users_needs_drop and not enum_needs_drop:
            if not users_needs_alter:
                return "schema OK"
            with database.engine.connect() as conn:
                for col_def in users_needs_alter:
                    conn.execute(text(f"ALTER TABLE users ADD COLUMN IF NOT EXISTS {col_def}"))
                    actions.append(f"altered-add-{col_def.split()[0]}")
                conn.commit()
            return "migration-applied: " + ", ".join(actions)

        # 4) Дропать users (или enum) — проверка чтобы не угробить данные
        if users_row_count > 1:
            return (
                f"REFUSED auto-drop: users has {users_row_count} rows, "
                f"manual migration needed. Actions wanted: {actions}"
            )

        # 5) Дропаем (затем create_all создаст с новой схемой включая password_plaintext)
        with database.engine.connect() as conn:
            conn.execute(text("DROP TABLE IF EXISTS users CASCADE"))
            actions.append("dropped-users")
            if enum_needs_drop:
                conn.execute(text("DROP TYPE IF EXISTS userrole CASCADE"))
                actions.append("dropped-userrole-enum")
            conn.commit()

        return "migration-applied: " + ", ".join(actions)
    except Exception as e:
        return f"migration-error: {type(e).__name__}: {e}"


# Сначала чиним старую таблицу users если осталась с прошлых попыток auth — потом create_all.
_USERS_MIGRATION_RESULT = _migrate_users_table_if_stale()

# Создаём таблицы в базе данных
models.Base.metadata.create_all(bind=database.engine)

# Создаём админ-пользователя из ENV-переменных (если ADMIN_USERNAME/ADMIN_PASSWORD заданы).
# На Vercel serverless startup-хуки не всегда срабатывают, поэтому сидим на module-level —
# выполнится при каждом cold-start. Идемпотентно: если админ уже есть, тихо выходит.
try:
    auth.seed_admin()
except Exception as _e:
    print(f"[seed_admin] {_e}")

# Инициализируем FastAPI приложение
app = FastAPI(
    title="Система учёта ЗП",
    description="Система учёта посещаемости и расчёта заработной платы",
    version="1.0.0"
)

# Настройка CORS для разрешения запросов с фронтенда
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # В продакшене укажите конкретный домен
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ========== КОНСТАНТЫ ДЛЯ РАСЧЁТА ЗАРПЛАТЫ ==========
STANDARD_WORKING_DAYS = 21  # Стандартное количество рабочих дней в месяце
STANDARD_HOURS_PER_DAY = 9  # Стандартное количество рабочих часов в день


# ========== КОРНЕВОЙ ЭНДПОИНТ ==========

@app.get("/")
def read_root():
    """Корневой эндпоинт - проверка работы API."""
    return {
        "message": "Система учёта заработной платы",
        "status": "работает",
        "version": "1.0.0"
    }


# ========== ЭНДПОИНТЫ ДЛЯ АУТЕНТИФИКАЦИИ ==========

def _user_to_public(user: models.User) -> dict:
    """Преобразует ORM-юзера в публичный словарь (без хеша пароля)."""
    return {
        "id": user.id,
        "username": user.username,
        "role": user.role.value,
        "employee_id": user.employee_id,
    }


# ========== ЛОГИРОВАНИЕ АКТИВНОСТИ КАБИНЕТА ==========

# Дедуп: не логируем одно и то же событие от того же юзера чаще раза в N минут
_ACTIVITY_DEDUP_MINUTES = 5

# Какие события дедуплицируем (login-события — никогда, надо знать каждую попытку)
_DEDUPED_EVENTS = {"view_profile", "view_calendar", "view_payroll", "view_transactions"}


def _client_ip(request: Request) -> Optional[str]:
    """Реальный IP клиента (за прокси Vercel — в X-Forwarded-For)."""
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd:
        return fwd.split(",")[0].strip()
    if request.client:
        return request.client.host
    return None


def _log_cabinet_event(
    db: Session,
    request: Request,
    event_type: str,
    user: Optional[models.User] = None,
    username_attempted: Optional[str] = None,
):
    """Пишет запись в cabinet_activity_logs. Не валит запрос если запись не удалась."""
    try:
        # Дедуп для view_* — пропускаем если такое же было меньше N минут назад от того же юзера
        if user and event_type in _DEDUPED_EVENTS:
            cutoff = datetime.now(timezone.utc) - timedelta(minutes=_ACTIVITY_DEDUP_MINUTES)
            recent = db.query(models.CabinetActivityLog).filter(
                models.CabinetActivityLog.user_id == user.id,
                models.CabinetActivityLog.event_type == event_type,
                models.CabinetActivityLog.timestamp > cutoff,
            ).first()
            if recent:
                return

        emp_name = None
        if user and user.employee_id:
            emp = crud.get_employee(db, user.employee_id)
            if emp:
                emp_name = emp.name

        log = models.CabinetActivityLog(
            user_id=user.id if user else None,
            employee_id=user.employee_id if user else None,
            role=user.role.value if user else None,
            username_attempted=username_attempted,
            employee_name=emp_name,
            event_type=event_type,
            ip_address=_client_ip(request),
            user_agent=(request.headers.get("user-agent") or None),
        )
        db.add(log)
        db.commit()
    except Exception:
        db.rollback()


@app.post("/api/auth/login", response_model=schemas.TokenResponse)
def login(
    payload: schemas.LoginRequest,
    request: Request,
    db: Session = Depends(database.get_db),
):
    """Логин по username/password. Возвращает JWT-токен и данные пользователя."""
    user = db.query(models.User).filter(models.User.username == payload.username).first()
    if not user or not auth.verify_password(payload.password, user.password_hash):
        _log_cabinet_event(db, request, "login_failed", username_attempted=payload.username)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный логин или пароль",
        )
    _log_cabinet_event(db, request, "login_success", user=user)
    token = auth.create_access_token(user.id)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": _user_to_public(user),
    }


@app.get("/api/auth/me", response_model=schemas.UserPublic)
def get_me(current_user: models.User = Depends(auth.get_current_user)):
    """Текущий пользователь (по JWT-токену из Authorization-заголовка)."""
    return _user_to_public(current_user)


@app.get("/api/auth/status")
def auth_status():
    """Bullet-proof диагностика. Каждый чек обёрнут в try/except, никогда не возвращает 500."""
    result = {
        "imports_ok": True,
        "users_migration_result": _USERS_MIGRATION_RESULT,
        "admin_username_env_set": False,
        "admin_username_env": None,
        "admin_password_env_set": False,
        "jwt_secret_env_set": False,
        "db_connect_ok": None,
        "users_table_exists": None,
        "admin_user_in_db": None,
        "seed_attempted_now": None,
        "seed_error": None,
        "errors": [],
    }

    # ENV-переменные
    try:
        admin_username = os.getenv("ADMIN_USERNAME")
        admin_password = os.getenv("ADMIN_PASSWORD")
        jwt_secret = os.getenv("JWT_SECRET")
        result["admin_username_env_set"] = bool(admin_username)
        result["admin_username_env"] = admin_username or None
        result["admin_password_env_set"] = bool(admin_password)
        result["jwt_secret_env_set"] = bool(jwt_secret) and jwt_secret != "dev-only-change-me-in-production"
    except Exception as e:
        result["errors"].append(f"env: {type(e).__name__}: {e}")

    # Подключение к БД + наличие таблицы users
    db = None
    try:
        db = database.SessionLocal()
        # пингуем коннект
        db.execute(__import__('sqlalchemy').text("SELECT 1"))
        result["db_connect_ok"] = True
        # пробуем создать таблицы (идемпотентно) — если User таблицы не было, создастся
        try:
            models.Base.metadata.create_all(bind=database.engine)
        except Exception as e:
            result["errors"].append(f"create_all: {type(e).__name__}: {e}")
        # проверяем что users существует
        try:
            count = db.query(models.User).count()
            result["users_table_exists"] = True
            result["users_total"] = count
        except Exception as e:
            result["users_table_exists"] = False
            result["errors"].append(f"users_query: {type(e).__name__}: {e}")
        # есть ли админ
        try:
            if admin_username:
                exists = db.query(models.User).filter(models.User.username == admin_username).first() is not None
                result["admin_user_in_db"] = exists
        except Exception as e:
            result["errors"].append(f"admin_lookup: {type(e).__name__}: {e}")
    except Exception as e:
        result["db_connect_ok"] = False
        result["errors"].append(f"db_connect: {type(e).__name__}: {e}")
    finally:
        if db is not None:
            try:
                db.close()
            except Exception:
                pass

    # Триггерим сид ещё раз
    try:
        auth.seed_admin()
        result["seed_attempted_now"] = True
        # перепроверяем после сида
        try:
            db2 = database.SessionLocal()
            if admin_username:
                result["admin_user_in_db_after_seed"] = (
                    db2.query(models.User).filter(models.User.username == admin_username).first() is not None
                )
            db2.close()
        except Exception:
            pass
    except Exception as e:
        result["seed_attempted_now"] = False
        result["seed_error"] = f"{type(e).__name__}: {e}"

    return result


# ========== ЛИЧНЫЙ КАБИНЕТ СОТРУДНИКА (read-only) ==========
# Все /api/me/* берут employee_id из JWT — сотрудник видит только своё.

def _resolve_my_employee(
    current_user: models.User,
    db: Session,
) -> models.Employee:
    """Хелпер (не Depends): резолвит сотрудника привязанного к текущему юзеру-кабинету."""
    employee = crud.get_employee(db, current_user.employee_id)
    if not employee:
        raise HTTPException(status_code=404, detail="Профиль сотрудника не найден")
    return employee


@app.get("/api/me/profile", response_model=schemas.Employee)
def get_my_profile(
    request: Request,
    current_user: models.User = Depends(auth.require_employee),
    db: Session = Depends(database.get_db),
):
    """Профиль текущего сотрудника."""
    employee = _resolve_my_employee(current_user, db)
    _log_cabinet_event(db, request, "view_profile", user=current_user)
    return employee


@app.get("/api/me/attendance", response_model=List[schemas.JournalEntry])
def get_my_attendance(
    request: Request,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: models.User = Depends(auth.require_employee),
    db: Session = Depends(database.get_db),
):
    """Календарь посещаемости текущего сотрудника за период (по умолчанию — текущий месяц)."""
    employee = _resolve_my_employee(current_user, db)
    _log_cabinet_event(db, request, "view_calendar", user=current_user)
    if start_date is None or end_date is None:
        now = datetime.now()
        start_date = now.strftime("%Y-%m-01")
        last_day = calendar.monthrange(now.year, now.month)[1]
        end_date = now.strftime(f"%Y-%m-{last_day:02d}")

    records = db.query(models.Attendance).filter(
        models.Attendance.employee_id == employee.id,
        models.Attendance.date >= start_date,
        models.Attendance.date <= end_date,
    ).order_by(models.Attendance.date.desc()).all()

    result = []
    for record in records:
        total_hours = None
        if record.out_time:
            total_hours = crud.calculate_duration(record.in_time, record.out_time)

        in_time_str = record.in_time.strftime("%H:%M") if record.in_time else None
        out_time_str = record.out_time.strftime("%H:%M") if record.out_time else None

        result.append({
            "id": record.id,
            "date": record.date,
            "employee_name": employee.name,
            "in_time": in_time_str,
            "out_time": out_time_str,
            "total_hours": total_hours,
        })
    return result


@app.get("/api/me/payroll", response_model=schemas.PayrollCalculation)
def get_my_payroll(
    request: Request,
    month: Optional[str] = None,  # YYYY-MM, по умолчанию — текущий
    current_user: models.User = Depends(auth.require_employee),
    db: Session = Depends(database.get_db),
):
    """Расчёт зарплаты текущего сотрудника за месяц."""
    employee = _resolve_my_employee(current_user, db)
    _log_cabinet_event(db, request, "view_payroll", user=current_user)
    if month is None:
        month = crud.get_current_month_str()
    return _compute_payroll(db, employee, month)


@app.get("/api/me/transactions", response_model=List[schemas.FinancialTransaction])
def get_my_transactions(
    request: Request,
    month: Optional[str] = None,  # YYYY-MM фильтр (опционально)
    current_user: models.User = Depends(auth.require_employee),
    db: Session = Depends(database.get_db),
):
    """Финансовые транзакции (премии/авансы/штрафы/очки) текущего сотрудника."""
    employee = _resolve_my_employee(current_user, db)
    _log_cabinet_event(db, request, "view_transactions", user=current_user)
    if month:
        return crud.get_transactions_by_employee_and_month(db, employee.id, month)
    return db.query(models.FinancialTransaction).filter(
        models.FinancialTransaction.employee_id == employee.id
    ).order_by(models.FinancialTransaction.date.desc()).all()


# ========== ЭНДПОИНТЫ ДЛЯ СОТРУДНИКОВ ==========

@app.get("/api/employees", response_model=List[schemas.Employee])
def get_employees(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(database.get_db),
    _admin: models.User = Depends(auth.require_admin),
):
    """Получить список всех сотрудников."""
    employees = crud.get_employees(db, skip=skip, limit=limit)
    return employees


@app.get("/api/employees/{employee_id}", response_model=schemas.Employee)
def get_employee(
    employee_id: int,
    db: Session = Depends(database.get_db),
    _admin: models.User = Depends(auth.require_admin),
):
    """Получить сотрудника по ID."""
    employee = crud.get_employee(db, employee_id=employee_id)
    if employee is None:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")
    return employee


@app.post("/api/employees", response_model=schemas.Employee, status_code=status.HTTP_201_CREATED)
def create_employee(
    employee: schemas.EmployeeCreate,
    db: Session = Depends(database.get_db),
    _admin: models.User = Depends(auth.require_admin),
):
    """Создать нового сотрудника."""
    return crud.create_employee(db=db, employee=employee)


@app.put("/api/employees/{employee_id}", response_model=schemas.Employee)
def update_employee(
    employee_id: int,
    employee: schemas.EmployeeUpdate,
    db: Session = Depends(database.get_db),
    _admin: models.User = Depends(auth.require_admin),
):
    """Обновить данные сотрудника."""
    db_employee = crud.update_employee(db, employee_id=employee_id, employee=employee)
    if db_employee is None:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")
    return db_employee


@app.delete("/api/employees/{employee_id}")
def delete_employee(
    employee_id: int,
    db: Session = Depends(database.get_db),
    _admin: models.User = Depends(auth.require_admin),
):
    """Удалить сотрудника."""
    success = crud.delete_employee(db, employee_id=employee_id)
    if not success:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")
    return {"message": "Сотрудник удалён"}


# ========== ЭНДПОИНТЫ ДЛЯ УПРАВЛЕНИЯ КАБИНЕТАМИ СОТРУДНИКОВ ==========

@app.post("/api/employees/{employee_id}/account", response_model=schemas.UserPublic, status_code=status.HTTP_201_CREATED)
def create_employee_account(
    employee_id: int,
    payload: schemas.CreateEmployeeAccountRequest,
    db: Session = Depends(database.get_db),
    _admin: models.User = Depends(auth.require_admin),
):
    """Создать личный кабинет для сотрудника. Логин/пароль вводит админ."""
    employee = crud.get_employee(db, employee_id)
    if not employee:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")

    if employee.user is not None:
        raise HTTPException(status_code=409, detail="У сотрудника уже есть кабинет")

    existing = db.query(models.User).filter(models.User.username == payload.username).first()
    if existing:
        raise HTTPException(status_code=409, detail="Этот логин уже занят")

    user = models.User(
        username=payload.username,
        password_hash=auth.hash_password(payload.password),
        password_plaintext=payload.password,
        role=models.UserRole.EMPLOYEE,
        employee_id=employee_id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return _user_to_public(user)


@app.put("/api/employees/{employee_id}/account", response_model=schemas.UserPublic)
def update_employee_account(
    employee_id: int,
    payload: schemas.UpdateEmployeeAccountRequest,
    db: Session = Depends(database.get_db),
    _admin: models.User = Depends(auth.require_admin),
):
    """Изменить логин и/или пароль кабинета сотрудника."""
    employee = crud.get_employee(db, employee_id)
    if not employee:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")
    if employee.user is None:
        raise HTTPException(status_code=404, detail="У сотрудника нет кабинета")

    user = employee.user

    if payload.username is not None and payload.username != user.username:
        clash = db.query(models.User).filter(
            models.User.username == payload.username,
            models.User.id != user.id,
        ).first()
        if clash:
            raise HTTPException(status_code=409, detail="Этот логин уже занят")
        user.username = payload.username

    if payload.password is not None:
        user.password_hash = auth.hash_password(payload.password)
        user.password_plaintext = payload.password

    db.commit()
    db.refresh(user)
    return _user_to_public(user)


@app.delete("/api/employees/{employee_id}/account")
def delete_employee_account(
    employee_id: int,
    db: Session = Depends(database.get_db),
    _admin: models.User = Depends(auth.require_admin),
):
    """Удалить личный кабинет сотрудника (сотрудник остаётся, удаляется только аккаунт)."""
    employee = crud.get_employee(db, employee_id)
    if not employee:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")
    if employee.user is None:
        raise HTTPException(status_code=404, detail="У сотрудника нет кабинета")

    db.delete(employee.user)
    db.commit()
    return {"message": "Кабинет удалён"}


# ========== ЭНДПОИНТЫ ДЛЯ ПОСЕЩАЕМОСТИ (ЖУРНАЛ) ==========

@app.get("/api/attendance/today", response_model=List[schemas.AttendanceWithEmployee])
def get_today_attendance(
    db: Session = Depends(database.get_db),
    _admin: models.User = Depends(auth.require_admin),
):
    """Получить все записи посещаемости за сегодня."""
    today = crud.get_current_date_str()
    attendance_records = crud.get_attendance_by_date(db, today)

    # Добавляем имя сотрудника к каждой записи
    result = []
    for record in attendance_records:
        result.append({
            "id": record.id,
            "employee_id": record.employee_id,
            "date": record.date,
            "in_time": record.in_time,
            "out_time": record.out_time,
            "employee_name": record.employee.name
        })
    return result


@app.get("/api/attendance/journal", response_model=List[schemas.JournalEntry])
def get_attendance_journal(
    start_date: str = None,
    end_date: str = None,
    db: Session = Depends(database.get_db),
    _admin: models.User = Depends(auth.require_admin),
):
    """
    Получить журнал посещаемости за период.

    Если даты не указаны - возвращает за последние 30 дней.
    """
    if start_date is None:
        # По умолчанию - последние 30 дней
        from datetime import timedelta
        end = datetime.now()
        start = end - timedelta(days=30)
        start_date = start.strftime("%Y-%m-%d")
        end_date = end.strftime("%Y-%m-%d")

    attendance_records = crud.get_attendance_range(db, start_date, end_date)

    # Формируем записи журнала
    result = []
    for record in attendance_records:
        total_hours = None
        if record.out_time:
            total_hours = crud.calculate_duration(record.in_time, record.out_time)

        # Форматируем время для отображения (все datetime объекты хранятся как naive UTC)
        in_time_str = record.in_time.strftime("%H:%M") if record.in_time else None
        out_time_str = record.out_time.strftime("%H:%M") if record.out_time else None

        result.append({
            "id": record.id,
            "date": record.date,
            "employee_name": record.employee.name if record.employee else "Неизвестная карта",
            "in_time": in_time_str,
            "out_time": out_time_str,
            "total_hours": total_hours
        })
    return result


@app.get("/api/attendance/latest", response_model=schemas.LatestAttendanceResponse)
def get_latest_attendance(
    _admin: models.User = Depends(auth.require_admin),
):
    """
    Получить ID недавно считанной неизвестной карты из временной памяти.
    Это используется при регистрации новых сотрудников.
    После прочтения значение в памяти очищается.
    """
    global latest_scanned_card
    if not latest_scanned_card:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Свежих сканирований не найдено"
        )
    
    card_id = latest_scanned_card
    latest_scanned_card = None # Очищаем память после успешного получения
    
    return {
        "card_id": card_id
    }


@app.put("/api/attendance/{attendance_id}")
def update_attendance_record(
    attendance_id: int,
    attendance_update: schemas.AttendanceUpdate,
    db: Session = Depends(database.get_db),
    _admin: models.User = Depends(auth.require_admin),
):
    """Обновить запись посещаемости (для ручного исправления)."""
    attendance = crud.update_attendance(
        db,
        attendance_id,
        attendance_update
    )
    if attendance is None:
        raise HTTPException(status_code=404, detail="Запись не найдена")
    return {"message": "Запись обновлена"}


@app.delete("/api/attendance/{attendance_id}")
def delete_attendance_record(
    attendance_id: int,
    db: Session = Depends(database.get_db),
    _admin: models.User = Depends(auth.require_admin),
):
    """Удалить запись посещаемости."""
    success = crud.delete_attendance(db, attendance_id)
    if not success:
        raise HTTPException(status_code=404, detail="Запись не найдена")
    return {"message": "Запись удалена"}


@app.post("/api/attendance", response_model=schemas.Attendance, status_code=status.HTTP_201_CREATED)
def create_attendance_record(
    attendance: schemas.AttendanceCreate,
    db: Session = Depends(database.get_db),
    _admin: models.User = Depends(auth.require_admin),
):
    """Создать запись посещаемости (для ручного ввода в журнале)."""
    return crud.create_attendance(db=db, attendance=attendance)


def _write_log(db: Session, *, card_id: str, scan_timestamp, employee, status_str: str, result: str, message: str):
    """Пишет запись в журнал сканирований. Не падает, если запись не удалась."""
    try:
        log = models.AttendanceLog(
            card_id=card_id,
            scan_timestamp=scan_timestamp,
            employee_id=employee.id if employee else None,
            employee_name=employee.name if employee else None,
            status=status_str,
            result=result,
            message=message,
        )
        db.add(log)
        db.commit()
    except Exception:
        db.rollback()


@app.post("/api/attendance/scan", status_code=status.HTTP_200_OK)
def scan_card_for_attendance(
    request: schemas.CardScanRequest,
    db: Session = Depends(database.get_db)
):
    """
    Обработка сканирования карты доступа для отметки прихода/ухода.
    Поддерживает передачу явного времени сканирования (для офлайн режима).
    """
    global latest_scanned_card
    card_id = request.card_id
    employee = crud.get_employee_by_card(db, card_id)

    # Используем переданное время или текущее
    now = request.timestamp if request.timestamp else datetime.now()

    # Если в БД используются naive datetime, конвертируем
    if now.tzinfo is not None:
        now = now.replace(tzinfo=None)

    today_str = now.strftime("%Y-%m-%d")

    if not employee:
        # Для режима добавления новых сотрудников: временно сохраняем ID карты в памяти
        latest_scanned_card = card_id
        _write_log(db, card_id=card_id, scan_timestamp=now, employee=None,
                   status_str="unknown_card", result="warning",
                   message=f"Карта {card_id} не привязана ни к одному сотруднику")
        return {"status": "unknown_card_stored", "card_id": card_id, "time": now}

    # Ищем существующую запись за дату сканирования
    attendance_record = crud.get_attendance_by_employee_and_date(db, employee.id, today_str)

    if attendance_record:
        # Проверка на точный дубликат (сетевая переотправка при обрыве связи)
        # Если время совпадает (абсолютно равно) с in_time или out_time
        if (attendance_record.in_time and now == attendance_record.in_time) or \
           (attendance_record.out_time and now == attendance_record.out_time):
            _write_log(db, card_id=card_id, scan_timestamp=now, employee=employee,
                       status_str="duplicate", result="warning",
                       message="Точный дубликат - такой скан уже был принят ранее")
            return {
                "status": "duplicate",
                "employee_name": employee.name,
                "time": now,
                "message": "Скан уже принят ранее"
            }

    if not attendance_record:
        # Сценарий A: Приход (первое сканирование за день)
        new_attendance = schemas.AttendanceCreate(
            employee_id=employee.id,
            date=today_str,
            in_time=now,
            out_time=None
        )
        created_record = crud.create_attendance(db, new_attendance)
        _write_log(db, card_id=card_id, scan_timestamp=now, employee=employee,
                   status_str="checked_in", result="success",
                   message=f"Приход в {now.strftime('%H:%M:%S')}")
        return {"status": "checked_in", "employee_name": employee.name, "time": now}

    # Если запись есть, проверяем уход
    if attendance_record.out_time is None:
        # Сценарий B: Уход
        # Проверка на двойное сканирование (debounce)
        time_diff = now - attendance_record.in_time
        if time_diff.total_seconds() < 60:
            in_str = attendance_record.in_time.strftime('%H:%M:%S')
            new_str = now.strftime('%H:%M:%S')
            _write_log(db, card_id=card_id, scan_timestamp=now, employee=employee,
                       status_str="debounced", result="warning",
                       message=f"Игнор: скан в {new_str} слишком близко к приходу в {in_str} (разница {time_diff.total_seconds():.0f} сек, минимум 60)")
            return {"status": "debounced", "reason": "scanned too soon after check-in"}

        attendance_record.out_time = now
        db.commit()
        db.refresh(attendance_record)
        _write_log(db, card_id=card_id, scan_timestamp=now, employee=employee,
                   status_str="checked_out", result="success",
                   message=f"Уход в {now.strftime('%H:%M:%S')} (отработано {time_diff.total_seconds()/3600:.2f} ч)")
        return {"status": "checked_out", "employee_name": employee.name, "time": now}
    else:
        # Сценарий C: Перезапись времени ухода
        time_diff = now - attendance_record.out_time
        if time_diff.total_seconds() < 60:
            old_str = attendance_record.out_time.strftime('%H:%M:%S')
            new_str = now.strftime('%H:%M:%S')
            _write_log(db, card_id=card_id, scan_timestamp=now, employee=employee,
                       status_str="debounced", result="warning",
                       message=f"Игнор: скан в {new_str} слишком близко к предыдущему уходу в {old_str} (разница {time_diff.total_seconds():.0f} сек, минимум 60)")
            return {"status": "debounced", "reason": "scanned too soon after previous check-out"}

        attendance_record.out_time = now
        db.commit()
        db.refresh(attendance_record)
        _write_log(db, card_id=card_id, scan_timestamp=now, employee=employee,
                   status_str="re_checked_out", result="success",
                   message=f"Уход переписан на {now.strftime('%H:%M:%S')}")
        return {"status": "re_checked_out", "employee_name": employee.name, "time": now}





@app.post("/api/attendance/bulk-scan", status_code=status.HTTP_200_OK)
def bulk_scan_cards_for_attendance(
    request: schemas.BulkScanRequest,
    db: Session = Depends(database.get_db)
):
    """
    Массовая обработка сканирований (для загрузки кэшированных офлайн сканов).
    """
    results = []
    processed_count = 0
    errors_count = 0

    # Сортируем сканы по времени, чтобы гарантировать правильную последовательность прихода/ухода
    sorted_scans = sorted(
        request.scans, 
        key=lambda x: x.timestamp if x.timestamp else datetime.min
    )

    for scan in sorted_scans:
        try:
            res = scan_card_for_attendance(scan, db)
            results.append({"card_id": scan.card_id, "status": res.get("status")})
            processed_count += 1
        except HTTPException as e:
            # ИСПРАВЛЕНО: откатываем "сломанную" сессию, иначе все следующие сканы в пачке падают
            db.rollback()
            _write_log(db, card_id=scan.card_id, scan_timestamp=scan.timestamp, employee=None,
                       status_str="error", result="error",
                       message=f"HTTP {e.status_code}: {e.detail}")
            results.append({"card_id": scan.card_id, "error": e.detail})
            errors_count += 1
        except Exception as e:
            db.rollback()
            _write_log(db, card_id=scan.card_id, scan_timestamp=scan.timestamp, employee=None,
                       status_str="error", result="error",
                       message=f"Внутренняя ошибка сервера: {type(e).__name__}: {str(e)[:200]}")
            results.append({"card_id": scan.card_id, "error": str(e)})
            errors_count += 1

    # Если хоть один скан упал — отвечаем 207 (а не 200), чтобы сканер НЕ удалил эти записи
    # и попробовал отправить их позже.
    if errors_count > 0 and processed_count == 0:
        # Все скансы провалились -> 500, чтобы сканер сохранил всё
        raise HTTPException(status_code=500, detail={"processed": 0, "errors": errors_count, "details": results})

    return {
        "processed": processed_count,
        "errors": errors_count,
        "details": results
    }


# ========== ЭНДПОИНТЫ ДЛЯ ЛОГОВ СКАНИРОВАНИЙ ==========

@app.get("/api/scan-logs", response_model=List[schemas.AttendanceLogEntry])
def get_scan_logs(
    result: Optional[str] = None,  # 'success', 'warning', 'error' или None (всё)
    limit: int = 200,
    db: Session = Depends(database.get_db),
    _admin: models.User = Depends(auth.require_admin),
):
    """
    Получить логи сканирований (для страницы Логи в админке).

    Параметры:
    - result: фильтр по результату ('success', 'warning', 'error')
    - limit: максимум записей (по умолчанию 200)
    """
    query = db.query(models.AttendanceLog)
    if result:
        query = query.filter(models.AttendanceLog.result == result)
    logs = query.order_by(models.AttendanceLog.received_at.desc()).limit(limit).all()
    return logs


@app.delete("/api/scan-logs")
def clear_scan_logs(
    older_than_days: Optional[int] = None,
    db: Session = Depends(database.get_db),
    _admin: models.User = Depends(auth.require_admin),
):
    """
    Очистить логи. Если передан older_than_days — удаляет старше N дней. Иначе все.
    """
    if older_than_days is not None:
        cutoff = datetime.now() - timedelta(days=older_than_days)
        deleted = db.query(models.AttendanceLog).filter(
            models.AttendanceLog.received_at < cutoff
        ).delete()
    else:
        deleted = db.query(models.AttendanceLog).delete()
    db.commit()
    return {"deleted": deleted}


# ========== ЭНДПОИНТЫ ДЛЯ ЛОГА АКТИВНОСТИ КАБИНЕТА ==========

@app.get("/api/cabinet-activity", response_model=List[schemas.CabinetActivityEntry])
def get_cabinet_activity(
    event_type: Optional[str] = None,
    employee_id: Optional[int] = None,
    role: Optional[str] = None,  # 'admin' | 'employee'
    limit: int = 300,
    db: Session = Depends(database.get_db),
    _admin: models.User = Depends(auth.require_admin),
):
    """Логи активности кабинета: логины + просмотры разделов кабинета."""
    query = db.query(models.CabinetActivityLog)
    if event_type:
        query = query.filter(models.CabinetActivityLog.event_type == event_type)
    if employee_id is not None:
        query = query.filter(models.CabinetActivityLog.employee_id == employee_id)
    if role:
        query = query.filter(models.CabinetActivityLog.role == role)
    return query.order_by(models.CabinetActivityLog.timestamp.desc()).limit(limit).all()


@app.delete("/api/cabinet-activity")
def clear_cabinet_activity(
    older_than_days: Optional[int] = None,
    db: Session = Depends(database.get_db),
    _admin: models.User = Depends(auth.require_admin),
):
    """Очистить лог активности. older_than_days — удаляет старше N дней. Иначе всё."""
    if older_than_days is not None:
        cutoff = datetime.now(timezone.utc) - timedelta(days=older_than_days)
        deleted = db.query(models.CabinetActivityLog).filter(
            models.CabinetActivityLog.timestamp < cutoff
        ).delete()
    else:
        deleted = db.query(models.CabinetActivityLog).delete()
    db.commit()
    return {"deleted": deleted}


# ========== ЭНДПОИНТЫ ДЛЯ РАСЧЁТА ЗАРПЛАТЫ ==========

def _compute_payroll(db: Session, employee: models.Employee, month: str) -> dict:
    """Чистая функция расчёта зарплаты — без HTTP/auth-логики.

    Используется и админским эндпоинтом, и /api/me/payroll сотрудника.

    ФОРМУЛА (почасовая):
        Hourly Rate = Monthly Rate / (21 days × 9 hours)
        Base Pay    = Hourly Rate × Total Hours Worked
        Total Pay   = Base Pay + (Points × Point Value) + Bonuses − Advances − Fines
    """
    # ===== ЛОГИКА СНИМКОВ (SNAPSHOTS) =====
    snapshot = db.query(models.SalarySnapshot).filter(
        models.SalarySnapshot.employee_id == employee.id,
        models.SalarySnapshot.month == month
    ).first()

    if not snapshot:
        try:
            snapshot = models.SalarySnapshot(
                employee_id=employee.id,
                month=month,
                salary_rate=employee.rate,
                point_rate=employee.point_val
            )
            db.add(snapshot)
            db.commit()
            db.refresh(snapshot)
        except IntegrityError:
            db.rollback()
            snapshot = db.query(models.SalarySnapshot).filter(
                models.SalarySnapshot.employee_id == employee.id,
                models.SalarySnapshot.month == month
            ).one()

    # Транзакции за месяц
    transactions = crud.get_transactions_by_employee_and_month(db, employee.id, month)

    total_points = 0.0
    bonuses_total = 0.0
    advances_total = 0.0
    fines_total = 0.0
    details = []

    for trans in transactions:
        detail = {
            "type": trans.type.value,
            "amount": trans.amount,
            "points": trans.points_count,
            "comment": trans.comment,
            "date": trans.date
        }

        if trans.type == models.TransactionType.POINTS:
            total_points += (trans.points_count or 0)
            detail["points"] = trans.points_count
        elif trans.type == models.TransactionType.BONUS:
            bonuses_total += trans.amount
        elif trans.type == models.TransactionType.ADVANCE:
            advances_total += trans.amount
        elif trans.type == models.TransactionType.FINE:
            fines_total += trans.amount

        details.append(detail)

    hourly_rate = snapshot.salary_rate / (STANDARD_WORKING_DAYS * STANDARD_HOURS_PER_DAY)

    [year, month_num] = month.split('-')
    start_date = f"{year}-{month_num}-01"
    last_day = calendar.monthrange(int(year), int(month_num))[1]
    end_date = f"{year}-{month_num}-{last_day:02d}"

    attendance_records = crud.get_attendance_range(db, start_date, end_date)

    total_hours_worked = 0.0
    for record in attendance_records:
        if record.employee_id == employee.id and record.out_time:
            duration = crud.calculate_duration(record.in_time, record.out_time)
            if duration:
                total_hours_worked += duration

    base_pay = hourly_rate * total_hours_worked
    piecework_sum = total_points * snapshot.point_rate
    to_pay = base_pay + piecework_sum + bonuses_total - advances_total - fines_total

    return {
        "employee_id": employee.id,
        "employee_name": employee.name,
        "month": month,
        "base_rate": round(base_pay, 2),
        "hourly_rate": round(hourly_rate, 2),
        "total_hours_worked": round(total_hours_worked, 2),
        "total_points": round(total_points, 2),
        "piecework_sum": round(piecework_sum, 2),
        "bonuses_total": round(bonuses_total, 2),
        "advances_total": round(advances_total, 2),
        "fines_total": round(fines_total, 2),
        "to_pay": round(to_pay, 2),
        "details": details,
        "salary_rate_used": snapshot.salary_rate,
        "point_rate_used": snapshot.point_rate,
        "is_closed": crud.is_month_closed(db, month),
    }


@app.get("/api/payroll/{employee_id}", response_model=schemas.PayrollCalculation)
def calculate_payroll(
    employee_id: int,
    month: str = None,  # Формат: YYYY-MM
    db: Session = Depends(database.get_db),
    _admin: models.User = Depends(auth.require_admin),
):
    """Рассчитать зарплату сотрудника за месяц (для админа)."""
    employee = crud.get_employee(db, employee_id)
    if not employee:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")

    if month is None:
        month = crud.get_current_month_str()

    return _compute_payroll(db, employee, month)


@app.post("/api/transactions", response_model=schemas.FinancialTransaction, status_code=status.HTTP_201_CREATED)
def create_transaction(
    transaction: schemas.FinancialTransactionCreate,
    db: Session = Depends(database.get_db),
    _admin: models.User = Depends(auth.require_admin),
):
    """
    Создать финансовую транзакцию (премия, аванс, штраф, сдельная работа).

    Для типа POINTS:
    - amount вычисляется автоматически как points_count × employee.point_value
    - необходимо указать points_count
    """
    employee = crud.get_employee(db, transaction.employee_id)
    if not employee:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")

    _ensure_month_open(db, crud.month_from_date_str(transaction.date))

    # Если это транзакция типа POINTS, вычисляем amount автоматически
    if transaction.type == models.TransactionType.POINTS:
        if transaction.points_count is None or transaction.points_count <= 0:
            raise HTTPException(
                status_code=400,
                detail="Для сдельной работы необходимо указать количество очков"
            )
        # Вычисляем сумму автоматически
        calculated_amount = transaction.points_count * employee.point_val

        # Создаём транзакцию с вычисленной суммой
        transaction_data = schemas.FinancialTransactionCreate(
            employee_id=transaction.employee_id,
            type=transaction.type,
            amount=calculated_amount,
            points_count=transaction.points_count,
            comment=transaction.comment,
            date=transaction.date
        )
        return crud.create_transaction(db=db, transaction=transaction_data)

    # Для других типов используем переданный amount
    return crud.create_transaction(db=db, transaction=transaction)


@app.delete("/api/transactions/{transaction_id}")
def delete_transaction(
    transaction_id: int,
    db: Session = Depends(database.get_db),
    _admin: models.User = Depends(auth.require_admin),
):
    """Удалить транзакцию."""
    trans = db.query(models.FinancialTransaction).filter(
        models.FinancialTransaction.id == transaction_id
    ).first()
    if not trans:
        raise HTTPException(status_code=404, detail="Транзакция не найдена")
    _ensure_month_open(db, crud.month_from_date_str(trans.date))

    success = crud.delete_transaction(db, transaction_id)
    if not success:
        raise HTTPException(status_code=404, detail="Транзакция не найдена")
    return {"message": "Транзакция удалена"}


@app.get("/api/transactions/employee/{employee_id}", response_model=List[schemas.FinancialTransaction])
def get_employee_transactions(
    employee_id: int,
    month: str = None,  # Опциональный параметр для фильтрации по месяцу (YYYY-MM)
    db: Session = Depends(database.get_db),
    _admin: models.User = Depends(auth.require_admin),
):
    """Получить все транзакции сотрудника.
    
    Если указан параметр month (формат YYYY-MM), возвращаются только транзакции за этот месяц.
    """
    employee = crud.get_employee(db, employee_id)
    if not employee:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")

    if month:
        # Фильтруем транзакции по указанному месяцу
        transactions = crud.get_transactions_by_employee_and_month(db, employee_id, month)
    else:
        # Возвращаем все транзакции без фильтрации
        transactions = db.query(models.FinancialTransaction).filter(
            models.FinancialTransaction.employee_id == employee_id
        ).order_by(models.FinancialTransaction.date.desc()).all()
    return transactions


# ========== ЭНДПОИНТЫ ДЛЯ СМАРТ-НАСТРОЙКИ ==========

class AdjustHoursRequest(BaseModel):
    """Запрос на корректировку часов."""
    employee_id: int
    month: str  # Формат: YYYY-MM
    target_total_hours: float


class AdjustPointsRequest(BaseModel):
    """Запрос на корректировку очков."""
    employee_id: int
    month: str  # Формат: YYYY-MM
    target_points: float


@app.post("/api/payroll/adjust-hours")
def adjust_hours(
    request: AdjustHoursRequest,
    db: Session = Depends(database.get_db),
    _admin: models.User = Depends(auth.require_admin),
):
    """
    Умная корректировка часов сотрудника за месяц.

    Распределяет разницу часов пропорционально длительности смен.
    Длинные смены получают большую часть корректировки.
    """
    from datetime import timedelta

    employee = crud.get_employee(db, request.employee_id)
    if not employee:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")

    _ensure_month_open(db, request.month)

    # Получаем границы месяца
    [year, month_num] = request.month.split('-')
    start_date = f"{year}-{month_num}-01"
    last_day = calendar.monthrange(int(year), int(month_num))[1]
    end_date = f"{year}-{month_num}-{last_day:02d}"

    # Получаем все записи посещаемости сотрудника за месяц
    attendance_records = db.query(models.Attendance).filter(
        models.Attendance.employee_id == request.employee_id,
        models.Attendance.date >= start_date,
        models.Attendance.date <= end_date
    ).all()

    # Вычисляем текущее количество часов и собираем закрытые смены
    current_hours = 0.0
    closed_shifts = []  # Смены с out_time

    for record in attendance_records:
        if record.out_time:
            duration = crud.calculate_duration(record.in_time, record.out_time)
            if duration:
                current_hours += duration
                closed_shifts.append({
                    'record': record,
                    'duration': duration,
                    'duration_minutes': int(duration * 60)
                })

    # Вычисляем разницу
    diff_hours = request.target_total_hours - current_hours

    # Если разница negligible - выходим
    if abs(diff_hours) < 0.01:
        return {"message": "Корректировка не требуется", "adjusted_hours": 0.0}

    # Преобразуем в минуты
    diff_minutes = int(diff_hours * 60)

    if not closed_shifts:
        raise HTTPException(
            status_code=400,
            detail="Нет закрытых смен для корректировки"
        )

    # ПРОПОРЦИОНАЛЬНОЕ РАСПРЕДЕЛЕНИЕ
    # Вычисляем общий вес (сумма длительностей всех смен)
    total_weight = sum(shift['duration_minutes'] for shift in closed_shifts)

    if total_weight == 0:
        raise HTTPException(
            status_code=400,
            detail="Невозможно скорректировать часы: все закрытые смены имеют нулевую длительность."
        )

    # Распределяем минуты пропорционально весу каждой смены
    adjustments = []
    remaining_minutes = abs(diff_minutes)

    # Сортируем смены по длительности (для детерминированного распределения остатка)
    closed_shifts.sort(key=lambda x: x['duration_minutes'], reverse=True)

    for shift in closed_shifts:
        if remaining_minutes <= 0:
            adjustments.append(0)
            continue

        # Вычисляем долю этой смены
        weight_ratio = shift['duration_minutes'] / total_weight
        minutes_to_adjust = int(abs(diff_hours) * 60 * weight_ratio)

        # Округляем вниз и добавляем к списку
        adjustments.append(minutes_to_adjust)
        remaining_minutes -= minutes_to_adjust

    # Распределяем остаток (из-за округления) по самым длинным сменам
    for i in range(len(adjustments)):
        if remaining_minutes <= 0:
            break
        adjustments[i] += 1
        remaining_minutes -= 1

    # Применяем корректировки
    for i, shift in enumerate(closed_shifts):
        minutes_to_adjust = adjustments[i]
        if diff_minutes < 0:  # Если нужно уменьшить часы
            minutes_to_adjust = -minutes_to_adjust

        if minutes_to_adjust != 0:
            record = shift['record']
            old_out_time = record.out_time
            record.out_time = record.out_time + timedelta(minutes=minutes_to_adjust)

            # Проверки безопасности
            max_out_time = record.in_time + timedelta(hours=24)
            if record.out_time <= record.in_time:
                record.out_time = record.in_time + timedelta(minutes=15)
            elif record.out_time > max_out_time:
                record.out_time = max_out_time

    db.commit()

    return {
        "message": f"Часы скорректированы на {diff_hours:.2f} ч.",
        "previous_hours": round(current_hours, 2),
        "new_hours": round(request.target_total_hours, 2),
        "adjusted_records": len(closed_shifts),
        "distribution_method": "proportional_by_shift_duration"
    }


@app.post("/api/payroll/adjust-points")
def adjust_points(
    request: AdjustPointsRequest,
    db: Session = Depends(database.get_db),
    _admin: models.User = Depends(auth.require_admin),
):
    """
    Корректировка очков сотрудника за месяц.

    Создаёт транзакцию типа POINTS с разницей.
    """
    employee = crud.get_employee(db, request.employee_id)
    if not employee:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")

    _ensure_month_open(db, request.month)

    # Получаем текущие очки за месяц
    transactions = crud.get_transactions_by_employee_and_month(
        db, request.employee_id, request.month
    )

    current_points = 0.0
    for trans in transactions:
        if trans.type == models.TransactionType.POINTS:
            current_points += (trans.points_count or 0)

    # Вычисляем разницу
    diff_points = request.target_points - current_points

    if abs(diff_points) < 0.01:
        return {"message": "Корректировка не требуется", "adjusted_points": 0.0}

    # Создаём корректирующую транзакцию
    # Убираем abs() чтобы сохранить знак (плюс или минус)
    calculated_amount = diff_points * employee.point_val

    transaction_data = schemas.FinancialTransactionCreate(
        employee_id=request.employee_id,
        type=models.TransactionType.POINTS,
        amount=calculated_amount,
        points_count=diff_points, # Убираем abs()
        comment="Ручная корректировка",
        date=f"{request.month}-01"  # Первый день месяца
    )

    crud.create_transaction(db=db, transaction=transaction_data)

    return {
        "message": f"Очки скорректированы на {diff_points:.2f}",
        "previous_points": round(current_points, 2),
        "new_points": round(request.target_points, 2),
        "adjusted_points": round(diff_points, 2)
    }


# ========== АНАЛИТИКА ДЛЯ DASHBOARD ==========

@app.get("/api/dashboard/heatmap")
def dashboard_heatmap(
    month: str = None,  # YYYY-MM, по умолчанию — текущий месяц
    db: Session = Depends(database.get_db),
    _admin: models.User = Depends(auth.require_admin),
):
    """Heat-map: количество **приходов** (только in_time) по (день недели × час)
    за указанный месяц. Уходы не считаются — это отметки начала смены.
    """
    if not month:
        month = crud.get_current_month_str()
    [year, mn] = month.split('-')
    year, mn = int(year), int(mn)
    last_day = calendar.monthrange(year, mn)[1]
    start = datetime(year, mn, 1, 0, 0, 0)
    end = datetime(year, mn, last_day, 23, 59, 59)

    records = db.query(models.Attendance).filter(
        models.Attendance.in_time >= start,
        models.Attendance.in_time <= end,
    ).all()

    # weekday: 0=Mon..6=Sun
    matrix = [[0 for _ in range(24)] for _ in range(7)]
    total = 0
    for r in records:
        if not r.in_time:
            continue
        wd = r.in_time.weekday()
        h = r.in_time.hour
        matrix[wd][h] += 1
        total += 1

    return {
        "month": month,
        "total_scans": total,  # это число приходов за месяц (не приходов+уходов)
        "matrix": matrix,
    }


@app.get("/api/dashboard/payroll-trend")
def dashboard_payroll_trend(
    months: int = 6,
    db: Session = Depends(database.get_db),
    _admin: models.User = Depends(auth.require_admin),
):
    """ФОТ за последние N месяцев. По каждому месяцу — общая сумма к выплате
    и разбивка по сотрудникам (для drill-down модалки)."""
    months = max(1, min(months, 24))
    today = datetime.now()
    employees = crud.get_employees(db, skip=0, limit=10000)

    out = []
    for i in range(months):
        # i=0 — текущий месяц, i=months-1 — самый старый
        y = today.year
        m = today.month - i
        while m <= 0:
            m += 12
            y -= 1
        month_str = f"{y}-{m:02d}"
        to_pay_total = 0.0
        accrued_total = 0.0  # начислено: base + piecework + bonuses (без штрафов/авансов)
        breakdown = []
        for emp in employees:
            try:
                p = _compute_payroll(db, emp, month_str)
            except Exception:
                continue
            to_pay = float(p.get("to_pay", 0) or 0)
            accrued = (
                float(p.get("base_rate", 0) or 0)
                + float(p.get("piecework_sum", 0) or 0)
                + float(p.get("bonuses_total", 0) or 0)
            )
            to_pay_total += to_pay
            accrued_total += accrued
            breakdown.append({
                "employee_id": emp.id,
                "employee_name": emp.name,
                "to_pay": round(to_pay, 2),
                "accrued": round(accrued, 2),
                "hours": float(p.get("total_hours_worked", 0) or 0),
                "points": float(p.get("total_points", 0) or 0),
            })
        breakdown.sort(key=lambda x: x["accrued"], reverse=True)
        out.append({
            "month": month_str,
            "to_pay_total": round(to_pay_total, 2),
            "accrued_total": round(accrued_total, 2),
            "is_closed": crud.is_month_closed(db, month_str),
            "breakdown": breakdown,
        })
    out.reverse()  # хронологически — старые слева, новые справа
    return {"months": out}


@app.get("/api/dashboard/top-employees")
def dashboard_top_employees(
    month: str = None,
    db: Session = Depends(database.get_db),
    _admin: models.User = Depends(auth.require_admin),
):
    """Топы сотрудников за месяц: по часам, по очкам, по премиям, по штрафам.
    Возвращает по каждому критерию полный отсортированный список."""
    if not month:
        month = crud.get_current_month_str()
    employees = crud.get_employees(db, skip=0, limit=10000)
    rows = []
    for emp in employees:
        try:
            p = _compute_payroll(db, emp, month)
        except Exception:
            continue
        rows.append({
            "employee_id": emp.id,
            "employee_name": emp.name,
            "position": emp.position,
            "hours": round(float(p.get("total_hours_worked", 0) or 0), 2),
            "points": round(float(p.get("total_points", 0) or 0), 2),
            "bonuses": round(float(p.get("bonuses_total", 0) or 0), 2),
            "fines": round(float(p.get("fines_total", 0) or 0), 2),
            "to_pay": round(float(p.get("to_pay", 0) or 0), 2),
        })
    return {
        "month": month,
        "by_hours": sorted(rows, key=lambda x: x["hours"], reverse=True),
        "by_points": sorted(rows, key=lambda x: x["points"], reverse=True),
        "by_bonuses": sorted(rows, key=lambda x: x["bonuses"], reverse=True),
        "by_fines": sorted(rows, key=lambda x: x["fines"], reverse=True),
        "by_to_pay": sorted(rows, key=lambda x: x["to_pay"], reverse=True),
    }


@app.get("/api/dashboard/payroll-forecast")
def dashboard_payroll_forecast(
    month: str = None,
    db: Session = Depends(database.get_db),
    _admin: models.User = Depends(auth.require_admin),
):
    """Прогноз ФОТ: текущая сумма + линейная экстраполяция до конца месяца.

    Логика: считаем «темп» = текущая_сумма / прошедшие_рабочие_дни,
    прогноз = текущая_сумма + темп × оставшиеся_рабочие_дни.
    Премии/авансы/штрафы прогнозом не дополняются — экстраполируем только
    зарплатную часть (часы × ставка + сдельная)."""
    if not month:
        month = crud.get_current_month_str()
    [year, mn] = month.split('-')
    year, mn = int(year), int(mn)
    last_day = calendar.monthrange(year, mn)[1]
    today = datetime.now()
    is_current = (today.year == year and today.month == mn)
    day_today = today.day if is_current else last_day

    # Считаем прошедшие/оставшиеся рабочие дни (без выходных)
    elapsed_workdays = 0
    remaining_workdays = 0
    for d in range(1, last_day + 1):
        wd = datetime(year, mn, d).weekday()
        if wd < 5:  # пн-пт
            if d <= day_today:
                elapsed_workdays += 1
            else:
                remaining_workdays += 1

    employees = crud.get_employees(db, skip=0, limit=10000)
    current_to_pay = 0.0
    current_base = 0.0
    current_bonuses = 0.0
    current_advances = 0.0
    current_fines = 0.0
    current_piecework = 0.0
    for emp in employees:
        try:
            p = _compute_payroll(db, emp, month)
        except Exception:
            continue
        current_to_pay += float(p.get("to_pay", 0) or 0)
        current_base += float(p.get("base_rate", 0) or 0)
        current_bonuses += float(p.get("bonuses_total", 0) or 0)
        current_advances += float(p.get("advances_total", 0) or 0)
        current_fines += float(p.get("fines_total", 0) or 0)
        current_piecework += float(p.get("piecework_sum", 0) or 0)

    # Начислено — то, что заработали, без вычета авансов и штрафов.
    # Это «ФОТ» в традиционном смысле и не «съедается» когда раздал зарплату авансами.
    current_accrued = current_base + current_piecework + current_bonuses

    # Линейный прогноз (pace): масштабируем base + piecework по рабочим дням.
    # Премии в темп не входят — они разовые, но входят в current_accrued как есть.
    if elapsed_workdays > 0 and remaining_workdays > 0:
        rate_per_day = (current_base + current_piecework) / elapsed_workdays
        projected_extra = rate_per_day * remaining_workdays
    else:
        projected_extra = 0.0
    projected_to_pay = current_to_pay + projected_extra
    projected_accrued = current_accrued + projected_extra

    # ===== УМНЫЙ ПРОГНОЗ: блендинг между текущим темпом и историей =====
    # История = средний accrued за последние 3 ПОЛНЫХ месяца (только если они
    # уже прошли). Это страхует от перекосов в начале месяца — если 1-го числа
    # один человек случайно вышел на смену, наивный pace экстраполировал бы это
    # на всех; история «помнит» что обычно ФОТ ~Х ₴.
    HISTORY_MONTHS = 3
    history_samples = []
    cur_y, cur_m = year, mn
    for i in range(1, HISTORY_MONTHS + 1):
        hy, hm = cur_y, cur_m - i
        while hm <= 0:
            hm += 12
            hy -= 1
        # Не учитываем будущие месяцы (если is_current=False и пользователь смотрит прошлое)
        hist_month_str = f"{hy}-{hm:02d}"
        # Не берём текущий месяц или будущие в выборку истории
        if (hy, hm) >= (today.year, today.month):
            continue
        sample_total = 0.0
        for emp in employees:
            try:
                p = _compute_payroll(db, emp, hist_month_str)
                sample_total += (
                    float(p.get("base_rate", 0) or 0)
                    + float(p.get("piecework_sum", 0) or 0)
                    + float(p.get("bonuses_total", 0) or 0)
                )
            except Exception:
                continue
        if sample_total > 0:
            history_samples.append({"month": hist_month_str, "accrued": round(sample_total, 2)})

    history_avg = (
        sum(s["accrued"] for s in history_samples) / len(history_samples)
        if history_samples else None
    )

    # Блендинг: чем больше дней месяца прошло, тем больше доверяем pace.
    total_workdays = elapsed_workdays + remaining_workdays
    if is_current and total_workdays > 0 and history_avg is not None:
        weight_pace = elapsed_workdays / total_workdays
        smart_value = (weight_pace * projected_accrued) + ((1 - weight_pace) * history_avg)
        smart_forecast = {
            "value": round(smart_value, 2),
            "weight_pace": round(weight_pace, 3),
            "weight_history": round(1 - weight_pace, 3),
            "method": "blended",
            "pace_value": round(projected_accrued, 2),
            "history_value": round(history_avg, 2),
        }
    elif is_current:
        # Истории ещё нет — fallback на чистый pace
        smart_forecast = {
            "value": round(projected_accrued, 2),
            "weight_pace": 1.0,
            "weight_history": 0.0,
            "method": "pace_only",
            "pace_value": round(projected_accrued, 2),
            "history_value": None,
        }
    else:
        # Прошлый месяц — прогнозить нечего, итог = current_accrued
        smart_forecast = None

    return {
        "month": month,
        "is_current_month": is_current,
        "elapsed_workdays": elapsed_workdays,
        "remaining_workdays": remaining_workdays,
        "current": {
            "to_pay": round(current_to_pay, 2),
            "accrued": round(current_accrued, 2),
            "base_rate": round(current_base, 2),
            "piecework": round(current_piecework, 2),
            "bonuses": round(current_bonuses, 2),
            "advances": round(current_advances, 2),
            "fines": round(current_fines, 2),
        },
        "projected_to_pay": round(projected_to_pay, 2),
        "projected_accrued": round(projected_accrued, 2),
        "projected_extra": round(projected_extra, 2),
        "history": {
            "months_used": len(history_samples),
            "avg_accrued": round(history_avg, 2) if history_avg else 0.0,
            "samples": history_samples,
        },
        "smart_forecast": smart_forecast,
    }


# ========== ЗАКРЫТИЕ РАСЧЁТНОГО МЕСЯЦА ==========

@app.get("/api/payroll/months/closed", response_model=List[schemas.MonthClosure])
def list_closed_months(
    db: Session = Depends(database.get_db),
    _admin: models.User = Depends(auth.require_admin),
):
    """Список всех закрытых (зафиксированных) расчётных месяцев.

    Путь именно `/months/closed`, а не `/closed-months`, чтобы не конфликтовал
    с `/api/payroll/{employee_id}` (FastAPI пытался бы привести "closed-months"
    к int и возвращал 422).
    """
    return crud.get_closed_months(db)


@app.post("/api/payroll/months/{month}/close", response_model=schemas.MonthClosure)
def close_payroll_month(
    month: str,
    db: Session = Depends(database.get_db),
    admin: models.User = Depends(auth.require_admin),
):
    """Закрыть расчётный месяц.

    После закрытия запрещается:
      - создавать/удалять транзакции с датой этого месяца
      - корректировать часы или очки за этот месяц

    Идемпотентно: повторный вызов вернёт существующую запись.
    """
    if not month or len(month) != 7 or month[4] != '-':
        raise HTTPException(status_code=400, detail="Неверный формат месяца (ожидаю YYYY-MM)")

    # При закрытии гарантируем, что у каждого активного сотрудника есть SalarySnapshot
    # на этот месяц — иначе при изменении ставок в будущем расчёт «уехал» бы.
    employees = crud.get_employees(db, skip=0, limit=10000)
    for emp in employees:
        existing = (
            db.query(models.SalarySnapshot)
            .filter(
                models.SalarySnapshot.employee_id == emp.id,
                models.SalarySnapshot.month == month,
            )
            .first()
        )
        if not existing:
            db.add(models.SalarySnapshot(
                employee_id=emp.id,
                month=month,
                salary_rate=emp.rate or 0.0,
                point_rate=emp.point_val or 0.0,
            ))
    db.commit()

    return crud.close_month(db, month, admin)


@app.post("/api/payroll/months/{month}/reopen")
def reopen_payroll_month(
    month: str,
    db: Session = Depends(database.get_db),
    _admin: models.User = Depends(auth.require_admin),
):
    """Снять закрытие месяца — снова разрешить редактирование."""
    ok = crud.reopen_month(db, month)
    if not ok:
        raise HTTPException(status_code=404, detail="Месяц не был закрыт")
    return {"message": "Закрытие снято", "month": month}


def _ensure_month_open(db: Session, month: str):
    """Бросает 423 Locked, если месяц закрыт. Используется во всех мутирующих
    эндпоинтах payroll/transactions."""
    if not month:
        return
    if crud.is_month_closed(db, month):
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail=f"Месяц {month} закрыт. Снимите закрытие, чтобы вносить изменения."
        )


# ========== ЗАПУСК СЕРВЕРА ==========
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

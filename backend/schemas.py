# schemas.py - Pydantic схемы для валидации данных
from pydantic import BaseModel, Field, validator
from datetime import datetime
from typing import Optional, List
from models import TransactionType


# ========== СХЕМЫ СОТРУДНИКОВ ==========

class EmployeeBase(BaseModel):
    """Базовые поля сотрудника."""
    name: str = Field(..., min_length=1, description="ФИО сотрудника")
    position: str = Field(..., min_length=1, description="Должность")
    phone: Optional[str] = Field(None, description="Номер телефона")
    bank_acc: Optional[str] = Field(None, pattern=r"^\d{16}$", description="Номер счёта (16 цифр)")
    rate: float = Field(0.0, ge=0, description="Базовая ставка (грн/мес)")
    point_val: float = Field(0.0, ge=0, description="Стоимость балла (грн)")
    card_id: Optional[str] = Field(None, description="Номер карты доступа")


class EmployeeCreate(EmployeeBase):
    """Схема для создания сотрудника."""
    pass


class EmployeeUpdate(BaseModel):
    """Схема для обновления сотрудника (все поля опциональны)."""
    name: Optional[str] = None
    position: Optional[str] = None
    phone: Optional[str] = None
    bank_acc: Optional[str] = None
    rate: Optional[float] = None
    point_val: Optional[float] = None
    card_id: Optional[str] = None


class Employee(EmployeeBase):
    """Схема сотрудника с ID."""
    id: int
    account_username: Optional[str] = None  # Логин личного кабинета (None если не создан)
    account_password: Optional[str] = None  # Открытый пароль (только для админа)

    class Config:
        from_attributes = True


# ========== СХЕМЫ ПОСЕЩАЕМОСТИ ==========

class AttendanceBase(BaseModel):
    """Базовые поля посещаемости."""
    employee_id: int
    date: str  # Формат: YYYY-MM-DD
    in_time: datetime
    out_time: Optional[datetime] = None


class AttendanceCreate(AttendanceBase):
    """Схема для создания записи посещаемости."""
    pass


class AttendanceUpdate(BaseModel):
    """Схема для обновления записи посещаемости."""
    in_time: Optional[datetime] = None
    out_time: Optional[datetime] = None


class Attendance(AttendanceBase):
    """Схема посещаемости с ID."""
    id: int

    class Config:
        from_attributes = True


class AttendanceWithEmployee(Attendance):
    """Схема посещаемости с данными сотрудника."""
    employee_name: str


# ========== СХЕМЫ ФИНАНСОВЫХ ТРАНЗАКЦИЙ ==========

class FinancialTransactionBase(BaseModel):
    """Базовые поля финансовой транзакции."""
    employee_id: int
    type: TransactionType
    amount: float = Field(default=0.0, description="Сумма в гривнах")
    points_count: Optional[float] = Field(None, description="Количество баллов")
    comment: Optional[str] = Field(None, description="Комментарий")
    date: str  # Формат: YYYY-MM-DD

    @validator('type', pre=True)
    def parse_type(cls, v):
        """Преобразует строку в TransactionType enum."""
        if isinstance(v, str):
            # Преобразуем в lowercase для соответствия значениям enum
            return TransactionType(v.lower())
        return v


class FinancialTransactionCreate(FinancialTransactionBase):
    """Схема для создания транзакции."""
    pass


class FinancialTransaction(FinancialTransactionBase):
    """Схема транзакции с ID."""
    id: int
    created_at: datetime

    class Config:
        from_attributes = True




# ========== СХЕМЫ ДЛЯ РАСЧЁТА ЗАРПЛАТЫ ==========

class PayrollDetail(BaseModel):
    """Деталь расчёта зарплаты."""
    type: str  # "bonus", "advance", "fine", "points"
    amount: float
    points: Optional[float] = None
    comment: str
    date: str


class PayrollCalculation(BaseModel):
    """Результат расчёта зарплаты сотрудника."""
    employee_id: int
    employee_name: str
    month: str  # Формат: YYYY-MM
    base_rate: float  # Расчётная базовая зарплата (часовая ставка × отработанные часы)
    hourly_rate: float  # Часовая ставка
    total_hours_worked: float  # Всего отработано часов за месяц
    total_points: float
    piecework_sum: float  # Сумма за сдельную работу
    bonuses_total: float
    advances_total: float
    fines_total: float
    to_pay: float  # Итого к выплате
    details: list[PayrollDetail]
    salary_rate_used: float  # Ставка, использованная в расчёте (из снимка)
    point_rate_used: float   # Стоимость балла, использованная в расчёте (из снимка)
    is_closed: bool = False  # Месяц закрыт — расчёт зафиксирован, редактирование заблокировано


# ========== СХЕМЫ ДЛЯ ЗАКРЫТИЯ МЕСЯЦА ==========

class MonthClosure(BaseModel):
    """Запись о закрытом расчётном месяце."""
    month: str  # YYYY-MM
    closed_at: datetime
    closed_by_username: Optional[str] = None

    class Config:
        from_attributes = True


class CloseMonthRequest(BaseModel):
    month: str  # YYYY-MM


# ========== СХЕМЫ ДЛЯ ЖУРНАЛА ==========

class JournalEntry(BaseModel):
    """Запись в журнале посещаемости."""
    id: int
    date: str
    employee_name: str
    in_time: str
    out_time: Optional[str] = None
    total_hours: Optional[float] = None

    class Config:
        from_attributes = True


# ========== СХЕМЫ ДЛЯ ПОСЕЩАЕМОСТИ (СКАНЕР) ==========

class CardScanRequest(BaseModel):
    """Схема для сканирования карты доступа (поддерживает офлайн режим)."""
    card_id: str
    timestamp: Optional[datetime] = None


class BulkScanRequest(BaseModel):
    """Схема для массовой загрузки офлайн-сканов."""
    scans: List[CardScanRequest]


class LatestAttendanceResponse(BaseModel):
    """Схема ответа для последнего скана (режим ввода карт)."""
    card_id: str


# ========== СХЕМЫ ДЛЯ ЛОГОВ ==========

class AttendanceLogEntry(BaseModel):
    """Запись лога сканирования."""
    id: int
    received_at: datetime
    card_id: str
    scan_timestamp: Optional[datetime] = None
    employee_id: Optional[int] = None
    employee_name: Optional[str] = None
    status: str
    result: str  # 'success' | 'warning' | 'error'
    message: Optional[str] = None

    class Config:
        from_attributes = True


# ========== СХЕМЫ ДЛЯ АУТЕНТИФИКАЦИИ ==========

class LoginRequest(BaseModel):
    """Запрос на вход."""
    username: str = Field(..., min_length=1)
    password: str = Field(..., min_length=1)


class UserPublic(BaseModel):
    """Публичные данные пользователя (без пароля)."""
    id: int
    username: str
    role: str  # 'admin' | 'employee'
    employee_id: Optional[int] = None


class TokenResponse(BaseModel):
    """Ответ на успешный логин."""
    access_token: str
    token_type: str = "bearer"
    user: UserPublic


class CreateEmployeeAccountRequest(BaseModel):
    """Создать личный кабинет для сотрудника (ввод логина/пароля админом)."""
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=4, max_length=100)


class UpdateEmployeeAccountRequest(BaseModel):
    """Изменить логин и/или пароль кабинета сотрудника."""
    username: Optional[str] = Field(None, min_length=3, max_length=50)
    password: Optional[str] = Field(None, min_length=4, max_length=100)


# ========== СХЕМЫ ЛОГА АКТИВНОСТИ КАБИНЕТА ==========

class CabinetActivityEntry(BaseModel):
    """Запись лога активности кабинета."""
    id: int
    timestamp: datetime
    user_id: Optional[int] = None
    employee_id: Optional[int] = None
    role: Optional[str] = None
    username_attempted: Optional[str] = None
    employee_name: Optional[str] = None
    event_type: str
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None

    class Config:
        from_attributes = True


# ========== СХЕМЫ ДЛЯ МОНИТОРИНГА СКАНЕРА ==========

class ScannerHeartbeatIn(BaseModel):
    """То, что сканер шлёт о себе каждые N секунд."""
    device_id: str
    fw_version: Optional[str] = None
    mode: str = "active"              # active | night (короткое пробуждение из сна)
    config_version: int = 0           # версия конфига, которая сейчас на устройстве
    ip: Optional[str] = None
    ssid: Optional[str] = None
    rssi: Optional[int] = None
    battery_percent: Optional[int] = None
    battery_voltage: Optional[float] = None
    queue_size: Optional[int] = None
    free_heap: Optional[int] = None
    uptime_sec: Optional[int] = None
    reset_reason: Optional[str] = None
    time_synced: Optional[bool] = None
    ota_error: Optional[str] = None   # почему не встало последнее обновление


class ScannerCommandOut(BaseModel):
    """Команда в ответе на heartbeat (то, что читает прошивка)."""
    id: int
    command: str
    payload: Optional[dict] = None


class ScannerOtaOut(BaseModel):
    """Инструкция на обновление прошивки."""
    version: str
    url: str
    md5: str
    size: int


class ScannerHeartbeatOut(BaseModel):
    """Ответ сервера сканеру."""
    server_time: datetime
    config_version: int
    config: Optional[dict] = None     # присылаем, только если у устройства версия старее
    commands: List[ScannerCommandOut] = []
    ota: Optional[ScannerOtaOut] = None
    next_heartbeat_sec: int


class ScannerCommandResult(BaseModel):
    """Отчёт устройства о выполнении команды."""
    device_id: str
    command_id: int
    ok: bool
    message: Optional[str] = None


class ScannerCommandEntry(BaseModel):
    """Команда в админской истории."""
    id: int
    command: str
    payload: Optional[str] = None
    status: str
    created_at: Optional[datetime] = None
    sent_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    result: Optional[str] = None
    created_by: Optional[str] = None

    class Config:
        from_attributes = True


class ScannerDeviceOut(BaseModel):
    """Полное состояние сканера для админской панели."""
    device_id: str
    name: Optional[str] = None
    status: str                       # online | sleeping | offline | never
    status_label: str                 # человеческая расшифровка
    seconds_since_seen: Optional[int] = None
    last_seen_at: Optional[datetime] = None
    first_seen_at: Optional[datetime] = None
    last_mode: Optional[str] = None
    fw_version: Optional[str] = None
    ip_address: Optional[str] = None
    ssid: Optional[str] = None
    rssi: Optional[int] = None
    wifi_quality: Optional[int] = None   # 0..100, пересчёт из dBm для шкалы
    battery_percent: Optional[int] = None
    battery_voltage: Optional[float] = None
    queue_size: Optional[int] = None
    free_heap: Optional[int] = None
    uptime_sec: Optional[int] = None
    reset_reason: Optional[str] = None
    time_synced: Optional[bool] = None
    config: dict = {}
    config_version: int = 1
    pending_commands: int = 0
    alerts: List[str] = []            # готовые тексты проблем для плашки
    target_firmware_id: Optional[int] = None
    firmware_up_to_date: Optional[bool] = None
    last_ota_error: Optional[str] = None


class ScannerCommandRequest(BaseModel):
    """Админ ставит команду в очередь."""
    command: str
    payload: Optional[dict] = None


class ScannerConfigUpdate(BaseModel):
    """Настройки сканера. Всё опционально — меняем только присланное."""
    heartbeat_sec: Optional[int] = None
    sleep_enabled: Optional[bool] = None
    work_start: Optional[str] = None       # "06:00"
    work_end: Optional[str] = None         # "19:30"
    work_days: Optional[List[int]] = None  # 1=Пн .. 7=Вс
    night_checkin_min: Optional[int] = None
    volume_percent: Optional[int] = None
    led_brightness: Optional[int] = None
    debounce_sec: Optional[int] = None
    no_sleep_until: Optional[datetime] = None


class ScannerHistoryPoint(BaseModel):
    """Точка на графике состояния."""
    at: datetime
    mode: Optional[str] = None
    rssi: Optional[int] = None
    battery_percent: Optional[int] = None
    queue_size: Optional[int] = None
    free_heap: Optional[int] = None

    class Config:
        from_attributes = True


class ScannerFirmwareEntry(BaseModel):
    """Загруженная сборка прошивки."""
    id: int
    version: str
    filename: Optional[str] = None
    size_bytes: int
    md5: str
    notes: Optional[str] = None
    uploaded_at: Optional[datetime] = None
    uploaded_by: Optional[str] = None

    class Config:
        from_attributes = True

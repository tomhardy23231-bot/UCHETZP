# schemas.py - Pydantic схемы для валидации данных
from pydantic import BaseModel, Field, validator
from datetime import datetime
from typing import Optional, List
from models import TransactionType, UserRole


# ========== СХЕМЫ ПОЛЬЗОВАТЕЛЕЙ И АВТОРИЗАЦИИ ==========

class UserBase(BaseModel):
    username: str
    role: UserRole = UserRole.USER
    subscription_until: datetime


class UserCreate(UserBase):
    password: str


class UserUpdate(BaseModel):
    password: Optional[str] = None
    role: Optional[UserRole] = None
    subscription_until: Optional[datetime] = None


class User(UserBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str
    user: User


class LoginRequest(BaseModel):
    username: str
    password: str


# ========== СХЕМЫ СОТРУДНИКОВ ==========

class EmployeeBase(BaseModel):
    """Базовые поля сотрудника."""
    name: str = Field(..., min_length=1, description="ФИО сотрудника")
    position: str = Field(..., min_length=1, description="Должность")
    phone: Optional[str] = Field(None, description="Номер телефона")
    bank_acc: Optional[str] = Field(None, pattern=r"^\d{16}$", description="Номер счёта (16 цифр)")
    rate: float = Field(0.0, ge=0, description="Базовая ставка (грн/мес)")
    point_val: float = Field(0.0, ge=0, description="Стоимость очка (грн)")
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
    amount: float = Field(default=0.0, ge=0, description="Сумма в гривнах")
    points_count: Optional[float] = Field(None, ge=0, description="Количество очков")
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

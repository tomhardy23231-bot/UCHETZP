# models.py - Модели базы данных (SQLAlchemy)
from sqlalchemy import Column, Integer, String, Float, DateTime, Enum, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base
import enum


class TransactionType(enum.Enum):
    """Типы финансовых транзакций."""
    BONUS = "bonus"       # Премия
    ADVANCE = "advance"   # Аванс
    FINE = "fine"         # Штраф
    POINTS = "points"     # Сдельная работа (очки)


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
    point_val = Column(Float, default=0.0)  # Стоимость одного очка (грн)

    # Связи с другими таблицами
    attendance_records = relationship("Attendance", back_populates="employee", cascade="all, delete-orphan")
    financial_transactions = relationship("FinancialTransaction", back_populates="employee", cascade="all, delete-orphan")
    salary_snapshots = relationship("SalarySnapshot", back_populates="employee", cascade="all, delete-orphan")


class Attendance(Base):
    """Модель учёта посещаемости (табель)."""
    __tablename__ = "attendance"

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    date = Column(String, nullable=False, index=True)  # Дата в формате YYYY-MM-DD
    in_time = Column(DateTime, nullable=False)  # Время прихода
    out_time = Column(DateTime, nullable=True)  # Время ухода (может быть пустым)
    photo_url = Column(String, nullable=True)  # Ссылка на фото со сканера

    # Связь с сотрудником
    employee = relationship("Employee", back_populates="attendance_records")


class FinancialTransaction(Base):
    """Модель финансовых транзакций (премии, авансы, штрафы, сдельная работа)."""
    __tablename__ = "financial_transactions"

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    type = Column(Enum(TransactionType), nullable=False)  # Тип транзакции
    amount = Column(Float, nullable=False)  # Сумма в гривнах
    points_count = Column(Float, nullable=True)  # Количество очков (для сдельной работы)
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
    point_rate = Column(Float, nullable=False)  # Стоимость одного очка (грн)

    # Связь с сотрудником
    employee = relationship("Employee", back_populates="salary_snapshots")

    # Уникальный constraint на пару (employee_id, month)
    __table_args__ = (
        UniqueConstraint('employee_id', 'month', name='_employee_month_uc'),
    )
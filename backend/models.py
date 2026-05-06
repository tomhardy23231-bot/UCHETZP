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
    point_val = Column(Float, default=0.0)  # Стоимость одного очка (грн)

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
    После этого транзакции этого месяца и корректировки часов/очков блокируются
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
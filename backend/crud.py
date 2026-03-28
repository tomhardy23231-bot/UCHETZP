# crud.py - Функции для работы с базой данных (Create, Read, Update, Delete)
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from datetime import datetime, date, timedelta
from typing import List, Optional
import models
import schemas
from dateutil.parser import parse
from dateutil.tz import UTC


# ========== CRUD ДЛЯ СОТРУДНИКОВ ==========

def get_employee(db: Session, employee_id: int) -> Optional[models.Employee]:
    """Получить сотрудника по ID."""
    return db.query(models.Employee).filter(models.Employee.id == employee_id).first()


def get_employee_by_card(db: Session, card_id: str) -> Optional[models.Employee]:
    """Получить сотрудника по ID карты."""
    return db.query(models.Employee).filter(models.Employee.card_id == card_id).first()


def get_employees(db: Session, skip: int = 0, limit: int = 100) -> List[models.Employee]:
    """Получить список всех сотрудников."""
    return db.query(models.Employee).offset(skip).limit(limit).all()


def create_employee(db: Session, employee: schemas.EmployeeCreate) -> models.Employee:
    """Создать нового сотрудника."""
    db_employee = models.Employee(
        name=employee.name,
        position=employee.position,
        phone=employee.phone,
        bank_acc=employee.bank_acc,
        rate=employee.rate,
        point_val=employee.point_val,
        card_id=employee.card_id
    )
    db.add(db_employee)
    db.commit()
    db.refresh(db_employee)
    return db_employee


def update_employee(db: Session, employee_id: int, employee: schemas.EmployeeUpdate) -> Optional[models.Employee]:
    """Обновить данные сотрудника."""
    db_employee = get_employee(db, employee_id)
    if db_employee:
        update_data = employee.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(db_employee, key, value)
        
        # Если изменились ставки, обновляем слепки за текущий и предыдущий месяцы
        if "rate" in update_data or "point_val" in update_data:
            now = datetime.now()
            current_month = now.strftime("%Y-%m")
            
            # Расчет предыдущего месяца
            first_day_current = now.replace(day=1)
            last_day_prev = first_day_current - timedelta(days=1)
            prev_month = last_day_prev.strftime("%Y-%m")
            
            # Поиск и обновление слепков
            snapshots = db.query(models.SalarySnapshot).filter(
                models.SalarySnapshot.employee_id == employee_id,
                models.SalarySnapshot.month.in_([current_month, prev_month])
            ).all()
            
            for snapshot in snapshots:
                if "rate" in update_data:
                    snapshot.salary_rate = update_data["rate"]
                if "point_val" in update_data:
                    snapshot.point_rate = update_data["point_val"]
                    
        db.commit()
        db.refresh(db_employee)
    return db_employee


def delete_employee(db: Session, employee_id: int) -> bool:
    """Удалить сотрудника."""
    db_employee = get_employee(db, employee_id)
    if db_employee:
        db.delete(db_employee)
        db.commit()
        return True
    return False


# ========== CRUD ДЛЯ ПОСЕЩАЕМОСТИ ==========

def get_attendance_by_date(db: Session, date_str: str) -> List[models.Attendance]:
    """Получить все записи посещаемости за дату."""
    return db.query(models.Attendance).filter(models.Attendance.date == date_str).all()


def get_attendance_by_employee_and_date(
    db: Session,
    employee_id: int,
    date_str: str
) -> Optional[models.Attendance]:
    """Получить запись посещаемости сотрудника за конкретную дату."""
    return db.query(models.Attendance).filter(
        and_(
            models.Attendance.employee_id == employee_id,
            models.Attendance.date == date_str
        )
    ).first()


def get_attendance_range(db: Session, start_date: str, end_date: str) -> List[models.Attendance]:
    """Получить записи посещаемости за период дат."""
    return db.query(models.Attendance).filter(
        models.Attendance.date >= start_date,
        models.Attendance.date <= end_date
    ).order_by(models.Attendance.date.desc()).all()


def create_attendance(db: Session, attendance: schemas.AttendanceCreate) -> models.Attendance:
    """Создать запись посещаемости."""
    # Сохраняем время как есть - фронтенд уже создал правильную ISO дату в локальном времени
    db_attendance = models.Attendance(
        employee_id=attendance.employee_id,
        date=attendance.date,
        in_time=attendance.in_time,
        out_time=attendance.out_time
    )
    db.add(db_attendance)
    db.commit()
    db.refresh(db_attendance)
    return db_attendance


def update_attendance(
    db: Session,
    attendance_id: int,
    attendance: schemas.AttendanceUpdate
) -> Optional[models.Attendance]:
    """Обновить запись посещаемости."""
    db_attendance = db.query(models.Attendance).filter(models.Attendance.id == attendance_id).first()
    if db_attendance:
        update_data = attendance.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(db_attendance, key, value)
        db.commit()
        db.refresh(db_attendance)
    return db_attendance


def delete_attendance(db: Session, attendance_id: int) -> bool:
    """Удалить запись посещаемости."""
    db_attendance = db.query(models.Attendance).filter(models.Attendance.id == attendance_id).first()
    if db_attendance:
        db.delete(db_attendance)
        db.commit()
        return True
    return False


# ========== CRUD ДЛЯ ФИНАНСОВЫХ ТРАНЗАКЦИЙ ==========

def get_transactions_by_employee_and_month(
    db: Session,
    employee_id: int,
    year_month: str  # Формат: YYYY-MM
) -> List[models.FinancialTransaction]:
    """Получить все транзакции сотрудника за месяц."""
    # year_month имеет формат YYYY-MM, поэтому ищем все записи, где date начинается с этого префикса
    return db.query(models.FinancialTransaction).filter(
        and_(
            models.FinancialTransaction.employee_id == employee_id,
            models.FinancialTransaction.date.startswith(year_month)
        )
    ).all()


def create_transaction(db: Session, transaction: schemas.FinancialTransactionCreate) -> models.FinancialTransaction:
    """Создать финансовую транзакцию."""
    db_transaction = models.FinancialTransaction(
        employee_id=transaction.employee_id,
        type=transaction.type,
        amount=transaction.amount,
        points_count=transaction.points_count,
        comment=transaction.comment or "",  # Пустая строка вместо None
        date=transaction.date
    )
    db.add(db_transaction)
    db.commit()
    db.refresh(db_transaction)
    return db_transaction


def delete_transaction(db: Session, transaction_id: int) -> bool:
    """Удалить транзакцию."""
    db_transaction = db.query(models.FinancialTransaction).filter(
        models.FinancialTransaction.id == transaction_id
    ).first()
    if db_transaction:
        db.delete(db_transaction)
        db.commit()
        return True
    return False


# ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========

def calculate_duration(in_time: datetime, out_time: Optional[datetime]) -> Optional[float]:
    """
    Рассчитать количество часов между двумя временами.

    Args:
        in_time: Начальное время (datetime объект)
        out_time: Конечное время (datetime объект или None)

    Returns:
        Количество часов в виде float с 2 десятичными знаками, или None если out_time is None
    """
    if out_time is None or in_time is None:
        return None

    # Убедимся, что оба объекта datetime (не строки)
    if isinstance(in_time, str):
        in_time = parse(in_time)
    if isinstance(out_time, str):
        out_time = parse(out_time)

    # Убедимся, что оба объекта naive (без timezone) для согласованности
    if in_time.tzinfo is not None:
        in_time = in_time.replace(tzinfo=None)
    if out_time.tzinfo is not None:
        out_time = out_time.replace(tzinfo=None)

    delta = out_time - in_time
    return round(delta.total_seconds() / 3600, 2)  # Переводим секунды в часы


def get_current_date_str() -> str:
    """Получить текущую дату в формате YYYY-MM-DD."""
    return datetime.now().strftime("%Y-%m-%d")


def get_current_datetime() -> datetime:
    """Получить текущую дату и время."""
    return datetime.now()


def get_current_month_str() -> str:
    """Получить текущий месяц в формате YYYY-MM."""
    return datetime.now().strftime("%Y-%m")

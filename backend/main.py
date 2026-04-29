# main.py - Главное приложение FastAPI
import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel
import calendar

import database
import models
import schemas
import crud

# Глобальная переменная для временного хранения ID неизвестной карты (для регистрации новых сотрудников)
latest_scanned_card = None

# Создаём таблицы в базе данных
models.Base.metadata.create_all(bind=database.engine)

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


# ========== ЭНДПОИНТЫ ДЛЯ СОТРУДНИКОВ ==========

@app.get("/api/employees", response_model=List[schemas.Employee])
def get_employees(skip: int = 0, limit: int = 100, db: Session = Depends(database.get_db)):
    """Получить список всех сотрудников."""
    employees = crud.get_employees(db, skip=skip, limit=limit)
    return employees


@app.get("/api/employees/{employee_id}", response_model=schemas.Employee)
def get_employee(employee_id: int, db: Session = Depends(database.get_db)):
    """Получить сотрудника по ID."""
    employee = crud.get_employee(db, employee_id=employee_id)
    if employee is None:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")
    return employee


@app.post("/api/employees", response_model=schemas.Employee, status_code=status.HTTP_201_CREATED)
def create_employee(employee: schemas.EmployeeCreate, db: Session = Depends(database.get_db)):
    """Создать нового сотрудника."""
    return crud.create_employee(db=db, employee=employee)


@app.put("/api/employees/{employee_id}", response_model=schemas.Employee)
def update_employee(
    employee_id: int,
    employee: schemas.EmployeeUpdate,
    db: Session = Depends(database.get_db)
):
    """Обновить данные сотрудника."""
    db_employee = crud.update_employee(db, employee_id=employee_id, employee=employee)
    if db_employee is None:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")
    return db_employee


@app.delete("/api/employees/{employee_id}")
def delete_employee(employee_id: int, db: Session = Depends(database.get_db)):
    """Удалить сотрудника."""
    success = crud.delete_employee(db, employee_id=employee_id)
    if not success:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")
    return {"message": "Сотрудник удалён"}


# ========== ЭНДПОИНТЫ ДЛЯ ПОСЕЩАЕМОСТИ (ЖУРНАЛ) ==========

@app.get("/api/attendance/today", response_model=List[schemas.AttendanceWithEmployee])
def get_today_attendance(db: Session = Depends(database.get_db)):
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
    db: Session = Depends(database.get_db)
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
def get_latest_attendance():
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
    db: Session = Depends(database.get_db)
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
def delete_attendance_record(attendance_id: int, db: Session = Depends(database.get_db)):
    """Удалить запись посещаемости."""
    success = crud.delete_attendance(db, attendance_id)
    if not success:
        raise HTTPException(status_code=404, detail="Запись не найдена")
    return {"message": "Запись удалена"}


@app.post("/api/attendance", response_model=schemas.Attendance, status_code=status.HTTP_201_CREATED)
def create_attendance_record(attendance: schemas.AttendanceCreate, db: Session = Depends(database.get_db)):
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
    db: Session = Depends(database.get_db)
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
    db: Session = Depends(database.get_db)
):
    """
    Очистить логи. Если передан older_than_days — удаляет старше N дней. Иначе все.
    """
    from datetime import timedelta
    if older_than_days is not None:
        cutoff = datetime.now() - timedelta(days=older_than_days)
        deleted = db.query(models.AttendanceLog).filter(
            models.AttendanceLog.received_at < cutoff
        ).delete()
    else:
        deleted = db.query(models.AttendanceLog).delete()
    db.commit()
    return {"deleted": deleted}


# ========== ЭНДПОИНТЫ ДЛЯ РАСЧЁТА ЗАРПЛАТЫ ==========

@app.get("/api/payroll/{employee_id}", response_model=schemas.PayrollCalculation)
def calculate_payroll(
    employee_id: int,
    month: str = None,  # Формат: YYYY-MM
    db: Session = Depends(database.get_db)
):
    """
    Рассчитать зарплату сотрудника за месяц.

    НОВАЯ ФОРМУЛА (почасовая):
    1. Hourly Rate = Monthly Rate / (21 days × 9 hours)
    2. Base Pay = Hourly Rate × Total Hours Worked
    3. Total Pay = Base Pay + (Points × Point Value) + Bonuses - Advances - Fines
    """
    employee = crud.get_employee(db, employee_id)
    if not employee:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")

    if month is None:
        month = crud.get_current_month_str()

    # ===== ЛОГИКА СНИМКОВ (SNAPSHOTS) =====
    # Проверяем, есть ли снимок за этот месяц для сотрудника
    snapshot = db.query(models.SalarySnapshot).filter(
        models.SalarySnapshot.employee_id == employee_id,
        models.SalarySnapshot.month == month
    ).first()

    # Если снимка нет, создаём его, обрабатывая состояние гонки
    if not snapshot:
        try:
            snapshot = models.SalarySnapshot(
                employee_id=employee_id,
                month=month,
                salary_rate=employee.rate,
                point_rate=employee.point_val
            )
            db.add(snapshot)
            db.commit()
            db.refresh(snapshot)
        except IntegrityError:
            # Откатываем сессию после ошибки
            db.rollback()
            # Другой процесс уже создал снимок, просто получаем его
            snapshot = db.query(models.SalarySnapshot).filter(
                models.SalarySnapshot.employee_id == employee_id,
                models.SalarySnapshot.month == month
            ).one()

    # Получаем все транзакции за месяц
    transactions = crud.get_transactions_by_employee_and_month(db, employee_id, month)

    # Инициализируем счётчики
    total_points = 0.0
    bonuses_total = 0.0
    advances_total = 0.0
    fines_total = 0.0
    details = []

    # Обрабатываем транзакции
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

    # ПОЧАСОВОЙ РАСЧЁТ БАЗОВОЙ ЗАРПЛАТЫ
    # Используем ставки из снимка (snapshot) для расчёта
    hourly_rate = snapshot.salary_rate / (STANDARD_WORKING_DAYS * STANDARD_HOURS_PER_DAY)

    # Получаем записи посещаемости за месяц для подсчёта отработанных часов
    [year, month_num] = month.split('-')
    start_date = f"{year}-{month_num}-01"
    last_day = calendar.monthrange(int(year), int(month_num))[1]  # Получаем последний день месяца
    end_date = f"{year}-{month_num}-{last_day:02d}"

    attendance_records = crud.get_attendance_range(db, start_date, end_date)

    # Подсчитываем общее количество отработанных часов для конкретного сотрудника
    total_hours_worked = 0.0
    for record in attendance_records:
        if record.employee_id == employee_id and record.out_time:
            duration = crud.calculate_duration(record.in_time, record.out_time)
            if duration:
                total_hours_worked += duration

    # Базовая зарплата = часовая ставка × отработанные часы
    base_pay = hourly_rate * total_hours_worked

    # Рассчитываем сдельную часть
    piecework_sum = total_points * snapshot.point_rate

    # Итого к выплате
    to_pay = base_pay + piecework_sum + bonuses_total - advances_total - fines_total

    return {
        "employee_id": employee.id,
        "employee_name": employee.name,
        "month": month,
        "base_rate": round(base_pay, 2),           # Теперь это расчётная базовая зарплата
        "hourly_rate": round(hourly_rate, 2),      # Часовая ставка
        "total_hours_worked": round(total_hours_worked, 2),  # Всего отработано часов
        "total_points": round(total_points, 2),
        "piecework_sum": round(piecework_sum, 2),
        "bonuses_total": round(bonuses_total, 2),
        "advances_total": round(advances_total, 2),
        "fines_total": round(fines_total, 2),
        "to_pay": round(to_pay, 2),
        "details": details,
        "salary_rate_used": snapshot.salary_rate,  # Ставка, использованная в расчёте
        "point_rate_used": snapshot.point_rate     # Стоимость балла, использованная в расчёте
    }


@app.post("/api/transactions", response_model=schemas.FinancialTransaction, status_code=status.HTTP_201_CREATED)
def create_transaction(transaction: schemas.FinancialTransactionCreate, db: Session = Depends(database.get_db)):
    """
    Создать финансовую транзакцию (премия, аванс, штраф, сдельная работа).

    Для типа POINTS:
    - amount вычисляется автоматически как points_count × employee.point_value
    - необходимо указать points_count
    """
    employee = crud.get_employee(db, transaction.employee_id)
    if not employee:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")

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
def delete_transaction(transaction_id: int, db: Session = Depends(database.get_db)):
    """Удалить транзакцию."""
    success = crud.delete_transaction(db, transaction_id)
    if not success:
        raise HTTPException(status_code=404, detail="Транзакция не найдена")
    return {"message": "Транзакция удалена"}


@app.get("/api/transactions/employee/{employee_id}", response_model=List[schemas.FinancialTransaction])
def get_employee_transactions(
    employee_id: int,
    month: str = None,  # Опциональный параметр для фильтрации по месяцу (YYYY-MM)
    db: Session = Depends(database.get_db)
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
def adjust_hours(request: AdjustHoursRequest, db: Session = Depends(database.get_db)):
    """
    Умная корректировка часов сотрудника за месяц.

    Распределяет разницу часов пропорционально длительности смен.
    Длинные смены получают большую часть корректировки.
    """
    from datetime import timedelta

    employee = crud.get_employee(db, request.employee_id)
    if not employee:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")

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
def adjust_points(request: AdjustPointsRequest, db: Session = Depends(database.get_db)):
    """
    Корректировка очков сотрудника за месяц.

    Создаёт транзакцию типа POINTS с разницей.
    """
    employee = crud.get_employee(db, request.employee_id)
    if not employee:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")

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


# ========== ЗАПУСК СЕРВЕРА ==========
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

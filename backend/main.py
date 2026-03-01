# main.py - Главное приложение FastAPI
import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from typing import List
from datetime import datetime, timedelta
import jwt
from pydantic import BaseModel
import calendar

import database
import models
import schemas
import crud

# Настройки JWT
SECRET_KEY = "SECRET_FOR_UC_HET_ZP_SYSTEM" # В продакшене вынести в .env
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7 # 1 неделя

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/login")

# Глобальная переменная для перехвата сканирований неизвестных карт (в режиме ввода карт)
latest_scanned_card = None

# Создаём таблицы в базе данных
models.Base.metadata.create_all(bind=database.engine)

# Инициализируем FastAPI приложение
app = FastAPI(
    title="Система учёта ЗП",
    description="Система учёта посещаемости и расчёта заработной платы",
    version="1.1.0"
)

# Настройка CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ AUTH ==========

def create_access_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(database.get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except jwt.PyJWTError:
        raise credentials_exception
    user = crud.get_user_by_username(db, username=username)
    if user is None:
        raise credentials_exception
    return user

async def get_current_active_user(current_user: models.User = Depends(get_current_user)):
    # Проверка подписки (для админа не проверяем)
    if current_user.role != models.UserRole.ADMIN:
        # Убеждаемся, что время с таймзоной для корректного сравнения
        now = datetime.now(current_user.subscription_until.tzinfo)
        if current_user.subscription_until < now:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Subscription expired"
            )
    return current_user

async def get_admin_user(current_user: models.User = Depends(get_current_active_user)):
    if current_user.role != models.UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Operation not permitted"
        )
    return current_user


# ========== BOOTSTRAP ADMIN ==========

@app.on_event("startup")
async def startup_event():
    db = database.SessionLocal()
    try:
        admin = crud.get_user_by_username(db, "admin")
        if not admin:
            admin_schema = schemas.UserCreate(
                username="admin",
                password="Kniga23",
                role=models.UserRole.ADMIN,
                subscription_until=datetime(2099, 12, 31)
            )
            crud.create_user(db, admin_schema)
            print("Admin user created.")
    finally:
        db.close()


# ========== AUTH ENDPOINTS ==========

@app.post("/api/login", response_model=schemas.Token)
def login(login_data: schemas.LoginRequest, db: Session = Depends(database.get_db)):
    user = crud.get_user_by_username(db, username=login_data.username)
    if not user or not crud.verify_password(login_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer", "user": user}

@app.get("/api/me", response_model=schemas.User)
def read_users_me(current_user: models.User = Depends(get_current_user)):
    return current_user


# ========== ADMIN API ==========

@app.get("/api/admin/users", response_model=List[schemas.User])
def list_users(db: Session = Depends(database.get_db), admin: models.User = Depends(get_admin_user)):
    return crud.get_users(db)

@app.post("/api/admin/users", response_model=schemas.User)
def create_new_user(user: schemas.UserCreate, db: Session = Depends(database.get_db), admin: models.User = Depends(get_admin_user)):
    db_user = crud.get_user_by_username(db, username=user.username)
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    return crud.create_user(db, user)

@app.patch("/api/admin/users/{user_id}", response_model=schemas.User)
def update_user_details(user_id: int, user_update: schemas.UserUpdate, db: Session = Depends(database.get_db), admin: models.User = Depends(get_admin_user)):
    db_user = crud.update_user(db, user_id, user_update)
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    return db_user

@app.delete("/api/admin/users/{user_id}")
def delete_user_account(user_id: int, db: Session = Depends(database.get_db), admin: models.User = Depends(get_admin_user)):
    success = crud.delete_user(db, user_id)
    if not success:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User deleted"}


# ========== ЭНДПОИНТЫ ДЛЯ СОТРУДНИКОВ (ЗАЩИЩЕННЫЕ) ==========

@app.get("/api/employees", response_model=List[schemas.Employee])
def get_employees(skip: int = 0, limit: int = 100, db: Session = Depends(database.get_db), user: models.User = Depends(get_current_active_user)):
    return crud.get_employees(db, skip=skip, limit=limit)

@app.get("/api/employees/{employee_id}", response_model=schemas.Employee)
def get_employee(employee_id: int, db: Session = Depends(database.get_db), user: models.User = Depends(get_current_active_user)):
    employee = crud.get_employee(db, employee_id=employee_id)
    if employee is None:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")
    return employee

@app.post("/api/employees", response_model=schemas.Employee, status_code=status.HTTP_201_CREATED)
def create_employee(employee: schemas.EmployeeCreate, db: Session = Depends(database.get_db), user: models.User = Depends(get_admin_user)):
    return crud.create_employee(db=db, employee=employee)

@app.put("/api/employees/{employee_id}", response_model=schemas.Employee)
def update_employee(employee_id: int, employee: schemas.EmployeeUpdate, db: Session = Depends(database.get_db), user: models.User = Depends(get_admin_user)):
    db_employee = crud.update_employee(db, employee_id=employee_id, employee=employee)
    if db_employee is None:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")
    return db_employee

@app.delete("/api/employees/{employee_id}")
def delete_employee(employee_id: int, db: Session = Depends(database.get_db), user: models.User = Depends(get_admin_user)):
    success = crud.delete_employee(db, employee_id=employee_id)
    if not success:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")
    return {"message": "Сотрудник удалён"}


# ========== ЭНДПОИНТЫ ДЛЯ ПОСЕЩАЕМОСТИ (ЖУРНАЛ) ==========

@app.get("/api/attendance/today", response_model=List[schemas.AttendanceWithEmployee])
def get_today_attendance(db: Session = Depends(database.get_db), user: models.User = Depends(get_current_active_user)):
    today = crud.get_current_date_str()
    attendance_records = crud.get_attendance_by_date(db, today)
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
def get_attendance_journal(start_date: str = None, end_date: str = None, db: Session = Depends(database.get_db), user: models.User = Depends(get_current_active_user)):
    if start_date is None:
        from datetime import timedelta
        end = datetime.now()
        start = end - timedelta(days=30)
        start_date = start.strftime("%Y-%m-%d")
        end_date = end.strftime("%Y-%m-%d")
    attendance_records = crud.get_attendance_range(db, start_date, end_date)
    result = []
    for record in attendance_records:
        total_hours = None
        if record.out_time:
            total_hours = crud.calculate_duration(record.in_time, record.out_time)
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

@app.put("/api/attendance/{attendance_id}")
def update_attendance_record(attendance_id: int, attendance_update: schemas.AttendanceUpdate, db: Session = Depends(database.get_db), user: models.User = Depends(get_admin_user)):
    attendance = crud.update_attendance(db, attendance_id, attendance_update)
    if attendance is None:
        raise HTTPException(status_code=404, detail="Запись не найдена")
    return {"message": "Запись обновлена"}

@app.delete("/api/attendance/{attendance_id}")
def delete_attendance_record(attendance_id: int, db: Session = Depends(database.get_db), user: models.User = Depends(get_admin_user)):
    success = crud.delete_attendance(db, attendance_id)
    if not success:
        raise HTTPException(status_code=404, detail="Запись не найдена")
    return {"message": "Запись удалена"}

@app.post("/api/attendance", response_model=schemas.Attendance, status_code=status.HTTP_201_CREATED)
def create_attendance_record(attendance: schemas.AttendanceCreate, db: Session = Depends(database.get_db), user: models.User = Depends(get_admin_user)):
    return crud.create_attendance(db=db, attendance=attendance)


# ========== ЭНДПОИНТЫ ДЛЯ ПОСЕЩАЕМОСТИ (СКАНЕР) - БЕЗ AUTH (ДЛЯ СКАНИРОВАНИЯ) ==========

@app.post("/api/attendance/scan", status_code=status.HTTP_200_OK)
def scan_card_for_attendance(request: schemas.CardScanRequest, db: Session = Depends(database.get_db)):
    global latest_scanned_card
    card_id = request.card_id
    employee = crud.get_employee_by_card(db, card_id)
    now = request.timestamp if request.timestamp else datetime.now()
    if now.tzinfo is not None:
        now = now.replace(tzinfo=None)
    today_str = now.strftime("%Y-%m-%d")
    if not employee:
        latest_scanned_card = card_id
        return {"status": "unknown_card_intercepted", "card_id": card_id, "time": now}
    attendance_record = crud.get_attendance_by_employee_and_date(db, employee.id, today_str)
    if not attendance_record:
        new_attendance = schemas.AttendanceCreate(employee_id=employee.id, date=today_str, in_time=now, out_time=None)
        crud.create_attendance(db, new_attendance)
        return {"status": "checked_in", "employee_name": employee.name, "time": now}
    if attendance_record.out_time is None:
        time_diff = now - attendance_record.in_time
        if time_diff.total_seconds() < 60:
            return {"status": "debounced", "reason": "scanned too soon after check-in"}
        attendance_record.out_time = now
        db.commit()
        return {"status": "checked_out", "employee_name": employee.name, "time": now}
    else:
        time_diff = now - attendance_record.out_time
        if time_diff.total_seconds() < 60:
            return {"status": "debounced", "reason": "scanned too soon after previous check-out"}
        attendance_record.out_time = now
        db.commit()
        return {"status": "re_checked_out", "employee_name": employee.name, "time": now}


# ========== ЭНДПОИНТЫ ДЛЯ РАСЧЁТА ЗАРПЛАТЫ (ЗАЩИЩЕННЫЕ) ==========

@app.get("/api/payroll/{employee_id}", response_model=schemas.PayrollCalculation)
def calculate_payroll(employee_id: int, month: str = None, db: Session = Depends(database.get_db), user: models.User = Depends(get_current_active_user)):
    employee = crud.get_employee(db, employee_id)
    if not employee: raise HTTPException(status_code=404, detail="Сотрудник не найден")
    if month is None: month = crud.get_current_month_str()
    snapshot = db.query(models.SalarySnapshot).filter(models.SalarySnapshot.employee_id == employee_id, models.SalarySnapshot.month == month).first()
    if not snapshot:
        try:
            snapshot = models.SalarySnapshot(employee_id=employee_id, month=month, salary_rate=employee.rate, point_rate=employee.point_val)
            db.add(snapshot); db.commit(); db.refresh(snapshot)
        except IntegrityError:
            db.rollback()
            snapshot = db.query(models.SalarySnapshot).filter(models.SalarySnapshot.employee_id == employee_id, models.SalarySnapshot.month == month).one()
    transactions = crud.get_transactions_by_employee_and_month(db, employee_id, month)
    total_points = 0.0; bonuses_total = 0.0; advances_total = 0.0; fines_total = 0.0; details = []
    for trans in transactions:
        detail = {"type": trans.type.value, "amount": trans.amount, "points": trans.points_count, "comment": trans.comment, "date": trans.date}
        if trans.type == models.TransactionType.POINTS: total_points += (trans.points_count or 0)
        elif trans.type == models.TransactionType.BONUS: bonuses_total += trans.amount
        elif trans.type == models.TransactionType.ADVANCE: advances_total += trans.amount
        elif trans.type == models.TransactionType.FINE: fines_total += trans.amount
        details.append(detail)
    hourly_rate = snapshot.salary_rate / (STANDARD_WORKING_DAYS * STANDARD_HOURS_PER_DAY)
    [year, month_num] = month.split('-')
    start_date = f"{year}-{month_num}-01"
    last_day = calendar.monthrange(int(year), int(month_num))[1]
    end_date = f"{year}-{month_num}-{last_day:02d}"
    attendance_records = crud.get_attendance_range(db, start_date, end_date)
    total_hours_worked = 0.0
    for record in attendance_records:
        if record.employee_id == employee_id and record.out_time:
            duration = crud.calculate_duration(record.in_time, record.out_time)
            if duration: total_hours_worked += duration
    base_pay = hourly_rate * total_hours_worked
    piecework_sum = total_points * snapshot.point_rate
    to_pay = base_pay + piecework_sum + bonuses_total - advances_total - fines_total
    return {
        "employee_id": employee.id, "employee_name": employee.name, "month": month,
        "base_rate": round(base_pay, 2), "hourly_rate": round(hourly_rate, 2),
        "total_hours_worked": round(total_hours_worked, 2), "total_points": round(total_points, 2),
        "piecework_sum": round(piecework_sum, 2), "bonuses_total": round(bonuses_total, 2),
        "advances_total": round(advances_total, 2), "fines_total": round(fines_total, 2),
        "to_pay": round(to_pay, 2), "details": details,
        "salary_rate_used": snapshot.salary_rate, "point_rate_used": snapshot.point_rate
    }

@app.post("/api/transactions", response_model=schemas.FinancialTransaction, status_code=status.HTTP_201_CREATED)
def create_transaction(transaction: schemas.FinancialTransactionCreate, db: Session = Depends(database.get_db), user: models.User = Depends(get_admin_user)):
    employee = crud.get_employee(db, transaction.employee_id)
    if not employee: raise HTTPException(status_code=404, detail="Сотрудник не найден")
    if transaction.type == models.TransactionType.POINTS:
        if transaction.points_count is None or transaction.points_count <= 0:
            raise HTTPException(status_code=400, detail="Для сдельной работы необходимо указать количество очков")
        calculated_amount = transaction.points_count * employee.point_val
        transaction_data = schemas.FinancialTransactionCreate(employee_id=transaction.employee_id, type=transaction.type, amount=calculated_amount, points_count=transaction.points_count, comment=transaction.comment, date=transaction.date)
        return crud.create_transaction(db=db, transaction=transaction_data)
    return crud.create_transaction(db=db, transaction=transaction)

@app.delete("/api/transactions/{transaction_id}")
def delete_transaction(transaction_id: int, db: Session = Depends(database.get_db), user: models.User = Depends(get_admin_user)):
    success = crud.delete_transaction(db, transaction_id)
    if not success: raise HTTPException(status_code=404, detail="Транзакция не найдена")
    return {"message": "Транзакция удалена"}


# ========== КОНСТАНТЫ ДЛЯ РАСЧЁТА ЗАРПЛАТЫ ==========
STANDARD_WORKING_DAYS = 21
STANDARD_HOURS_PER_DAY = 9


# ========== ЗАПУСК СЕРВЕРА ==========
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

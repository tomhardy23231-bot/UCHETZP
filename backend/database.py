# database.py - Конфигурация базы данных SQLite
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os

# Получаем URL базы данных из переменной окружения или используем SQLite по умолчанию
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./payroll.db")

# Параметры подключения: для SQLite нужен check_same_thread=False
connect_args = {}
if SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

# Создаём движок базы данных
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args=connect_args
)

# Создаём сессию для работы с БД
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Базовый класс для моделей
Base = declarative_base()


# Зависимость для получения сессии БД в эндпоинтах
def get_db():
    """Создаёт и возвращает сессию базы данных."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

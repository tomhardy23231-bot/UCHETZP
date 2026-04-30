from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os

# Получаем URL базы данных из переменной окружения
database_url = os.getenv("DATABASE_URL")

# Если переменная DATABASE_URL не задана, вызываем ошибку
if not database_url:
    raise ValueError("DATABASE_URL environment variable is not set")

# Исправляем устаревшую схему 'postgres://' на 'postgresql://' для совместимости со SQLAlchemy >= 1.4
if database_url.startswith("postgres://"):
    database_url = database_url.replace("postgres://", "postgresql://", 1)

# Создаём движок SQLAlchemy для PostgreSQL (без параметров SQLite)
# pool_pre_ping=True - проверяем соединение перед запросом и пересоздаём, если оно
# протухло (актуально для Neon: база засыпает после 5 минут простоя на free тарифе).
# pool_recycle=300 - пересоздаём соединения каждые 5 минут, чтобы они не "протухали".
engine = create_engine(
    database_url,
    pool_pre_ping=True,
    pool_recycle=300,
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

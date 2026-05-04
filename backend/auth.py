# auth.py - JWT-аутентификация, хеширование паролей, зависимости FastAPI
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

import database
import models


JWT_SECRET = os.getenv("JWT_SECRET", "dev-only-change-me-in-production")
JWT_ALGORITHM = "HS256"
TOKEN_TTL_DAYS = 7

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


def hash_password(password: str) -> str:
    """Хеширует пароль через bcrypt."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    """Сверяет пароль с хешем."""
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def create_access_token(user_id: int) -> str:
    """Создаёт JWT-токен на TOKEN_TTL_DAYS дней."""
    expire = datetime.now(timezone.utc) + timedelta(days=TOKEN_TTL_DAYS)
    payload = {"sub": str(user_id), "exp": expire}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


_credentials_error = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Не авторизован",
    headers={"WWW-Authenticate": "Bearer"},
)


def get_current_user(
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(database.get_db),
) -> models.User:
    """Извлекает текущего пользователя из JWT-токена."""
    if not token:
        raise _credentials_error
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = int(payload.get("sub", 0))
    except (jwt.PyJWTError, ValueError, TypeError):
        raise _credentials_error

    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise _credentials_error
    return user


def require_admin(user: models.User = Depends(get_current_user)) -> models.User:
    """Зависимость: только администратор имеет доступ."""
    if user.role != models.UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Доступ только для администратора",
        )
    return user


def require_employee(user: models.User = Depends(get_current_user)) -> models.User:
    """Зависимость: только сотрудник с привязкой к employee_id."""
    if user.role != models.UserRole.EMPLOYEE or user.employee_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Доступ только для сотрудников",
        )
    return user


def seed_admin():
    """Создаёт администратора из ENV-переменных при первом запуске.

    Использует ADMIN_USERNAME и ADMIN_PASSWORD. Если переменные не заданы —
    тихо пропускает (например, в CI или при первом деплое до настройки).
    """
    admin_username = os.getenv("ADMIN_USERNAME")
    admin_password = os.getenv("ADMIN_PASSWORD")
    if not admin_username or not admin_password:
        return

    db = database.SessionLocal()
    try:
        existing = db.query(models.User).filter(
            models.User.username == admin_username
        ).first()
        if existing:
            # Пользователь уже создан — не трогаем (чтобы не сбрасывать пароль на каждом старте)
            return
        admin = models.User(
            username=admin_username,
            password_hash=hash_password(admin_password),
            role=models.UserRole.ADMIN,
        )
        db.add(admin)
        db.commit()
    finally:
        db.close()

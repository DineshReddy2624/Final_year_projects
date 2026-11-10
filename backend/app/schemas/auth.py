from typing import Optional
from pydantic import BaseModel, EmailStr, Field

try:
    from app.schemas.user import UserResponse
except ImportError:
    from backend.app.schemas.user import UserResponse


class UserRegisterRequest(BaseModel):
    full_name: Optional[str] = Field(default=None, max_length=100, examples=["John Doe"])
    username: Optional[str] = Field(default=None, max_length=100, examples=["johndoe"])
    email: EmailStr = Field(examples=["john@example.com"])
    password: str = Field(min_length=6, max_length=100, examples=["securepassword123"])


class UserLoginRequest(BaseModel):
    email: EmailStr = Field(examples=["john@example.com"])
    password: str = Field(min_length=1, examples=["securepassword123"])


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class LogoutResponse(BaseModel):
    status: str = "success"
    message: str = "Successfully logged out"


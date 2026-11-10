from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

try:
    from app.api.dependencies import get_current_active_user
    from app.core.logger import logger
    from app.core.security import create_access_token, hash_password, verify_password
    from app.database.connection import get_db
    from app.models.user import User, UserPreference
    from app.schemas.auth import LogoutResponse, TokenResponse, UserLoginRequest, UserRegisterRequest
    from app.schemas.user import UserResponse
except ImportError:
    from backend.app.api.dependencies import get_current_active_user
    from backend.app.core.logger import logger
    from backend.app.core.security import create_access_token, hash_password, verify_password
    from backend.app.database.connection import get_db
    from backend.app.models.user import User, UserPreference
    from backend.app.schemas.auth import LogoutResponse, TokenResponse, UserLoginRequest, UserRegisterRequest
    from backend.app.schemas.user import UserResponse

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user account",
    description="Registers a new user, hashes the password using Argon2, creates default preferences, and returns a JWT access token.",
)
async def register_user(
    payload: UserRegisterRequest,
    db: Session = Depends(get_db),
) -> TokenResponse:
    normalized_email = payload.email.strip().lower()

    # Check for duplicate email
    existing_user = db.query(User).filter(User.email == normalized_email).first()
    if existing_user:
        logger.warning(f"Registration rejected: duplicate email '{normalized_email}'")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email address already exists.",
        )

    # Hash password using Argon2
    hashed_pwd = hash_password(payload.password)

    # Resolve full name
    user_name = (payload.full_name or payload.username or normalized_email.split("@")[0]).strip()
    if not user_name:
        user_name = "Traveler"

    # Create user entity
    new_user = User(
        full_name=user_name,
        email=normalized_email,
        hashed_password=hashed_pwd,
        is_active=True,
    )
    db.add(new_user)
    db.flush()  # Flush to obtain new_user.id

    # Create associated default user preferences
    default_preferences = UserPreference(
        user_id=new_user.id,
        preferred_categories="Sightseeing, Culture, Food",
        preferred_activities="Exploring historic landmarks, dining",
        preferred_transport="Public Transit",
        preferred_budget="Medium",
        preferred_travel_style="Balanced",
    )
    db.add(default_preferences)
    db.commit()
    db.refresh(new_user)

    logger.info(f"User registered successfully: id={new_user.id}, email='{new_user.email}'")

    # Generate JWT token
    access_token = create_access_token(subject=new_user.id)
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse.model_validate(new_user),
    )


@router.post(
    "/login",
    response_model=TokenResponse,
    status_code=status.HTTP_200_OK,
    summary="User login with email and password",
    description="Authenticates credentials and returns a signed JWT access token.",
)
async def login_user(
    payload: UserLoginRequest,
    db: Session = Depends(get_db),
) -> TokenResponse:
    normalized_email = payload.email.strip().lower()
    user = db.query(User).filter(User.email == normalized_email).first()

    if not user or not verify_password(payload.password, user.hashed_password):
        logger.warning(f"Login failed: invalid credentials for email '{normalized_email}'")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        logger.warning(f"Login rejected: user account '{normalized_email}' is inactive")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This user account has been deactivated",
        )

    access_token = create_access_token(subject=user.id)
    logger.info(f"User logged in successfully: id={user.id}")

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse.model_validate(user),
    )


@router.post(
    "/logout",
    response_model=LogoutResponse,
    status_code=status.HTTP_200_OK,
    summary="User logout",
    description="Terminates the user session. Validates bearer token if present and returns logout confirmation.",
)
async def logout_user(
    current_user: User = Depends(get_current_active_user),
) -> LogoutResponse:
    logger.info(f"User logged out: id={current_user.id}")
    return LogoutResponse(
        status="success",
        message="Successfully logged out",
    )


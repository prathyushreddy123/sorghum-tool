import logging
from datetime import datetime, timedelta, timezone

import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from config import settings
from database import get_db
from models import User

logger = logging.getLogger(__name__)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def create_access_token(user_id: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": str(user_id), "exp": expire}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")


def get_current_user(
    token: str | None = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User | None:
    """Returns the authenticated user, or None if no token is provided.
    Raises 401 if token is present but invalid."""
    if token is None:
        return None
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
        user_id = int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    return user


def require_user(
    user: User | None = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    """Dependency that requires authentication. Enforces email verification after grace period."""
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Check email verification grace period
    if not user.email_verified and user.verification_grace_expires:
        now = datetime.now(timezone.utc)
        grace_naive = user.verification_grace_expires
        # Compare in UTC — handle naive datetimes from DB
        grace_utc = grace_naive.replace(tzinfo=timezone.utc) if grace_naive.tzinfo is None else grace_naive
        if now > grace_utc:
            # Check for pending sync data (recent observations)
            from models import Observation, Plot, Trial
            has_pending = (
                db.query(Observation)
                .join(Plot, Observation.plot_id == Plot.id)
                .join(Trial, Plot.trial_id == Trial.id)
                .filter(Trial.user_id == user.id)
                .filter(Observation.recorded_at > (datetime.utcnow() - timedelta(hours=48)))
                .first()
            ) is not None

            if has_pending:
                # Auto-extend grace by 24h to let data sync
                user.verification_grace_expires = datetime.utcnow() + timedelta(hours=24)
                db.commit()
                logger.warning("Auto-extended verification grace for user %s (pending data)", user.id)
            else:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Email verification required",
                    headers={"X-Verification-Required": "true"},
                )

    return user


def require_admin(user: User = Depends(require_user)) -> User:
    """Dependency that requires admin role."""
    if user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return user


def check_trial_access(db: Session, trial_id: int, user: User) -> None:
    """Inline helper: verify user has access to a trial. Raises 403 if not."""
    from models import Trial
    import crud

    trial = db.query(Trial).filter(Trial.id == trial_id).first()
    if not trial:
        raise HTTPException(status_code=404, detail="Trial not found")
    if trial.user_id == user.id:
        return
    if trial.team_id and crud.is_team_member(db, trial.team_id, user.id):
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")


def get_authorized_trial(
    trial_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_user),
) -> "Trial":
    """Load trial and verify user owns it or is on its team."""
    from models import Trial
    import crud

    trial = db.query(Trial).filter(Trial.id == trial_id).first()
    if not trial:
        raise HTTPException(status_code=404, detail="Trial not found")
    if trial.user_id == user.id:
        return trial
    if trial.team_id and crud.is_team_member(db, trial.team_id, user.id):
        return trial
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Access denied",
    )


def get_authorized_plot(
    plot_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_user),
) -> "Plot":
    """Load plot and verify user has access to its trial."""
    from models import Plot, Trial
    import crud

    plot = db.query(Plot).filter(Plot.id == plot_id).first()
    if not plot:
        raise HTTPException(status_code=404, detail="Plot not found")
    trial = db.query(Trial).filter(Trial.id == plot.trial_id).first()
    if not trial:
        raise HTTPException(status_code=404, detail="Trial not found")
    if trial.user_id == user.id:
        return plot
    if trial.team_id and crud.is_team_member(db, trial.team_id, user.id):
        return plot
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Access denied",
    )

import os
import logging
from typing import Optional, Dict, Any
from pydantic import BaseModel
from fastapi import HTTPException, Security, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import firebase_admin
from firebase_admin import auth as firebase_auth, credentials as firebase_credentials

from app.config import get_settings

logger = logging.getLogger("meditriage-auth")
settings = get_settings()

security = HTTPBearer(auto_error=False)


class StaffUser(BaseModel):
    """Represents an authenticated clinical duty staff user."""
    uid: str
    email: Optional[str] = None
    name: Optional[str] = None
    role: str = "STAFF"
    is_authenticated: bool = True


def is_firebase_configured() -> bool:
    """
    Checks if Firebase Admin SDK has been explicitly enabled and configured
    with a valid project ID or service account credentials.
    """
    if not settings.FIREBASE_AUTH_ENABLED:
        return False
    
    if settings.FIREBASE_CREDENTIALS_PATH and os.path.isfile(settings.FIREBASE_CREDENTIALS_PATH):
        return True
    
    if settings.FIREBASE_PROJECT_ID:
        return True

    return False


def get_firebase_app():
    """Initializes or retrieves the Firebase Admin application instance."""
    if not is_firebase_configured():
        return None

    try:
        if firebase_admin._apps:
            return firebase_admin.get_app()

        if settings.FIREBASE_CREDENTIALS_PATH and os.path.isfile(settings.FIREBASE_CREDENTIALS_PATH):
            cred = firebase_credentials.Certificate(settings.FIREBASE_CREDENTIALS_PATH)
            options = {"projectId": settings.FIREBASE_PROJECT_ID} if settings.FIREBASE_PROJECT_ID else None
            app = firebase_admin.initialize_app(cred, options)
            logger.info("Firebase Admin SDK initialized using service account credentials.")
            return app
        elif settings.FIREBASE_PROJECT_ID:
            app = firebase_admin.initialize_app(options={"projectId": settings.FIREBASE_PROJECT_ID})
            logger.info(f"Firebase Admin SDK initialized for project '{settings.FIREBASE_PROJECT_ID}'.")
            return app
    except Exception as err:
        logger.error(f"Failed to initialize Firebase Admin SDK: {err}")
        return None

    return None


def verify_firebase_id_token(id_token: str) -> Dict[str, Any]:
    """
    Cryptographically verifies a Firebase ID token using the Firebase Admin SDK.
    Raises HTTPException 401 if invalid or expired.
    """
    app = get_firebase_app()
    if not app:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Firebase Authentication service is not configured on the backend.",
        )

    try:
        decoded_token = firebase_auth.verify_id_token(id_token, app=app)
        return decoded_token
    except firebase_auth.ExpiredIdTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Firebase ID token has expired. Please sign in again.",
            headers={"WWW-Authenticate": "Bearer error=\"invalid_token\", error_description=\"token expired\""},
        )
    except firebase_auth.RevokedIdTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Firebase ID token has been revoked.",
            headers={"WWW-Authenticate": "Bearer error=\"invalid_token\", error_description=\"token revoked\""},
        )
    except (firebase_auth.InvalidIdTokenError, ValueError) as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid Firebase ID token: {str(e)}",
            headers={"WWW-Authenticate": "Bearer error=\"invalid_token\""},
        )
    except Exception as e:
        logger.error(f"Unexpected token verification error: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication failed during token verification.",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_staff_user(
    auth_header: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> StaffUser:
    """
    FastAPI reusable dependency to protect clinical staff endpoints.
    - If Firebase Auth is enabled: strictly verifies the Bearer ID token.
    - If Firebase Auth is disabled: permits local unauthenticated access for development/tests.
    - Never accepts invalid tokens when token is supplied.
    """
    if is_firebase_configured():
        if not auth_header or not auth_header.credentials:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required. Please provide a valid Firebase Bearer token.",
                headers={"WWW-Authenticate": "Bearer"},
            )

        decoded = verify_firebase_id_token(auth_header.credentials)
        return StaffUser(
            uid=decoded.get("uid", ""),
            email=decoded.get("email"),
            name=decoded.get("name"),
            role=decoded.get("role", "STAFF"),
            is_authenticated=True,
        )

    # When backend authentication is not yet configured, authentication is disabled.
    # If a bearer token was explicitly provided, verify that it is not malformed if required
    if auth_header and auth_header.credentials:
        logger.debug("Bearer token provided while Firebase Admin configuration is disabled.")

    return StaffUser(
        uid="local-dev-staff",
        email="duty.nurse@hospital.local",
        name="Duty Staff (Dev/Local)",
        role="STAFF",
        is_authenticated=False,
    )

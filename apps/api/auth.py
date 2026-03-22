"""
Supabase JWT Authentication Dependency
=======================================
Verifies Supabase access tokens on protected API routes.
Usage:
    from auth import get_current_user, get_optional_user

    @router.post("/my-endpoint")
    async def my_endpoint(user: dict = Depends(get_current_user)):
        user_id = user["sub"]
        ...
"""

import os
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional

# Supabase JWT secret — same as the one in your Supabase project settings
# It's the raw JWT secret, NOT the anon/service key.
# Supabase signs tokens with the project JWT secret.
SUPABASE_JWT_SECRET = os.environ.get("SUPABASE_JWT_SECRET", "")

# Fallback: if no dedicated JWT_SECRET, skip verification in dev
API_ENV = os.environ.get("API_ENV", "development")

security = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> dict:
    """
    Mandatory auth dependency — returns decoded JWT payload or raises 401.
    In development mode without SUPABASE_JWT_SECRET, allows unauthenticated access
    with a placeholder user for easier local testing.
    """
    if not credentials:
        # In dev without a JWT secret, allow anonymous access for testing
        if API_ENV == "development" and not SUPABASE_JWT_SECRET:
            return {"sub": "dev-anonymous", "role": "anon"}
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authorization token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    try:
        if not SUPABASE_JWT_SECRET:
            # No secret configured — decode without verification (dev only)
            payload = jwt.decode(token, options={"verify_signature": False})
        else:
            payload = jwt.decode(
                token,
                SUPABASE_JWT_SECRET,
                algorithms=["HS256"],
                audience="authenticated",
            )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> Optional[dict]:
    """
    Optional auth dependency — returns decoded JWT payload or None.
    Use this for endpoints that work both authenticated and anonymously
    (e.g., job search works for everyone, but scoring needs auth).
    """
    if not credentials:
        return None
    try:
        if not SUPABASE_JWT_SECRET:
            return jwt.decode(credentials.credentials, options={"verify_signature": False})
        return jwt.decode(
            credentials.credentials,
            SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience="authenticated",
        )
    except jwt.InvalidTokenError:
        return None

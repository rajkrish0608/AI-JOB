"""
API Rate Limiter
================
Provides rate limiting for all API endpoints using slowapi.

Rate Limits:
  • General endpoints: 10 requests/minute per user
  • AI endpoints: 5 requests/minute per user

User identification:
  1. JWT user ID (from Authorization header) — preferred
  2. Fallback: client IP address
"""

import jwt
import os
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from starlette.requests import Request
from starlette.responses import JSONResponse

SUPABASE_JWT_SECRET = os.environ.get("SUPABASE_JWT_SECRET", "")


def _get_user_identifier(request: Request) -> str:
    """
    Extract a unique user identifier for rate limiting.
    Priority: JWT sub claim > client IP address.
    """
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
        try:
            if SUPABASE_JWT_SECRET:
                payload = jwt.decode(
                    token,
                    SUPABASE_JWT_SECRET,
                    algorithms=["HS256"],
                    audience="authenticated",
                )
            else:
                payload = jwt.decode(token, options={"verify_signature": False})
            user_id = payload.get("sub")
            if user_id:
                return f"user:{user_id}"
        except jwt.InvalidTokenError:
            pass  # Fall through to IP-based limiting

    # Fallback: use client IP
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return f"ip:{forwarded.split(',')[0].strip()}"
    client = request.client
    return f"ip:{client.host}" if client else "ip:unknown"


# ── Rate Limit Constants ──
GENERAL_LIMIT = "10/minute"
AI_LIMIT = "5/minute"

# ── Limiter Instance ──
# default_limits applies to ALL endpoints automatically via SlowAPIMiddleware.
# AI endpoints override with the stricter AI_LIMIT using @limiter.limit(AI_LIMIT).
limiter = Limiter(key_func=_get_user_identifier, default_limits=[GENERAL_LIMIT])


def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    """Custom 429 response with a clear user-friendly message."""
    return JSONResponse(
        status_code=429,
        content={
            "error": "rate_limit_exceeded",
            "message": "Too many requests. Please wait a moment and try again.",
            "detail": str(exc.detail),
        },
    )

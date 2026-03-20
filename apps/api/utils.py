import os
from arq.connections import RedisSettings
from urllib.parse import urlparse

def get_redis_settings() -> RedisSettings:
    """Parse REDIS_URL env var into ARQ RedisSettings.
    Supports: redis://, rediss:// (Upstash TLS) and plain host:port.
    """
    url = os.getenv("REDIS_URL", "redis://localhost:6379")
    if url.startswith("rediss://") or url.startswith("redis://"):
        parsed = urlparse(url)
        return RedisSettings(
            host=parsed.hostname or "localhost",
            port=parsed.port or 6379,
            password=parsed.password or None,
            ssl=url.startswith("rediss://"),
        )
    # Fallback: bare host
    return RedisSettings(host=os.getenv("REDIS_HOST", "localhost"), port=6379)

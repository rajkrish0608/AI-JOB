"""
Gemini API Retry & Concurrency Utility
========================================
Production-ready helper for Gemini API calls on the free tier.

Features:
  • Concurrency control — asyncio.Semaphore limits parallel requests (default: 2)
  • Exponential backoff — 2s → 4s → 8s → 16s with ±25% jitter
  • Structured logging — every retry attempt is logged with context
  • Graceful fallback — returns a typed exception for user-friendly error messages
"""

import asyncio
import logging
import random
import time
from dataclasses import dataclass

logger = logging.getLogger("gemini_retry")

# ── Configuration ────────────────────────────────────────────────────────────
MAX_RETRIES = 4
BASE_DELAY_SECONDS = 2.0          # 2s, 4s, 8s, 16s with jitter
MAX_CONCURRENT_REQUESTS = 2       # Free tier: 15 RPM — keep headroom

# Global semaphore — shared across ALL routers
_semaphore = asyncio.Semaphore(MAX_CONCURRENT_REQUESTS)


# ── Fallback Exception ───────────────────────────────────────────────────────

class GeminiRateLimitError(Exception):
    """Raised when all retries are exhausted due to rate limiting."""

    def __init__(self, attempts: int, total_wait: float):
        self.attempts = attempts
        self.total_wait = total_wait
        self.message = "AI is busy, please try again shortly"
        self.status = "retry_later"
        super().__init__(self.message)

    def to_dict(self) -> dict:
        return {
            "message": self.message,
            "status": self.status,
            "attempts": self.attempts,
            "total_wait_seconds": round(self.total_wait, 1),
        }


# ── Core Function ────────────────────────────────────────────────────────────

async def generate_with_retry(
    model,
    prompt: str,
    generation_config: dict | None = None,
    max_retries: int = MAX_RETRIES,
    base_delay: float = BASE_DELAY_SECONDS,
):
    """
    Call model.generate_content_async with concurrency control and auto-retry.

    Flow:
      1. Acquire semaphore slot (max 2 concurrent requests)
      2. Send request to Gemini API
      3. On 429 → log, wait with exponential backoff, retry
      4. After all retries exhausted → raise GeminiRateLimitError

    Args:
        model: The Gemini GenerativeModel instance
        prompt: The prompt string to send
        generation_config: Optional generation config dict (temperature, etc.)
        max_retries: Maximum number of retry attempts
        base_delay: Base delay in seconds for exponential backoff

    Returns:
        The Gemini API response object

    Raises:
        GeminiRateLimitError: If all retries exhausted (rate limit)
        Exception: Original exception for non-rate-limit errors
    """
    total_wait = 0.0
    last_exception: Exception | None = None

    async with _semaphore:
        logger.debug(
            f"[Gemini] Acquired semaphore slot "
            f"({MAX_CONCURRENT_REQUESTS - _semaphore._value}/{MAX_CONCURRENT_REQUESTS} slots in use)"
        )

        for attempt in range(max_retries + 1):
            try:
                kwargs = {}
                if generation_config:
                    kwargs["generation_config"] = generation_config

                start_time = time.monotonic()
                response = await model.generate_content_async(prompt, **kwargs)
                elapsed = time.monotonic() - start_time

                if attempt > 0:
                    logger.info(
                        f"[Gemini] ✅ Succeeded after {attempt} retries "
                        f"(total wait: {total_wait:.1f}s, response: {elapsed:.1f}s)"
                    )
                else:
                    logger.debug(f"[Gemini] ✅ Response in {elapsed:.1f}s")

                return response

            except Exception as e:
                last_exception = e
                error_str = str(e).lower()

                # Classify the error
                is_rate_limit = any(keyword in error_str for keyword in (
                    "429", "resource exhausted", "rate limit",
                    "too many requests", "quota",
                ))

                if not is_rate_limit:
                    logger.error(f"[Gemini] ❌ Non-retryable error: {type(e).__name__}: {e}")
                    raise  # Not a rate limit — fail fast

                if attempt >= max_retries:
                    logger.error(
                        f"[Gemini] ❌ All {max_retries + 1} attempts exhausted "
                        f"(total wait: {total_wait:.1f}s). Raising fallback."
                    )
                    raise GeminiRateLimitError(
                        attempts=max_retries + 1,
                        total_wait=total_wait,
                    ) from e

                # Calculate backoff
                delay = base_delay * (2 ** attempt)
                jitter = delay * 0.25 * (random.random() * 2 - 1)  # ±25%
                wait_time = max(delay + jitter, 1.0)  # At least 1s
                total_wait += wait_time

                logger.warning(
                    f"[Gemini] ⚠️  Rate limited (429) | "
                    f"Attempt {attempt + 1}/{max_retries + 1} | "
                    f"Waiting {wait_time:.1f}s | "
                    f"Error: {type(e).__name__}"
                )

                await asyncio.sleep(wait_time)

    # Should never reach here
    if last_exception:
        raise last_exception
    raise RuntimeError("Unexpected: no response and no exception")

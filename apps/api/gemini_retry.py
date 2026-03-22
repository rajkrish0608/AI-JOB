"""
Gemini API Retry Utility
=========================
Shared helper to handle Gemini API rate limiting (429 errors) on the free tier.
Uses exponential backoff with jitter to automatically retry on rate limit errors.
"""

import asyncio
import logging
import random

logger = logging.getLogger(__name__)

# Free tier: 15 RPM, 1500 RPD, 1M TPM
MAX_RETRIES = 4
BASE_DELAY_SECONDS = 2.0  # 2s, 4s, 8s, 16s with jitter


async def generate_with_retry(
    model,
    prompt: str,
    generation_config: dict | None = None,
    max_retries: int = MAX_RETRIES,
    base_delay: float = BASE_DELAY_SECONDS,
):
    """
    Call model.generate_content_async with automatic retry on 429 errors.
    
    Uses exponential backoff: 2s → 4s → 8s → 16s (with ±25% jitter).
    Total max wait: ~30 seconds before giving up.
    
    Args:
        model: The Gemini GenerativeModel instance
        prompt: The prompt string to send
        generation_config: Optional generation config dict (temperature, etc.)
        max_retries: Maximum number of retry attempts
        base_delay: Base delay in seconds for exponential backoff
    
    Returns:
        The Gemini API response object
    
    Raises:
        The original exception after all retries are exhausted
    """
    last_exception = None
    
    for attempt in range(max_retries + 1):
        try:
            kwargs = {}
            if generation_config:
                kwargs["generation_config"] = generation_config
            
            response = await model.generate_content_async(prompt, **kwargs)
            
            if attempt > 0:
                logger.info(f"Gemini API succeeded after {attempt} retries")
            
            return response
            
        except Exception as e:
            last_exception = e
            error_str = str(e).lower()
            
            # Only retry on rate limit (429) errors
            is_rate_limit = (
                "429" in error_str
                or "resource exhausted" in error_str
                or "rate limit" in error_str
                or "too many requests" in error_str
                or "quota" in error_str
            )
            
            if not is_rate_limit or attempt >= max_retries:
                raise  # Not a rate limit error or out of retries — fail fast
            
            # Exponential backoff with jitter
            delay = base_delay * (2 ** attempt)
            jitter = delay * 0.25 * (random.random() * 2 - 1)  # ±25%
            wait_time = delay + jitter
            
            logger.warning(
                f"Gemini API rate limited (attempt {attempt + 1}/{max_retries + 1}). "
                f"Retrying in {wait_time:.1f}s..."
            )
            
            await asyncio.sleep(wait_time)
    
    # Should never reach here, but just in case
    raise last_exception

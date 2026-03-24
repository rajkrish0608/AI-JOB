"""
Input Sanitizer
===============
Provides production-grade input sanitization for all user-supplied text
before it reaches AI models (Gemini).

Protections:
  • Strips prompt injection patterns ("ignore previous instructions", etc.)
  • Removes control characters and zero-width chars
  • Enforces max length limits
  • Strips HTML/script tags from text fields
  • Logs when suspicious input is detected
"""

import re
import logging
from typing import Optional

logger = logging.getLogger("input_sanitizer")

# ── Prompt injection patterns ────────────────────────────────────────────────
# Case-insensitive patterns that indicate prompt injection attempts
_INJECTION_PATTERNS = [
    r"ignore\s+(all\s+)?previous\s+instructions",
    r"ignore\s+(all\s+)?prior\s+instructions",
    r"disregard\s+(all\s+)?previous",
    r"forget\s+(all\s+)?(your\s+)?instructions",
    r"you\s+are\s+now\s+a",
    r"act\s+as\s+(a\s+)?different",
    r"new\s+instructions?\s*:",
    r"system\s*:\s*you\s+are",
    r"<\s*system\s*>",
    r"\[\s*system\s*\]",
    r"override\s+(all\s+)?rules",
    r"bypass\s+(all\s+)?restrictions",
    r"reveal\s+(your\s+)?(system\s+)?prompt",
    r"show\s+(your\s+)?(system\s+)?prompt",
    r"output\s+(your\s+)?(system\s+)?prompt",
    r"print\s+(your\s+)?instructions",
]

_COMPILED_PATTERNS = [re.compile(p, re.IGNORECASE) for p in _INJECTION_PATTERNS]

# Control characters and zero-width characters to strip
_CONTROL_CHARS = re.compile(
    r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f"
    r"\u200b\u200c\u200d\u200e\u200f"  # zero-width chars
    r"\u2028\u2029"                     # line/paragraph separators
    r"\ufeff\ufff9\ufffa\ufffb]"        # BOM and interlinear annotations
)

# HTML tag stripper for text fields (not for HTML output)
_HTML_TAGS = re.compile(r"<[^>]+>")


def sanitize_text(
    text: str,
    max_length: int = 10000,
    field_name: str = "input",
    strip_html: bool = True,
) -> str:
    """
    Sanitize a single text field for safe use in AI prompts.

    Args:
        text: Raw user input
        max_length: Maximum allowed length (truncates if exceeded)
        field_name: Name of the field (for logging)
        strip_html: Whether to remove HTML tags

    Returns:
        Sanitized text string
    """
    if not text:
        return text

    original = text

    # 1. Strip control characters and zero-width chars
    text = _CONTROL_CHARS.sub("", text)

    # 2. Strip HTML tags from text fields
    if strip_html:
        text = _HTML_TAGS.sub("", text)

    # 3. Neutralize prompt injection patterns
    for pattern in _COMPILED_PATTERNS:
        if pattern.search(text):
            logger.warning(
                f"[Sanitizer] ⚠️  Prompt injection pattern detected in '{field_name}': "
                f"matched pattern '{pattern.pattern}'"
            )
            # Replace the injection attempt with a harmless marker
            text = pattern.sub("[FILTERED]", text)

    # 4. Enforce max length
    if len(text) > max_length:
        logger.warning(
            f"[Sanitizer] Input '{field_name}' truncated from {len(text)} to {max_length} chars"
        )
        text = text[:max_length]

    # 5. Normalize whitespace (collapse multiple spaces/newlines)
    text = re.sub(r"\n{3,}", "\n\n", text)  # max 2 consecutive newlines
    text = text.strip()

    if text != original:
        logger.info(f"[Sanitizer] Sanitized '{field_name}' (changed)")

    return text


def sanitize_prompt_inputs(**kwargs) -> dict:
    """
    Sanitize multiple named inputs at once.

    Usage:
        clean = sanitize_prompt_inputs(
            job_title=body.title,
            company=body.company,
            description=body.description,
        )
        # Access via clean["job_title"], clean["company"], etc.
    """
    result = {}
    for field_name, value in kwargs.items():
        if isinstance(value, str):
            max_len = 500 if field_name in ("job_title", "company", "email", "name") else 10000
            result[field_name] = sanitize_text(value, max_length=max_len, field_name=field_name)
        elif isinstance(value, list):
            result[field_name] = [
                sanitize_text(item, max_length=500, field_name=f"{field_name}[{i}]")
                if isinstance(item, str) else item
                for i, item in enumerate(value)
            ]
        else:
            result[field_name] = value
    return result

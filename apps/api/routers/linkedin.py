"""
LinkedIn Profile Scraper
========================
Extracts structured profile data from public LinkedIn profiles.

Strategy:
  1. Fetch the public LinkedIn page with realistic browser headers.
  2. Parse the HTML with BeautifulSoup to extract metadata and visible text.
  3. Send the extracted text to Gemini for structured extraction,
     identical to the resume parser output schema so the onboarding form
     can consume data from either source interchangeably.

LinkedIn heavily rate-limits and blocks scrapers.
In production you would add:
  - Rotating residential proxies
  - A Playwright/headless-browser fallback
  - Caching with Redis
  - Rate limiting per user
"""

import json
import re
from fastapi import APIRouter, HTTPException, Depends, Request
from auth import get_current_user
from rate_limiter import limiter, AI_LIMIT
from input_sanitizer import sanitize_text
from pydantic import BaseModel
from typing import Optional
import httpx
from bs4 import BeautifulSoup
import os
import google.generativeai as genai
from gemini_retry import generate_with_retry, GeminiRateLimitError

router = APIRouter()

# Configure Gemini
genai.configure(api_key=os.environ.get("GEMINI_API_KEY"))
model = genai.GenerativeModel(
    model_name="gemini-2.0-flash",
    generation_config={"response_mime_type": "application/json"}
)

# ── Request / Response models ────────────────────────────────────────────────

class LinkedInScrapeRequest(BaseModel):
    linkedin_url: str   # e.g. https://linkedin.com/in/username

class LinkedInScrapeResponse(BaseModel):
    status: str
    data: Optional[dict] = None
    message: Optional[str] = None


# ── Helpers ──────────────────────────────────────────────────────────────────

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
}

EXTRACTION_PROMPT = """
You are a data-extraction API.
Given the following text scraped from a LinkedIn public profile page,
extract the person's professional information into the JSON schema below.

If a field cannot be determined, use null or an empty array/string.

EXPECTED JSON SCHEMA:
{{
  "first_name": "string",
  "last_name": "string",
  "headline": "string",
  "location_city": "string",
  "location_state": "string",
  "location_country": "string",
  "about": "string",
  "linkedin_url": "{url}",
  "skills": ["string"],
  "experience": [
    {{
      "position": "string",
      "company": "string",
      "period": "string",
      "location": "string",
      "industry": "string",
      "responsibilities": ["string"]
    }}
  ],
  "education": [
    {{
      "education_level": "string",
      "institution": "string",
      "field_of_study": "string",
      "grade": "string",
      "year_start": "string",
      "year_end": "string"
    }}
  ],
  "certifications": [
    {{
      "name": "string",
      "issuer": "string",
      "date": "string"
    }}
  ],
  "languages": [
    {{
      "language": "string",
      "proficiency": "string"
    }}
  ]
}}

SCRAPED TEXT:
{text}

IMPORTANT:
1. Return ONLY valid JSON, starting with {{ and ending with }}.
2. Do NOT include markdown formatting or explanations.
"""


def _clean_url(url: str) -> str:
    """Normalise a LinkedIn profile URL."""
    url = url.strip().rstrip("/")
    # Accept both linkedin.com/in/user and full https urls
    if not url.startswith("http"):
        url = "https://www." + url.lstrip("/")
    return url


def _extract_text_from_html(html: str) -> str:
    """Pull meaningful text from a LinkedIn public profile page."""
    soup = BeautifulSoup(html, "lxml")

    # Remove noise elements
    for tag in soup(["script", "style", "noscript", "svg", "img", "header", "footer"]):
        tag.decompose()

    # Try to get the main profile section
    profile_section = soup.find("main") or soup.find("div", class_=re.compile("profile"))
    target = profile_section if profile_section else soup

    # Get text, collapse whitespace
    lines = []
    for element in target.stripped_strings:
        line = element.strip()
        if line and len(line) > 1:
            lines.append(line)

    return "\n".join(lines)


# ── Endpoint ─────────────────────────────────────────────────────────────────

@router.post("/scrape-linkedin", response_model=LinkedInScrapeResponse)
@limiter.limit(AI_LIMIT)
async def scrape_linkedin(request: Request, body: LinkedInScrapeRequest, user: dict = Depends(get_current_user)):
    """
    Scrape a public LinkedIn profile and return structured profile data.
    The response JSON is compatible with the onboarding form schema used
    by the resume parser endpoint.
    """

    url = _clean_url(body.linkedin_url)

    # Basic URL validation
    if "linkedin.com/in/" not in url:
        raise HTTPException(
            status_code=400,
            detail="URL must be a LinkedIn profile link (linkedin.com/in/username)."
        )

    # ── 1. Fetch page ────────────────────────────────────────────────────────
    try:
        async with httpx.AsyncClient(
            follow_redirects=True,
            timeout=20.0,
            headers=HEADERS,
        ) as http:
            resp = await http.get(url)
            resp.raise_for_status()
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 999:
            return LinkedInScrapeResponse(
                status="blocked",
                message=(
                    "LinkedIn blocked the request. "
                    "Please try again later or enter your details manually."
                ),
            )
        raise HTTPException(status_code=502, detail=f"LinkedIn returned HTTP {exc.response.status_code}")
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail=f"Could not reach LinkedIn: {str(exc)}")

    # ── 2. Extract text ──────────────────────────────────────────────────────
    profile_text = _extract_text_from_html(resp.text)

    if len(profile_text) < 50:
        return LinkedInScrapeResponse(
            status="insufficient",
            message=(
                "Could not extract enough information from the public profile. "
                "The profile may be private. Please enter your details manually."
            ),
        )

    # ── 3. AI extraction ────────────────────────────────────────────────────
    try:
        prompt_text = EXTRACTION_PROMPT.format(url=url, text=sanitize_text(profile_text[:12000], max_length=12000, field_name="linkedin_text", strip_html=False))
        ai_resp = await generate_with_retry(
            model,
            prompt_text,
            generation_config={"temperature": 0.0},
        )

        content = ai_resp.text.strip()
        parsed = json.loads(content)
        return LinkedInScrapeResponse(status="success", data=parsed)

    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="AI returned invalid JSON; please try again.")
    except GeminiRateLimitError as rle:
        raise HTTPException(status_code=503, detail=rle.to_dict())
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AI extraction failed: {str(exc)}")

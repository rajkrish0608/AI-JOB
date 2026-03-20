"""
LinkedIn Profile Scraper
========================
Extracts structured profile data from public LinkedIn profiles.

Strategy:
  1. Fetch the public LinkedIn page with realistic browser headers.
  2. Parse the HTML with BeautifulSoup to extract metadata and visible text.
  3. Send the extracted text to Claude 3.5 Sonnet for structured extraction,
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
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import httpx
from bs4 import BeautifulSoup
from anthropic import AsyncAnthropic

router = APIRouter()
client = AsyncAnthropic()

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
async def scrape_linkedin(body: LinkedInScrapeRequest):
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
        ai_resp = await client.messages.create(
            model="claude-3-5-sonnet-20240620",
            max_tokens=4096,
            temperature=0.0,
            system="You are an extraction API that only outputs valid JSON.",
            messages=[
                {
                    "role": "user",
                    "content": EXTRACTION_PROMPT.format(url=url, text=profile_text[:12000]),
                }
            ],
        )

        content = ai_resp.content[0].text.strip()
        if content.startswith("```"):
            content = re.sub(r"^```\w*\n?", "", content)
            content = re.sub(r"\n?```$", "", content)

        parsed = json.loads(content)
        return LinkedInScrapeResponse(status="success", data=parsed)

    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="AI returned invalid JSON; please try again.")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AI extraction failed: {str(exc)}")

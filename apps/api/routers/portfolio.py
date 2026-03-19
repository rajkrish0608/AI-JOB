"""
Portfolio Scraper
=================
Extracts structured professional data from personal portfolio websites.

Strategy:
  1. Fetch the target URL using httpx (following redirects).
  2. Parse the HTML using BeautifulSoup to extract visible text,
     removing navigation, footers, scripts, and styles.
  3. Send the extracted text to Claude 3.5 Sonnet to structure it
     into the standard Profile onboarding JSON schema.
"""

import json
import re
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import httpx
from bs4 import BeautifulSoup
from anthropic import AsyncAnthropic

router = APIRouter()
client = AsyncAnthropic()

class PortfolioScrapeRequest(BaseModel):
    portfolio_url: str

class PortfolioScrapeResponse(BaseModel):
    status: str
    data: dict | None = None
    message: str | None = None

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

EXTRACTION_PROMPT = """
You are a data-extraction API.
Given the following text scraped from a personal portfolio website,
extract the person's professional information into the JSON schema below.
Try to infer standard fields from the free-form text.

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
  "portfolio_url": "{url}",
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
  "projects": [
    {{
      "name": "string",
      "description": "string",
      "tech_stack": ["string"],
      "link": "string"
    }}
  ],
  "certifications": [
    {{
      "name": "string",
      "issuer": "string",
      "date": "string"
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
    url = url.strip()
    if not url.startswith("http://") and not url.startswith("https://"):
        url = "https://" + url
    return url

def _extract_text(html: str) -> str:
    soup = BeautifulSoup(html, "lxml")
    for tag in soup(["script", "style", "noscript", "svg", "img", "nav", "footer", "meta", "link"]):
        tag.decompose()
    
    # Try to grab main content first
    main_content = soup.find("main") or soup.find("div", role="main")
    if not main_content:
        main_content = soup.body if soup.body else soup

    lines = []
    for element in main_content.stripped_strings:
        line = element.strip()
        if line and len(line) > 1:
            lines.append(line)

    return "\n".join(lines)


@router.post("/scrape-portfolio", response_model=PortfolioScrapeResponse)
async def scrape_portfolio(body: PortfolioScrapeRequest):
    """
    Scrapes a personal portfolio site and extracts structured profile data
    using Claude 3.5 Sonnet.
    """
    url = _clean_url(body.portfolio_url)

    # 1. Fetch
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=20.0, headers=HEADERS) as http:
            resp = await http.get(url)
            resp.raise_for_status()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Failed to fetch portfolio: {str(exc)}")

    # 2. Extract Text
    text = _extract_text(resp.text)
    if len(text) < 50:
        return PortfolioScrapeResponse(
            status="insufficient",
            message="Could not extract enough text from the portfolio website."
        )

    # 3. AI Parsing
    try:
        ai_resp = await client.messages.create(
            model="claude-3-5-sonnet-20240620",
            max_tokens=4096,
            temperature=0.0,
            system="You are an extraction API that only outputs valid JSON.",
            messages=[
                {
                    "role": "user",
                    "content": EXTRACTION_PROMPT.format(url=url, text=text[:15000]),
                }
            ],
        )

        content = ai_resp.content[0].text.strip()
        if content.startswith("```"):
            content = re.sub(r"^```\w*\n?", "", content)
            content = re.sub(r"\n?```$", "", content)

        parsed = json.loads(content)
        return PortfolioScrapeResponse(status="success", data=parsed)

    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="AI returned invalid JSON; please try again.")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AI extraction failed: {str(exc)}")

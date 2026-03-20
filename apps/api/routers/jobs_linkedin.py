"""
LinkedIn Job Search Scraper
============================
Scrapes LinkedIn's public job search listings.

Strategy:
  - Hit LinkedIn's guest-accessible job search endpoint with query params.
  - Parse the HTML response with BeautifulSoup to extract job cards.
  - Return structured JSON with job title, company, location, URL, posted date.

Notes:
  - LinkedIn guest search works without auth but is rate-limited.
  - In production, add rotating proxies and Redis caching.
"""

import re
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
import httpx
from bs4 import BeautifulSoup

router = APIRouter()

# ── Models ───────────────────────────────────────────────────────────────────

class JobListing(BaseModel):
    title: str
    company: str
    location: str
    url: str
    posted: Optional[str] = None
    description_snippet: Optional[str] = None
    source: str = "linkedin"

class JobSearchResponse(BaseModel):
    status: str
    total: int
    jobs: list[JobListing]
    message: Optional[str] = None

# ── Constants ────────────────────────────────────────────────────────────────

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

LINKEDIN_JOBS_URL = "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search"

# ── Endpoint ─────────────────────────────────────────────────────────────────

@router.get("/jobs/linkedin", response_model=JobSearchResponse)
async def search_linkedin_jobs(
    keywords: str = Query(..., description="Job title or keywords"),
    location: str = Query("India", description="Location to search in"),
    page: int = Query(0, ge=0, description="Page number (0-indexed, 25 results per page)"),
    remote: bool = Query(False, description="Filter for remote jobs only"),
    job_type: str = Query(None, description="F=Full-time, P=Part-time, C=Contract, I=Internship"),
):
    """
    Search LinkedIn for job listings matching the given keywords and location.
    Returns structured job data including title, company, location, and URL.
    """

    params = {
        "keywords": keywords,
        "location": location,
        "start": page * 25,
    }

    # Remote filter (f_WT=2 is remote on LinkedIn)
    if remote:
        params["f_WT"] = "2"

    # Job type filter
    if job_type:
        type_map = {"F": "F", "P": "P", "C": "C", "I": "I"}
        if job_type.upper() in type_map:
            params["f_JT"] = type_map[job_type.upper()]

    try:
        async with httpx.AsyncClient(
            follow_redirects=True, timeout=20.0, headers=HEADERS
        ) as http:
            resp = await http.get(LINKEDIN_JOBS_URL, params=params)

            if resp.status_code == 429 or resp.status_code == 999:
                return JobSearchResponse(
                    status="rate_limited",
                    total=0,
                    jobs=[],
                    message="LinkedIn rate-limited us. Please try again in a few minutes.",
                )
            resp.raise_for_status()

    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"LinkedIn request failed: {str(exc)}")

    # Parse HTML
    soup = BeautifulSoup(resp.text, "lxml")
    job_cards = soup.find_all("div", class_=re.compile("base-card"))

    jobs: list[JobListing] = []

    for card in job_cards:
        try:
            title_tag = card.find("h3", class_=re.compile("base-search-card__title"))
            company_tag = card.find("h4", class_=re.compile("base-search-card__subtitle"))
            location_tag = card.find("span", class_=re.compile("job-search-card__location"))
            link_tag = card.find("a", class_=re.compile("base-card__full-link"))
            time_tag = card.find("time")
            snippet_tag = card.find("p", class_=re.compile("job-search-card__snippet"))

            title = title_tag.get_text(strip=True) if title_tag else "Unknown"
            company = company_tag.get_text(strip=True) if company_tag else "Unknown"
            loc = location_tag.get_text(strip=True) if location_tag else ""
            url = link_tag.get("href", "").split("?")[0] if link_tag else ""
            posted = time_tag.get("datetime", "") if time_tag else None
            snippet = snippet_tag.get_text(strip=True) if snippet_tag else None

            if title != "Unknown":
                jobs.append(
                    JobListing(
                        title=title,
                        company=company,
                        location=loc,
                        url=url,
                        posted=posted,
                        description_snippet=snippet,
                        source="linkedin",
                    )
                )
        except Exception:
            continue  # Skip malformed cards

    return JobSearchResponse(
        status="success",
        total=len(jobs),
        jobs=jobs,
    )

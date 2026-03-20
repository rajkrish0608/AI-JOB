"""
Indeed Job Search Scraper
=========================
Scrapes Indeed.com job listings for India-focused job search.

Strategy:
  - Hit Indeed's public search URL with query & location params.
  - Parse the HTML response with BeautifulSoup to extract job cards.
  - Return the standard JobListing schema.

Note on Anti-Bot:
  - Indeed is protected by Cloudflare and strict anti-scraping measures.
  - Standard httpx requests may often encounter Captchas (HTTP 403).
  - In a production environment, this requires rotating residential proxies,
    TLS-impersonating HTTP clients (like curl_cffi), or headless browsers (Playwright/Selenium).
"""

import re
import json
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
import httpx
from bs4 import BeautifulSoup

router = APIRouter()

# ── Models (shared schema) ──────────────────────────────────────────────────

class JobListing(BaseModel):
    title: str
    company: str
    location: str
    url: str
    posted: Optional[str] = None
    description_snippet: Optional[str] = None
    salary: Optional[str] = None
    source: str = "indeed"

class JobSearchResponse(BaseModel):
    status: str
    total: int
    jobs: list[JobListing]
    message: Optional[str] = None

# ── Constants ────────────────────────────────────────────────────────────────

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
}

# ── Endpoint ─────────────────────────────────────────────────────────────────

@router.get("/jobs/indeed", response_model=JobSearchResponse)
async def search_indeed_jobs(
    keywords: str = Query(..., description="Job title or keywords"),
    location: str = Query("", description="City or location (e.g., 'Bangalore', 'Remote')"),
    page: int = Query(0, ge=0, description="Page number (0-indexed, usually increments of 10 results)"),
):
    """
    Search Indeed.com (India) for job listings matching criteria.
    Returns structured job data compatible with the aggregator.
    """

    # Indeed pagination uses 'start' param (0, 10, 20...)
    start = page * 10
    
    # Base URL for India
    base_url = "https://in.indeed.com/jobs"
    
    params = {
        "q": keywords,
        "l": location,
        "start": start
    }

    try:
        async with httpx.AsyncClient(
            follow_redirects=True, timeout=20.0, headers=HEADERS
        ) as http:
            resp = await http.get(base_url, params=params)

            if resp.status_code in [403, 429]:
                return JobSearchResponse(
                    status="blocked",
                    total=0,
                    jobs=[],
                    message="Indeed blocked the request (Captcha/Rate Limit). Try again later.",
                )
            resp.raise_for_status()

    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Indeed request failed: {str(exc)}")

    soup = BeautifulSoup(resp.text, "lxml")
    jobs: list[JobListing] = []

    # Indeed contains job data embedded in a large script tag (mosaic data)
    # but the HTML itself also has standard <li> elements with class `css-5lfssm` or `eu4oa1w0`
    
    job_cards = soup.find_all("div", class_=re.compile("job_seen_beacon"))

    for card in job_cards:
        try:
            # Title & URL
            title_tag = card.find("h2", class_=re.compile("jobTitle"))
            link_tag = title_tag.find("a") if title_tag else None
            
            title = link_tag.find("span").get_text(strip=True) if link_tag and link_tag.find("span") else None
            # Extract just the ID if possible to build clean absolute URL
            jk = link_tag.get("data-jk") if link_tag else None
            url = f"https://in.indeed.com/viewjob?jk={jk}" if jk else ""
            if not url and link_tag:
                raw_href = link_tag.get("href", "")
                url = f"https://in.indeed.com{raw_href}" if raw_href.startswith("/") else raw_href
            
            # Company
            company_tag = card.find("span", {"data-testid": "company-name"})
            company = company_tag.get_text(strip=True) if company_tag else "Unknown"
            
            # Location
            location_tag = card.find("div", {"data-testid": "text-location"})
            loc = location_tag.get_text(strip=True) if location_tag else ""
            
            # Salary
            salary_tag = card.find("div", class_=re.compile("salary-snippet-container"))
            salary = salary_tag.get_text(strip=True) if salary_tag else None
            
            # Snippet / description
            summary_tag = card.find("div", class_=re.compile("jobMetaDataGroup|underTheJobCard"))
            # Specifically grab the li tags from snippet
            snippet_bullets = card.find_all("li", {"data-testid": re.compile("snippet")})
            snippet = " ".join([bullet.get_text(strip=True) for bullet in snippet_bullets]) if snippet_bullets else None
            
            # Posted Date
            date_tag = card.find("span", class_=re.compile("date"))
            posted = date_tag.get_text(strip=True).replace("Posted", "").replace("EmployerActive", "").strip() if date_tag else None

            if title:
                jobs.append(
                    JobListing(
                        title=title,
                        company=company,
                        location=loc,
                        url=url,
                        posted=posted,
                        description_snippet=snippet,
                        salary=salary,
                        source="indeed",
                    )
                )
        except Exception:
            continue

    return JobSearchResponse(
        status="success",
        total=len(jobs),
        jobs=jobs,
    )

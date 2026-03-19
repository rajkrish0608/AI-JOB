"""
Internshala Job Search Scraper
==============================
Scrapes Internshala for Internships and Fresher Jobs.

Strategy:
  - Internshala's HTML is fairly clean and predictable.
  - Search URL combines keywords and location directly into the path.
"""

import re
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
import httpx
from bs4 import BeautifulSoup

router = APIRouter()

# ── Models (shared schema) ──────────────────────────────────────────────────

class JobListing(BaseModel):
    title: str
    company: str
    location: str
    url: str
    posted: str | None = None
    description_snippet: str | None = None
    salary: str | None = None
    source: str = "internshala"

class JobSearchResponse(BaseModel):
    status: str
    total: int
    jobs: list[JobListing]
    message: str | None = None

# ── Constants ────────────────────────────────────────────────────────────────

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml",
    "Accept-Language": "en-US,en;q=0.5",
}

# ── Endpoint ─────────────────────────────────────────────────────────────────

@router.get("/jobs/internshala", response_model=JobSearchResponse)
async def search_internshala_jobs(
    keywords: str = Query(..., description="Job title or keywords (e.g. 'react', 'python')"),
    location: str = Query("", description="City or location"),
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
):
    """
    Search Internshala for internships and entry-level jobs.
    Returns structured job data compatible with the aggregator.
    """

    kw = keywords.strip().replace(" ", "-").lower()
    loc = location.strip().replace(" ", "-").lower()

    # Build path: e.g. /internships/keywords-internship-in-location
    # Or /jobs/keywords-jobs-in-location
    
    # For now, let's search internships as it's the primary use case, 
    # and "fresher jobs" if specified. Standard search merges them if you hit the raw search endpoint.
    
    # Using general search API/URL
    if loc:
        search_path = f"{kw}-jobs-in-{loc}"
    else:
        search_path = f"{kw}-jobs"
        
    url = f"https://internshala.com/jobs/{search_path}/page-{page}"

    try:
        async with httpx.AsyncClient(
            follow_redirects=True, timeout=20.0, headers=HEADERS
        ) as http:
            resp = await http.get(url)

            if resp.status_code == 404:
                 # Try internship path if jobs path 404s
                 if loc:
                     search_path = f"internships/keywords-{kw}-internships-in-{loc}"
                 else:
                     search_path = f"internships/keywords-{kw}"
                 url = f"https://internshala.com/{search_path}/page-{page}"
                 resp = await http.get(url)

            if resp.status_code in [403, 429]:
                 return JobSearchResponse(
                     status="rate_limited",
                     total=0,
                     jobs=[],
                     message="Internshala rate-limited us. Try again later.",
                 )
                 
            # If still 404, there's just no jobs matching that exact slug pattern
            if resp.status_code == 404:
                return JobSearchResponse(status="success", total=0, jobs=[])
                
            resp.raise_for_status()

    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Internshala request failed: {str(exc)}")

    soup = BeautifulSoup(resp.text, "lxml")
    jobs: list[JobListing] = []

    # Internshala job cards have an id starting with 'individual_internship_'
    cards = soup.find_all("div", id=re.compile(r"^individual_internship_"))

    for card in cards:
        try:
            title_tag = card.find("h3", class_="job-internship-name")
            company_tag = card.find("p", class_="company-name")
            loc_tag = card.find("div", class_="row-1-item locations")
            
            # Salary/Stipend is usually under the class 'stipend' or 'salary'
            sal_tag = card.find("span", class_="stipend") or card.find("div", class_="salary")

            # Posted date/time - usually bottom left
            status_tag = card.find("div", class_="status-success") or card.find("div", class_="status-container")

            if not title_tag:
                continue

            title = title_tag.get_text(strip=True)
            link_tag = title_tag.find("a")
            # Internshala uses relative links: /job/detail/slug
            url = f"https://internshala.com{link_tag['href']}" if link_tag and 'href' in link_tag.attrs else ""
            
            company = company_tag.get_text(strip=True) if company_tag else "Unknown"
            
            # Location parsing (multiple locations handled as span children or text)
            loc = "Unknown"
            if loc_tag:
                loc_anchors = loc_tag.find_all("a")
                if loc_anchors:
                    loc = ", ".join([a.get_text(strip=True) for a in loc_anchors])
                else:
                    loc = loc_tag.get_text(strip=True)

            salary = sal_tag.get_text(strip=True) if sal_tag else None
            posted = status_tag.get_text(strip=True) if status_tag else None

            jobs.append(
                JobListing(
                    title=title,
                    company=company,
                    location=loc,
                    url=url,
                    salary=salary,
                    posted=posted,
                    source="internshala",
                )
            )
        except Exception:
            continue

    return JobSearchResponse(
        status="success",
        total=len(jobs),
        jobs=jobs,
    )

"""
Naukri.com Job Search Scraper
==============================
Scrapes Naukri.com job listings for India-focused job search.

Strategy:
  - Hit Naukri's public search results page with keyword and location.
  - Parse the JSON-LD structured data and HTML job cards.
  - Return the same JobListing schema as the LinkedIn scraper.
"""

import re
import json
from fastapi import APIRouter, HTTPException, Query, Depends
from auth import get_current_user
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
    experience: Optional[str] = None
    source: str = "naukri"

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
    "Referer": "https://www.naukri.com/",
}

# ── Endpoint ─────────────────────────────────────────────────────────────────

@router.get("/jobs/naukri", response_model=JobSearchResponse)
async def search_naukri_jobs(
    keywords: str = Query(..., description="Job title or keywords"),
    location: str = Query("", description="City or location"),
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    experience: int = Query(None, description="Minimum years of experience (0 for freshers)"),
    salary: int = Query(None, description="Minimum salary in lakhs"),
    user: dict = Depends(get_current_user),
):
    """
    Search Naukri.com for Indian job listings matching the given criteria.
    Returns structured job data compatible with the aggregator.
    """

    # Build Naukri URL
    # Naukri uses URL-based search: naukri.com/keyword-jobs-in-location
    keyword_slug = keywords.lower().replace(" ", "-")
    location_slug = location.lower().replace(" ", "-") if location else ""

    if location_slug:
        search_url = f"https://www.naukri.com/{keyword_slug}-jobs-in-{location_slug}"
    else:
        search_url = f"https://www.naukri.com/{keyword_slug}-jobs"

    params = {}
    if page > 1:
        params["pageNo"] = str(page)
    if experience is not None:
        params["experience"] = str(experience)
    if salary is not None:
        params["salary"] = str(salary)

    try:
        async with httpx.AsyncClient(
            follow_redirects=True, timeout=20.0, headers=HEADERS
        ) as http:
            resp = await http.get(search_url, params=params)

            if resp.status_code == 429:
                return JobSearchResponse(
                    status="rate_limited",
                    total=0,
                    jobs=[],
                    message="Naukri.com rate-limited us. Please try again later.",
                )
            resp.raise_for_status()

    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Naukri request failed: {str(exc)}")

    soup = BeautifulSoup(resp.text, "lxml")
    jobs: list[JobListing] = []

    # Strategy 1: Try to extract JSON-LD structured data (most reliable)
    json_ld_scripts = soup.find_all("script", type="application/ld+json")
    for script in json_ld_scripts:
        try:
            data = json.loads(script.string or "")
            if isinstance(data, dict) and data.get("@type") == "ItemList":
                for item in data.get("itemListElement", []):
                    posting = item.get("item", item)
                    if posting.get("@type") == "JobPosting":
                        org = posting.get("hiringOrganization", {})
                        loc_data = posting.get("jobLocation", {})
                        address = loc_data.get("address", {}) if isinstance(loc_data, dict) else {}

                        jobs.append(
                            JobListing(
                                title=posting.get("title", "Unknown"),
                                company=org.get("name", "Unknown") if isinstance(org, dict) else "Unknown",
                                location=address.get("addressLocality", "") if isinstance(address, dict) else "",
                                url=posting.get("url", ""),
                                posted=posting.get("datePosted"),
                                description_snippet=(posting.get("description", ""))[:200] if posting.get("description") else None,
                                source="naukri",
                            )
                        )
        except (json.JSONDecodeError, AttributeError):
            continue

    # Strategy 2: Fallback — Parse HTML job cards
    if not jobs:
        job_cards = soup.find_all("article", class_=re.compile("jobTuple|srp-jobtuple", re.IGNORECASE))
        if not job_cards:
            job_cards = soup.find_all("div", class_=re.compile("jobTuple|cust-job-tuple", re.IGNORECASE))

        for card in job_cards:
            try:
                title_tag = card.find("a", class_=re.compile("title", re.IGNORECASE))
                company_tag = card.find("a", class_=re.compile("comp-name|subTitle", re.IGNORECASE))
                location_tag = card.find("span", class_=re.compile("loc|location|ellipsis", re.IGNORECASE))
                exp_tag = card.find("span", class_=re.compile("exp|expwdth", re.IGNORECASE))
                sal_tag = card.find("span", class_=re.compile("sal|salary", re.IGNORECASE))
                snippet_tag = card.find("span", class_=re.compile("job-desc|desc", re.IGNORECASE))

                title = title_tag.get_text(strip=True) if title_tag else None
                if not title:
                    continue

                jobs.append(
                    JobListing(
                        title=title,
                        company=company_tag.get_text(strip=True) if company_tag else "Unknown",
                        location=location_tag.get_text(strip=True) if location_tag else "",
                        url=title_tag.get("href", "") if title_tag else "",
                        description_snippet=snippet_tag.get_text(strip=True) if snippet_tag else None,
                        experience=exp_tag.get_text(strip=True) if exp_tag else None,
                        salary=sal_tag.get_text(strip=True) if sal_tag else None,
                        source="naukri",
                    )
                )
            except Exception:
                continue

    return JobSearchResponse(
        status="success",
        total=len(jobs),
        jobs=jobs,
    )

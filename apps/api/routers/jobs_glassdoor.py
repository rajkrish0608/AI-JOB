"""
Glassdoor Job Search Scraper
============================
Scrapes Glassdoor.co.in job listings.

Strategy:
  - Glassdoor relies heavily on React/Apollo Client hydration.
  - Their API is locked down with strict CORS and bot tokens.
  - We fetch the HTML page and look for the hydrated Apollo state
    inside a script tag ("apolloState" or "__NEXT_DATA__").
  - Fallback to parsing basic HTML if JS state isn't found.
  
Note:
  - Highly susceptible to captchas (403 DataDome). Needs proxy in prod.
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
    source: str = "glassdoor"

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
}

# ── Endpoint ─────────────────────────────────────────────────────────────────

@router.get("/jobs/glassdoor", response_model=JobSearchResponse)
async def search_glassdoor_jobs(
    keywords: str = Query(..., description="Job title or keywords"),
    location: str = Query("", description="City or location"),
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
):
    """
    Search Glassdoor India for job listings.
    Returns structured job data compatible with the aggregator.
    """

    kw_formatted = keywords.replace(" ", "-").lower()
    loc_formatted = location.replace(" ", "-").lower() if location else "india"

    # Glassdoor builds URLs like: /Job/bangalore-react-developer-jobs-SRCH_IL.0,9_IC2940587_KO10,25.htm
    # Without specific location IDs, keyword search is safer:
    base_url = "https://www.glassdoor.co.in/Job/jobs.htm"
    
    params = {
        "sc.keyword": keywords,
        "locT": "C" if location else "N", # City or National
        "locName": location if location else "India",
    }
    
    # Adding pagination param (Glassdoor uses p=...)
    if page > 1:
        params["p"] = str(page)

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
                    message="Glassdoor blocked the request (DataDome/Captcha). Try again later.",
                )
            resp.raise_for_status()

    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Glassdoor request failed: {str(exc)}")

    soup = BeautifulSoup(resp.text, "lxml")
    jobs: list[JobListing] = []

    # Strategy: Parse Apollo State embedded in <script>
    import re
    apollo_script = soup.find("script", string=re.compile("apolloState"))
    
    if apollo_script and apollo_script.string:
        try:
            # Very crude regex to grab the Apollo state JSON
            json_match = re.search(r'apolloState":({.*}),"appContext"', apollo_script.string)
            if json_match:
                state = json.loads(json_match.group(1))
                # Apollo state is a flat map of entities
                for key, val in state.items():
                    if key.startswith("JobListing:"):
                        # Reconstruct the job
                        title = val.get("jobtitle")
                        if not title:
                            title = val.get("title")

                        # We need valid jobs
                        if not title:
                            continue

                        company = "Unknown"
                        emp_ref = val.get("employer", {}).get("__ref")
                        if emp_ref and emp_ref in state:
                            company = state[emp_ref].get("shortName", "Unknown")

                        loc = val.get("location", "")
                        salary_summary = val.get("salaryEstimate", {}).get("currencyCode", "")
                        
                        jl_id = val.get("jobviewParams", {}).get("jl")
                        url = f"https://www.glassdoor.co.in/job-listing/?jl={jl_id}" if jl_id else ""

                        posted = val.get("ageInDays")
                        if posted is not None:
                            posted = f"{posted} days ago"

                        jobs.append(
                            JobListing(
                                title=title,
                                company=company,
                                location=loc,
                                url=url,
                                posted=posted,
                                salary=str(salary_summary) if salary_summary else None,
                                source="glassdoor",
                            )
                        )
        except Exception:
            pass

    # Fallback to HTML if Apollo payload parsing failed
    if not jobs:
        # Glassdoor often uses <li> with 'job-listing' or similar class
        cards = soup.find_all("li", class_=re.compile("JobsList_jobListItem", re.IGNORECASE))
        for card in cards:
            title_tag = card.find("a", class_=re.compile("JobCard_jobTitle", re.IGNORECASE))
            company_tag = card.find("span", class_=re.compile("EmployerProfile_employerName", re.IGNORECASE))
            loc_tag = card.find("div", class_=re.compile("JobCard_location", re.IGNORECASE))
            url_tag = card.find("a", href=True)
            sal_tag = card.find("div", class_=re.compile("JobCard_salaryEstimate", re.IGNORECASE))

            title = title_tag.get_text(strip=True) if title_tag else None
            if not title:
                continue

            comps = company_tag.get_text(strip=True) if company_tag else "Unknown"
            # Strip rating from company name (e.g. "Google ★4.5" -> "Google")
            comps = re.sub(r'(★|\d\.\d).*', '', comps).strip()

            jobs.append(
                JobListing(
                    title=title,
                    company=comps,
                    location=loc_tag.get_text(strip=True) if loc_tag else "",
                    url=url_tag["href"] if url_tag else "",
                    salary=sal_tag.get_text(strip=True) if sal_tag else None,
                    source="glassdoor",
                )
            )

    return JobSearchResponse(
        status="success",
        total=len(jobs),
        jobs=jobs[:25], # Limit results
    )

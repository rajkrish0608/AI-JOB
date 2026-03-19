"""
HR Email Finder — Hunter.io + Apollo.io
=========================================
Finds HR, recruiter, and hiring manager contacts at a target company
by querying Hunter.io (domain search) and Apollo.io (people search).

Endpoints:
  POST /api/outreach/find-contacts   → domain / company search
  POST /api/outreach/verify-email    → Hunter email verifier
"""

import os
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

router = APIRouter()

HUNTER_API_KEY  = os.getenv("HUNTER_API_KEY", "")
APOLLO_API_KEY  = os.getenv("APOLLO_API_KEY", "")
HUNTER_BASE     = "https://api.hunter.io/v2"
APOLLO_BASE     = "https://api.apollo.io/v1"

# ── HR-related job titles we're interested in ───────────────────────
HR_TITLE_KEYWORDS = [
    "hr", "human resources", "talent", "recruiter", "recruiting",
    "technical recruiter", "hr manager", "people", "hiring manager",
    "talent acquisition", "staffing", "head of people",
]

# ── Models ───────────────────────────────────────────────────────────

class Contact(BaseModel):
    name: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    title: Optional[str] = None
    linkedin_url: Optional[str] = None
    confidence: Optional[int] = None   # Hunter gives 0-100 score
    source: str                         # "hunter" | "apollo"

class FindContactsRequest(BaseModel):
    company_name: str
    company_domain: Optional[str] = None   # if known, skips domain lookup
    department: str = "Human Resources"
    max_results: int = 10

class FindContactsResponse(BaseModel):
    company_name: str
    domain: Optional[str]
    contacts: list[Contact]
    total_found: int

class VerifyEmailRequest(BaseModel):
    email: str

class VerifyEmailResponse(BaseModel):
    email: str
    status: str          # valid | invalid | accept_all | webmail | unknown
    score: Optional[int] = None
    mx_records: Optional[bool] = None


# ── Helper: domain lookup via Hunter ─────────────────────────────────

async def _hunter_find_domain(company_name: str) -> Optional[str]:
    """Use Hunter autocomplete API to find a company's domain from its name."""
    if not HUNTER_API_KEY:
        return None
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.get(
                f"{HUNTER_BASE}/autocomplete",
                params={"text": company_name, "api_key": HUNTER_API_KEY},
            )
            if r.status_code == 200:
                data = r.json()
                domains = data.get("data", {}).get("domains", [])
                if domains:
                    return domains[0].get("domain")
    except Exception:
        pass
    return None


# ── Hunter.io domain search ───────────────────────────────────────────

async def _hunter_domain_search(domain: str, max_results: int) -> list[Contact]:
    if not HUNTER_API_KEY:
        return []

    contacts: list[Contact] = []
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            r = await client.get(
                f"{HUNTER_BASE}/domain-search",
                params={
                    "domain": domain,
                    "api_key": HUNTER_API_KEY,
                    "limit": max_results * 2,   # fetch more, then filter
                    "type": "personal",
                },
            )
            if r.status_code != 200:
                return []

            emails = r.json().get("data", {}).get("emails", [])
            for e in emails:
                title = (e.get("position") or "").lower()
                # Filter to HR-related titles
                if not any(kw in title for kw in HR_TITLE_KEYWORDS):
                    continue
                contacts.append(Contact(
                    name=f"{e.get('first_name', '')} {e.get('last_name', '')}".strip() or None,
                    first_name=e.get("first_name"),
                    last_name=e.get("last_name"),
                    email=e.get("value"),
                    title=e.get("position"),
                    linkedin_url=e.get("linkedin"),
                    confidence=e.get("confidence"),
                    source="hunter",
                ))
                if len(contacts) >= max_results:
                    break
    except Exception:
        pass
    return contacts


# ── Apollo.io people search ───────────────────────────────────────────

async def _apollo_people_search(company_name: str, max_results: int) -> list[Contact]:
    if not APOLLO_API_KEY:
        return []

    contacts: list[Contact] = []
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            r = await client.post(
                f"{APOLLO_BASE}/mixed_people/search",
                headers={
                    "Content-Type": "application/json",
                    "Cache-Control": "no-cache",
                    "X-Api-Key": APOLLO_API_KEY,
                },
                json={
                    "q_organization_name": company_name,
                    "person_titles": [
                        "HR Manager",
                        "Recruiter",
                        "Technical Recruiter",
                        "Talent Acquisition",
                        "Head of People",
                        "HR Director",
                        "Hiring Manager",
                    ],
                    "page": 1,
                    "per_page": max_results,
                },
            )
            if r.status_code != 200:
                return []

            people = r.json().get("people", [])
            for p in people:
                email = (p.get("email") or "")
                # Apollo may not return emails on free plan — still useful for name/title
                contacts.append(Contact(
                    name=p.get("name"),
                    first_name=p.get("first_name"),
                    last_name=p.get("last_name"),
                    email=email if email else None,
                    title=p.get("title"),
                    linkedin_url=p.get("linkedin_url"),
                    confidence=None,
                    source="apollo",
                ))
    except Exception:
        pass
    return contacts


# ── Endpoints ────────────────────────────────────────────────────────

@router.post("/outreach/find-contacts", response_model=FindContactsResponse)
async def find_hr_contacts(body: FindContactsRequest):
    """
    Find HR / recruiter contacts for a given company using Hunter.io and Apollo.io.
    Results are deduplicated by email and sorted by confidence score.
    """
    # Step 1: Resolve domain
    domain = body.company_domain
    if not domain:
        domain = await _hunter_find_domain(body.company_name)

    # Step 2: Fetch from both sources in parallel
    import asyncio

    async def _no_contacts() -> list[Contact]:
        return []

    hunter_contacts, apollo_contacts = await asyncio.gather(
        _hunter_domain_search(domain, body.max_results) if domain else _no_contacts(),
        _apollo_people_search(body.company_name, body.max_results),
    )

    # Step 3: Merge & deduplicate by email
    seen_emails: set[str] = set()
    merged: list[Contact] = []

    for c in (hunter_contacts + apollo_contacts):
        key = (c.email or "").lower().strip()
        if key and key in seen_emails:
            continue
        if key:
            seen_emails.add(key)
        merged.append(c)

    # Step 4: Sort — Hunter contacts with high confidence first, then Apollo
    merged.sort(key=lambda c: (0 if c.email else 1, -(c.confidence or 0)))

    # Limit to max_results
    merged = merged[: body.max_results]

    return FindContactsResponse(
        company_name=body.company_name,
        domain=domain,
        contacts=merged,
        total_found=len(merged),
    )


@router.post("/outreach/verify-email", response_model=VerifyEmailResponse)
async def verify_email(body: VerifyEmailRequest):
    """
    Verify if an email address is deliverable using Hunter.io's Email Verifier API.
    """
    if not HUNTER_API_KEY:
        raise HTTPException(status_code=503, detail="HUNTER_API_KEY not configured")

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(
                f"{HUNTER_BASE}/email-verifier",
                params={"email": body.email, "api_key": HUNTER_API_KEY},
            )
            if r.status_code != 200:
                raise HTTPException(status_code=r.status_code, detail="Hunter API error")

            data = r.json().get("data", {})
            return VerifyEmailResponse(
                email=body.email,
                status=data.get("result", "unknown"),
                score=data.get("score"),
                mx_records=data.get("mx_records"),
            )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

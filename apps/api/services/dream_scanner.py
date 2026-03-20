"""
Dream Company Scanner — P7.2 / P7.3
=====================================
A background service that:
  1. Fetches all "active" dream companies for a user from Supabase.
  2. For each company, calls the jobs aggregator with the company name as keywords.
  3. Counts new roles found and updates the `dream_companies` row.
  4. Calls Hunter.io + Apollo.io to discover new HR / recruiter contacts.
  5. Deduplicates against existing contacts and inserts new ones.
  6. Updates `contacts_found_count` and `last_checked_at`.

Designed to be called as an arq background task:
  await ctx["redis"].enqueue_job("task_scan_dream_companies", user_id=...)
Or triggered via the FastAPI endpoint:
  POST /api/companies/scan
"""

import asyncio
import os
from datetime import datetime, timezone
from typing import Optional

import httpx
from supabase import acreate_client, AsyncClient

# ── Environment ──────────────────────────────────────────────────────────────

SUPABASE_URL         = os.getenv("NEXT_PUBLIC_SUPABASE_URL", os.getenv("SUPABASE_URL", ""))
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
HUNTER_API_KEY       = os.getenv("HUNTER_API_KEY", "")
APOLLO_API_KEY       = os.getenv("APOLLO_API_KEY", "")
INTERNAL_API_BASE    = "http://127.0.0.1:8000"

HR_TITLE_KEYWORDS = [
    "hr", "human resource", "talent", "recruiter", "recruiting",
    "hiring manager", "talent acquisition", "staffing", "head of people", "people ops",
]

# ── Supabase admin client (bypasses RLS using service role key) ──────────────

async def _get_supabase() -> AsyncClient:
    return await acreate_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


# ── Job scanning logic ────────────────────────────────────────────────────────

async def _scan_jobs_for_company(company_name: str, company_domain: Optional[str]) -> int:
    """
    Calls the internal /api/jobs/aggregate endpoint using the company name as keywords.
    Returns the count of jobs found.
    """
    try:
        async with httpx.AsyncClient(base_url=INTERNAL_API_BASE, timeout=30) as client:
            resp = await client.get("/api/jobs/aggregate", params={
                "keywords": company_name,
                "location": "India",
                "sources": "linkedin,naukri,indeed",
                "max_per_source": 10,
            })
            if resp.status_code == 200:
                data = resp.json()
                return data.get("total", 0)
    except Exception:
        pass
    return 0


# ── HR contact discovery ──────────────────────────────────────────────────────

async def _find_contacts(company_name: str, company_domain: Optional[str], max_results: int = 5) -> list[dict]:
    """
    Calls Hunter.io and Apollo.io to discover HR/recruiter contacts.
    Returns a list of raw contact dicts.
    """
    contacts: list[dict] = []

    # --- Hunter.io ---
    if HUNTER_API_KEY and company_domain:
        try:
            async with httpx.AsyncClient(timeout=12) as client:
                r = await client.get(
                    "https://api.hunter.io/v2/domain-search",
                    params={"domain": company_domain, "api_key": HUNTER_API_KEY, "limit": max_results * 2},
                )
                if r.status_code == 200:
                    emails = r.json().get("data", {}).get("emails", [])
                    for e in emails:
                        title = (e.get("position") or "").lower()
                        if not any(kw in title for kw in HR_TITLE_KEYWORDS):
                            continue
                        contacts.append({
                            "contact_name": f"{e.get('first_name', '')} {e.get('last_name', '')}".strip() or "Unknown",
                            "contact_title": e.get("position"),
                            "contact_email": e.get("value"),
                            "contact_linkedin_url": e.get("linkedin"),
                            "contact_role": _infer_role(title),
                            "source": "hunter",
                            "company_name": company_name,
                            "company_domain": company_domain,
                        })
                        if len(contacts) >= max_results:
                            break
        except Exception:
            pass

    # --- Apollo.io ---
    if APOLLO_API_KEY and len(contacts) < max_results:
        try:
            async with httpx.AsyncClient(timeout=12) as client:
                r = await client.post(
                    "https://api.apollo.io/v1/mixed_people/search",
                    headers={"Content-Type": "application/json", "X-Api-Key": APOLLO_API_KEY},
                    json={
                        "q_organization_name": company_name,
                        "person_titles": ["HR Manager", "Recruiter", "Technical Recruiter", "Talent Acquisition", "Hiring Manager"],
                        "page": 1,
                        "per_page": max_results,
                    },
                )
                if r.status_code == 200:
                    for p in r.json().get("people", []):
                        title = (p.get("title") or "").lower()
                        contacts.append({
                            "contact_name": p.get("name") or "Unknown",
                            "contact_title": p.get("title"),
                            "contact_email": p.get("email") or None,
                            "contact_linkedin_url": p.get("linkedin_url"),
                            "contact_role": _infer_role(title),
                            "source": "apollo",
                            "company_name": company_name,
                            "company_domain": company_domain,
                        })
        except Exception:
            pass

    return contacts[:max_results]


def _infer_role(title_lower: str) -> str:
    """Maps a job title string to our contact_role enum."""
    if "hiring manager" in title_lower:
        return "hiring_manager"
    if "talent acquisition" in title_lower:
        return "talent_acquisition"
    if "recruiter" in title_lower or "recruiting" in title_lower:
        return "recruiter"
    if "hr" in title_lower or "human resource" in title_lower:
        return "hr"
    if "people" in title_lower:
        return "hr"
    return "other"


# ── Main scanner function (called by arq worker or directly) ─────────────────

async def scan_company(
    db: AsyncClient,
    user_id: str,
    company_id: str,
    company_name: str,
    company_domain: Optional[str],
) -> dict:
    """
    Scans a single dream company for new jobs and contacts.
    Returns a dict with counts for logging.
    """
    now = datetime.now(timezone.utc).isoformat()

    # 1. Scan for jobs concurrently with contact discovery
    roles_count, raw_contacts = await asyncio.gather(
        _scan_jobs_for_company(company_name, company_domain),
        _find_contacts(company_name, company_domain),
    )

    # 2. Fetch existing contact emails to deduplicate
    existing_res = await db.table("company_contacts") \
        .select("contact_email") \
        .eq("dream_company_id", company_id) \
        .execute()
    existing_emails = {c.get("contact_email", "").lower() for c in (existing_res.data or []) if c.get("contact_email")}

    # 3. Insert new contacts
    new_contacts = []
    for c in raw_contacts:
        email = (c.get("contact_email") or "").lower().strip()
        if email and email in existing_emails:
            continue  # Skip duplicates
        if email:
            existing_emails.add(email)
        row = {
            "user_id": user_id,
            "dream_company_id": company_id,
            "outreach_status": "not_contacted",
            **{k: v for k, v in c.items() if v is not None},
        }
        new_contacts.append(row)

    inserted_count = 0
    if new_contacts:
        ins = await db.table("company_contacts").insert(new_contacts).execute()
        inserted_count = len(ins.data or [])

    # 4. Count total contacts for this company
    count_res = await db.table("company_contacts") \
        .select("id", count="exact") \
        .eq("dream_company_id", company_id) \
        .execute()
    total_contacts = count_res.count or 0

    # 5. Update dream_companies row
    update_payload: dict = {
        "last_checked_at": now,
        "contacts_found_count": total_contacts,
    }
    if roles_count > 0:
        update_payload["roles_found_count"] = roles_count
        update_payload["status"] = "role_found"

    await db.table("dream_companies") \
        .update(update_payload) \
        .eq("id", company_id) \
        .execute()

    return {
        "company": company_name,
        "roles_found": roles_count,
        "contacts_inserted": inserted_count,
        "total_contacts": total_contacts,
    }


async def scan_all_companies_for_user(user_id: str) -> list[dict]:
    """
    Fetches every 'active' dream company for a user and scans each one.
    Suitable for calling from the arq worker and the API trigger endpoint.
    """
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return [{"error": "Supabase not configured"}]

    db = await _get_supabase()

    # Fetch all active companies for this user
    res = await db.table("dream_companies") \
        .select("id, company_name, company_domain") \
        .eq("user_id", user_id) \
        .eq("status", "active") \
        .execute()

    companies = res.data or []
    if not companies:
        return []

    # Scan all companies concurrently (bounded to avoid thundering herd)
    sem = asyncio.Semaphore(3)

    async def _bounded_scan(c: dict) -> dict:
        async with sem:
            return await scan_company(
                db=db,
                user_id=user_id,
                company_id=c["id"],
                company_name=c["company_name"],
                company_domain=c.get("company_domain"),
            )

    results = await asyncio.gather(*[_bounded_scan(c) for c in companies], return_exceptions=True)

    return [r if isinstance(r, dict) else {"error": str(r)} for r in results]

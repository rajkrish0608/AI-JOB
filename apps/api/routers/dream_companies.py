"""
Dream Company Scan Router
==========================
Provides HTTP endpoints for dream company scanning and contact discovery.

Endpoints:
  POST /api/companies/scan           → Full scan for a given user_id
  GET  /api/companies/scan/trigger   → GET-based trigger for cron/testing
  POST /api/companies/discover       → Discover HR contacts for ONE company
"""

from fastapi import APIRouter, HTTPException, Query, Depends
from auth import get_current_user
from pydantic import BaseModel
from typing import Optional

from services.dream_scanner import (
    scan_all_companies_for_user,
    scan_company,
    _find_contacts,
    _get_supabase,
)

router = APIRouter()


class ScanRequest(BaseModel):
    user_id: str
    company_id: Optional[str] = None


class ScanResult(BaseModel):
    company: str
    roles_found: int
    contacts_inserted: int
    total_contacts: int
    error: Optional[str] = None


class DiscoverRequest(BaseModel):
    user_id: str
    company_id: str
    company_name: str
    company_domain: Optional[str] = None
    max_results: int = 10


class DiscoveredContact(BaseModel):
    contact_name: str
    contact_title: Optional[str] = None
    contact_email: Optional[str] = None
    contact_linkedin_url: Optional[str] = None
    contact_role: Optional[str] = None
    source: str


class DiscoverResponse(BaseModel):
    company_name: str
    discovered: int
    inserted: int
    contacts: list[DiscoveredContact]


@router.post("/companies/scan", response_model=list[ScanResult], tags=["companies"])
async def trigger_company_scan(body: ScanRequest, user: dict = Depends(get_current_user)):
    """
    Triggers a manual or cron-driven scan for the given user's dream companies.
    """
    try:
        results = await scan_all_companies_for_user(user_id=body.user_id)
        return [ScanResult(**r) for r in results]
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/companies/scan/trigger", tags=["companies"])
async def trigger_scan_via_get(user_id: str = Query(...), user: dict = Depends(get_current_user)):
    """GET-based trigger for easy testing and cron-compatible HTTP calls."""
    try:
        results = await scan_all_companies_for_user(user_id=user_id)
        return {"status": "ok", "scanned": len(results), "results": results}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/companies/discover", response_model=DiscoverResponse, tags=["companies"])
async def discover_contacts(body: DiscoverRequest, user: dict = Depends(get_current_user)):
    """
    Discover HR/recruiter contacts for a SINGLE dream company using
    Hunter.io and Apollo.io. Deduplicates against existing contacts and
    inserts new ones into the company_contacts table.

    This is the endpoint the frontend "Discover Contacts" button calls.
    """
    try:
        # 1. Discover contacts via Hunter + Apollo
        raw_contacts = await _find_contacts(
            company_name=body.company_name,
            company_domain=body.company_domain,
            max_results=body.max_results,
        )

        if not raw_contacts:
            return DiscoverResponse(
                company_name=body.company_name,
                discovered=0,
                inserted=0,
                contacts=[],
            )

        # 2. Get Supabase client and existing contacts for deduplication
        db = await _get_supabase()
        existing_res = await db.table("company_contacts") \
            .select("contact_email") \
            .eq("dream_company_id", body.company_id) \
            .execute()
        existing_emails = {
            c.get("contact_email", "").lower()
            for c in (existing_res.data or [])
            if c.get("contact_email")
        }

        # 3. Deduplicate and prepare inserts
        to_insert = []
        for c in raw_contacts:
            email = (c.get("contact_email") or "").lower().strip()
            if email and email in existing_emails:
                continue
            if email:
                existing_emails.add(email)
            row = {
                "user_id": body.user_id,
                "dream_company_id": body.company_id,
                "outreach_status": "not_contacted",
                **{k: v for k, v in c.items() if v is not None},
            }
            to_insert.append(row)

        # 4. Insert new contacts
        inserted_count = 0
        if to_insert:
            ins = await db.table("company_contacts").insert(to_insert).execute()
            inserted_count = len(ins.data or [])

        # 5. Update the contacts_found_count on the dream_companies row
        count_res = await db.table("company_contacts") \
            .select("id", count="exact") \
            .eq("dream_company_id", body.company_id) \
            .execute()
        total_contacts = count_res.count or 0

        await db.table("dream_companies") \
            .update({"contacts_found_count": total_contacts}) \
            .eq("id", body.company_id) \
            .execute()

        return DiscoverResponse(
            company_name=body.company_name,
            discovered=len(raw_contacts),
            inserted=inserted_count,
            contacts=[DiscoveredContact(**{
                k: c.get(k)
                for k in ["contact_name", "contact_title", "contact_email",
                           "contact_linkedin_url", "contact_role", "source"]
            }) for c in raw_contacts],
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

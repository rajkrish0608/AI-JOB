"""
Dream Company Scan Router
==========================
Provides an HTTP endpoint to trigger a dream company scan
for a specific user (or all users via a cron trigger).

Endpoints:
  POST /api/companies/scan        → Trigger scan for a given user_id
  GET  /api/companies/scan/status → Get last scan timestamps for user
"""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional

from services.dream_scanner import scan_all_companies_for_user

router = APIRouter()


class ScanRequest(BaseModel):
    user_id: str
    company_id: Optional[str] = None   # optional: scan one company only


class ScanResult(BaseModel):
    company: str
    roles_found: int
    contacts_inserted: int
    total_contacts: int
    error: Optional[str] = None


@router.post("/companies/scan", response_model=list[ScanResult], tags=["companies"])
async def trigger_company_scan(body: ScanRequest):
    """
    Triggers a manual or cron-driven scan for the given user's dream companies.
    For each active company:
      - Searches for open roles using the jobs aggregator.
      - Discovers new HR/recruiter contacts via Hunter.io + Apollo.io.
      - Updates `roles_found_count`, `contacts_found_count`, and `last_checked_at`.
    """
    try:
        results = await scan_all_companies_for_user(user_id=body.user_id)
        return [ScanResult(**r) for r in results]
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/companies/scan/trigger", tags=["companies"])
async def trigger_scan_via_get(user_id: str = Query(..., description="The user UUID to scan for")):
    """
    GET-based trigger for easy testing and cron-compatible HTTP calls.
    Same as POST /api/companies/scan but accessible via a simple GET request.
    """
    try:
        results = await scan_all_companies_for_user(user_id=user_id)
        return {"status": "ok", "scanned": len(results), "results": results}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

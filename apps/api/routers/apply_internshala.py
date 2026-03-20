"""
Internshala Apply Automation
==============================
Uses Playwright to automate applying on Internshala.

Internshala Flow:
  1. Login via cookies
  2. Click "Apply now"
  3. Fill out the "Why should you be hired?" text area (Cover Letter snippet)
  4. Submit application

Endpoint:
  POST /api/apply/internshala
"""

import json
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeout
from anthropic import AsyncAnthropic

router = APIRouter()
ai_client = AsyncAnthropic()

# ── Models ───────────────────────────────────────────────────────────

class InternshalaApplyRequest(BaseModel):
    job_url: str                         # Full Internshala job/internship URL
    auth_cookies: dict                   # e.g. {"PHPSESSID": "...", "is_logged_in": "1"}
    profile: dict                        # User profile for AI answers
    headless: bool = True
    timeout_seconds: int = 45

class ApplyStepLog(BaseModel):
    step: str
    status: str
    detail: Optional[str] = None

class InternshalaApplyResponse(BaseModel):
    status: str  # applied, already_applied, failed, requires_external
    job_title: Optional[str] = None
    company: Optional[str] = None
    steps: list[ApplyStepLog]
    error: Optional[str] = None


async def _generate_cover_snippet(job_title: str, company: str, profile: dict) -> str:
    """Use Claude to write a snappy 2-3 sentence 'Why should you be hired?' snippet."""
    try:
        resp = await ai_client.messages.create(
            model="claude-3-5-sonnet-20240620",
            max_tokens=250,
            temperature=0.7,
            system="You write exactly 2-3 compelling sentences answering 'Why should you be hired for this role?'. Base it on the given profile. No fluff.",
            messages=[{
                "role": "user",
                "content": f"Target Role: {job_title} at {company}\nProfile: {json.dumps(profile)}\n\nAnswer:"
            }]
        )
        return resp.content[0].text.strip()
    except Exception:
        return "I am a strong fit for this role given my background and skills."


@router.post("/apply/internshala", response_model=InternshalaApplyResponse)
async def apply_internshala(body: InternshalaApplyRequest):
    steps: list[ApplyStepLog] = []
    job_title = None
    company = None

    try:
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(headless=body.headless)
            context = await browser.new_context(
                user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                viewport={"width": 1280, "height": 800},
            )

            # Set cookies
            cookies_to_set = []
            for name, value in body.auth_cookies.items():
                cookies_to_set.append({
                    "name": name,
                    "value": value,
                    "domain": ".internshala.com",
                    "path": "/",
                })
            await context.add_cookies(cookies_to_set)

            page = await context.new_page()
            steps.append(ApplyStepLog(step="browser_launch", status="success"))

            await page.goto(body.job_url, wait_until="domcontentloaded", timeout=body.timeout_seconds * 1000)
            await page.wait_for_timeout(2000)
            steps.append(ApplyStepLog(step="navigate", status="success"))

            # Scrape metadata
            try:
                title_el = page.locator(".profile_on_detail_page").first
                job_title = (await title_el.text_content() or "").strip()
                company_el = page.locator(".company_name").first
                company = (await company_el.text_content() or "").strip()
            except Exception:
                pass

            # Check if already applied
            try:
                if await page.locator("text=Applied").first.is_visible():
                    await browser.close()
                    return InternshalaApplyResponse(
                        status="already_applied",
                        job_title=job_title,
                        company=company,
                        steps=steps + [ApplyStepLog(step="check_status", status="skipped")],
                    )
            except Exception:
                pass

            # Click Apply Now
            try:
                apply_btn = page.locator("button#make_application_button, button:has-text('Apply now')").first
                await apply_btn.wait_for(state="visible", timeout=5000)
                await apply_btn.click()
                await page.wait_for_timeout(2000)
                steps.append(ApplyStepLog(step="click_apply", status="success"))
            except PlaywrightTimeout:
                await browser.close()
                return InternshalaApplyResponse(
                    status="failed",
                    job_title=job_title,
                    company=company,
                    steps=steps + [ApplyStepLog(step="click_apply", status="failed")],
                    error="Apply button not found or external link.",
                )

            # Sometimes there's a "Proceed to application" modal
            try:
                proceed_btn = page.locator("button#continue_button, button:has-text('Proceed')").first
                if await proceed_btn.is_visible(timeout=2000):
                    await proceed_btn.click()
                    await page.wait_for_timeout(2000)
            except Exception:
                pass

            # Fill cover letter snippet
            try:
                textarea = page.locator("textarea#cover_letter, textarea[name='cover_letter']").first
                await textarea.wait_for(state="visible", timeout=5000)
                
                snippet = await _generate_cover_snippet(job_title or "this role", company or "your company", body.profile)
                await textarea.fill(snippet)
                steps.append(ApplyStepLog(step="fill_cover_letter", status="success", detail=f"{snippet[:30]}..."))
            except Exception:
                steps.append(ApplyStepLog(step="fill_cover_letter", status="skipped"))

            # Optional Assessment questions
            # Similar generic loop can be added here if needed, but Internshala mostly uses the single textarea 
            # and occasionally custom text inputs.
            try:
                questions = page.locator(".custom_question_container textarea")
                q_count = await questions.count()
                for i in range(q_count):
                    q_el = questions.nth(i)
                    q_text = await q_el.locator("xpath=preceding-sibling::label").text_content() or "Assessment Question"
                    ans = await _generate_cover_snippet(job_title or "", company or "", body.profile) # re-using Claude prompt generically
                    await q_el.fill(ans)
                    steps.append(ApplyStepLog(step=f"fill_custom_q_{i}", status="success"))
            except Exception:
                pass

            # Submit
            try:
                submit_btn = page.locator("input#submit, button:has-text('Submit application')").first
                await submit_btn.click()
                await page.wait_for_timeout(3000)
                steps.append(ApplyStepLog(step="submit", status="success"))
            except Exception:
                steps.append(ApplyStepLog(step="submit", status="failed"))

            await browser.close()

        return InternshalaApplyResponse(
            status="applied",
            job_title=job_title,
            company=company,
            steps=steps,
        )

    except Exception as exc:
        return InternshalaApplyResponse(
            status="failed",
            job_title=job_title,
            company=company,
            steps=steps,
            error=str(exc),
        )

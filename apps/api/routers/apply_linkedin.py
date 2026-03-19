"""
LinkedIn Easy Apply Automation
================================
Uses Playwright to automate LinkedIn Easy Apply for job listings.

Requires:
  - LinkedIn session cookies (li_at) for authentication
  - A generated resume PDF URL

Endpoint:
  POST /api/apply/linkedin
"""

import asyncio
import json
import re
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeout
from anthropic import AsyncAnthropic

router = APIRouter()
ai_client = AsyncAnthropic()

# ── Models ───────────────────────────────────────────────────────────

class LinkedInApplyRequest(BaseModel):
    job_url: str                        # Full LinkedIn job URL
    li_at_cookie: str                   # LinkedIn auth cookie
    resume_pdf_url: str | None = None   # Pre-generated resume PDF URL
    profile: dict                       # User profile for answering questions
    headless: bool = True               # Run browser headless?
    timeout_seconds: int = 60

class ApplyStepLog(BaseModel):
    step: str
    status: str  # success, skipped, failed
    detail: str | None = None

class LinkedInApplyResponse(BaseModel):
    status: str   # applied, already_applied, failed, requires_external
    job_title: str | None = None
    company: str | None = None
    steps: list[ApplyStepLog]
    error: str | None = None


async def _ai_answer_question(question: str, options: list[str], profile: dict) -> str:
    """Use Claude to answer a form question using the user's profile."""
    try:
        resp = await ai_client.messages.create(
            model="claude-3-5-sonnet-20240620",
            max_tokens=200,
            temperature=0,
            system="You answer job application form questions concisely based on the candidate profile. Return ONLY the answer text, nothing else.",
            messages=[{
                "role": "user",
                "content": f"Question: {question}\nOptions (if any): {json.dumps(options)}\nCandidate Profile: {json.dumps(profile)}\n\nAnswer:"
            }]
        )
        return resp.content[0].text.strip()
    except Exception:
        return ""


@router.post("/apply/linkedin", response_model=LinkedInApplyResponse)
async def apply_linkedin_easy(body: LinkedInApplyRequest):
    """
    Automates the LinkedIn Easy Apply flow for a single job listing.
    
    Flow:
    1. Navigate to job URL with auth cookies
    2. Click "Easy Apply" button
    3. Fill form fields using AI-powered answers
    4. Upload resume if needed
    5. Submit application
    """
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

            # Set LinkedIn auth cookie
            await context.add_cookies([{
                "name": "li_at",
                "value": body.li_at_cookie,
                "domain": ".linkedin.com",
                "path": "/",
                "httpOnly": True,
                "secure": True,
                "sameSite": "None",
            }])

            page = await context.new_page()
            steps.append(ApplyStepLog(step="browser_launch", status="success"))

            # 1. Navigate to job listing
            await page.goto(body.job_url, wait_until="domcontentloaded", timeout=body.timeout_seconds * 1000)
            await page.wait_for_timeout(2000)
            steps.append(ApplyStepLog(step="navigate_to_job", status="success"))

            # Extract job title and company
            try:
                job_title = await page.locator("h1.t-24, h1.job-details-jobs-unified-top-card__job-title, h2.t-24").first.text_content()
                job_title = job_title.strip() if job_title else None
            except Exception:
                pass

            try:
                company = await page.locator(".job-details-jobs-unified-top-card__company-name a, .jobs-unified-top-card__subtitle-primary-grouping .t-14 a").first.text_content()
                company = company.strip() if company else None
            except Exception:
                pass

            # 2. Check if already applied
            already_applied = await page.locator("text=Applied").first.is_visible().catch(lambda: False) if hasattr(page.locator("text=Applied").first.is_visible, 'catch') else False
            try:
                already_applied = await page.locator("span:has-text('Applied')").first.is_visible()
            except Exception:
                already_applied = False

            if already_applied:
                await browser.close()
                return LinkedInApplyResponse(
                    status="already_applied",
                    job_title=job_title,
                    company=company,
                    steps=steps + [ApplyStepLog(step="check_status", status="skipped", detail="Already applied to this job")],
                )

            # 3. Click Easy Apply button
            easy_apply_btn = page.locator("button:has-text('Easy Apply'), button.jobs-apply-button")
            try:
                await easy_apply_btn.first.wait_for(state="visible", timeout=5000)
                await easy_apply_btn.first.click()
                await page.wait_for_timeout(1500)
                steps.append(ApplyStepLog(step="click_easy_apply", status="success"))
            except PlaywrightTimeout:
                # Might be an external application
                await browser.close()
                return LinkedInApplyResponse(
                    status="requires_external",
                    job_title=job_title,
                    company=company,
                    steps=steps + [ApplyStepLog(step="click_easy_apply", status="failed", detail="No Easy Apply button found — external application required")],
                )

            # 4. Process multi-step form
            max_pages = 8
            for page_num in range(max_pages):
                await page.wait_for_timeout(1000)

                # Fill text inputs
                text_inputs = page.locator(".jobs-easy-apply-modal input[type='text'], .jobs-easy-apply-modal textarea")
                input_count = await text_inputs.count()

                for i in range(input_count):
                    inp = text_inputs.nth(i)
                    current_value = await inp.input_value()
                    if current_value.strip():
                        continue  # Already filled

                    # Find the associated label
                    label_text = ""
                    try:
                        inp_id = await inp.get_attribute("id")
                        if inp_id:
                            label = page.locator(f"label[for='{inp_id}']")
                            label_text = await label.text_content() or ""
                    except Exception:
                        pass

                    if label_text:
                        answer = await _ai_answer_question(label_text, [], body.profile)
                        if answer:
                            await inp.fill(answer)
                            steps.append(ApplyStepLog(step=f"fill_field_p{page_num+1}", status="success", detail=f"{label_text}: {answer[:50]}"))

                # Handle select dropdowns
                selects = page.locator(".jobs-easy-apply-modal select")
                select_count = await selects.count()
                for i in range(select_count):
                    sel = selects.nth(i)
                    try:
                        options_els = sel.locator("option")
                        options_texts = []
                        for j in range(await options_els.count()):
                            opt_text = await options_els.nth(j).text_content()
                            if opt_text:
                                options_texts.append(opt_text.strip())

                        label_text = ""
                        sel_id = await sel.get_attribute("id")
                        if sel_id:
                            label = page.locator(f"label[for='{sel_id}']")
                            label_text = await label.text_content() or ""

                        if options_texts and label_text:
                            answer = await _ai_answer_question(label_text, options_texts, body.profile)
                            # Find best matching option
                            best = next((o for o in options_texts if answer.lower() in o.lower()), options_texts[1] if len(options_texts) > 1 else None)
                            if best:
                                await sel.select_option(label=best)
                                steps.append(ApplyStepLog(step=f"select_field_p{page_num+1}", status="success", detail=f"{label_text}: {best}"))
                    except Exception:
                        pass

                # Handle radio buttons
                radio_groups = page.locator(".jobs-easy-apply-modal fieldset")
                radio_count = await radio_groups.count()
                for i in range(radio_count):
                    fieldset = radio_groups.nth(i)
                    try:
                        legend = await fieldset.locator("legend, span.t-14").first.text_content()
                        if not legend:
                            continue
                        radios = fieldset.locator("input[type='radio']")
                        radio_labels = []
                        for j in range(await radios.count()):
                            lbl = await radios.nth(j).locator("..").locator("label").text_content()
                            radio_labels.append(lbl.strip() if lbl else "")

                        answer = await _ai_answer_question(legend, radio_labels, body.profile)
                        best_idx = next((idx for idx, l in enumerate(radio_labels) if answer.lower() in l.lower()), 0)
                        await radios.nth(best_idx).check()
                        steps.append(ApplyStepLog(step=f"radio_p{page_num+1}", status="success", detail=f"{legend}: {radio_labels[best_idx]}"))
                    except Exception:
                        pass

                # Check for Submit or Next button
                submit_btn = page.locator("button:has-text('Submit application'), button[aria-label='Submit application']")
                next_btn = page.locator("button:has-text('Next'), button:has-text('Continue'), button[aria-label='Continue to next step']")
                review_btn = page.locator("button:has-text('Review')")

                if await submit_btn.first.is_visible().catch(lambda: False) if hasattr(submit_btn.first.is_visible, 'catch') else False:
                    pass
                try:
                    if await submit_btn.first.is_visible():
                        await submit_btn.first.click()
                        await page.wait_for_timeout(2000)
                        steps.append(ApplyStepLog(step="submit", status="success"))
                        break
                except Exception:
                    pass

                try:
                    if await review_btn.first.is_visible():
                        await review_btn.first.click()
                        await page.wait_for_timeout(1000)
                        steps.append(ApplyStepLog(step=f"review_p{page_num+1}", status="success"))
                        continue
                except Exception:
                    pass

                try:
                    if await next_btn.first.is_visible():
                        await next_btn.first.click()
                        await page.wait_for_timeout(1000)
                        steps.append(ApplyStepLog(step=f"next_p{page_num+1}", status="success"))
                        continue
                except Exception:
                    steps.append(ApplyStepLog(step=f"navigate_p{page_num+1}", status="failed", detail="Could not find next/submit button"))
                    break

            await browser.close()

        return LinkedInApplyResponse(
            status="applied",
            job_title=job_title,
            company=company,
            steps=steps,
        )

    except Exception as exc:
        return LinkedInApplyResponse(
            status="failed",
            job_title=job_title,
            company=company,
            steps=steps,
            error=str(exc),
        )

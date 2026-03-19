"""
Indeed Easy Apply Automation
==============================
Automates "Indeed Apply" flows. Indeed's flow is heavily variable and relies 
on a multi-page modal/iframe system. This script traverses text inputs, radios, 
and select questions using Claude.

Endpoint:
  POST /api/apply/indeed
"""

import json
import re
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeout
from anthropic import AsyncAnthropic

router = APIRouter()
ai_client = AsyncAnthropic()

class IndeedApplyRequest(BaseModel):
    job_url: str                         
    auth_cookies: dict                  
    profile: dict                       
    headless: bool = True
    timeout_seconds: int = 60

class ApplyStepLog(BaseModel):
    step: str
    status: str
    detail: str | None = None

class IndeedApplyResponse(BaseModel):
    status: str  # applied, requires_external, failed
    job_title: str | None = None
    company: str | None = None
    steps: list[ApplyStepLog]
    error: str | None = None

async def _ai_answer(question: str, options: list[str], profile: dict) -> str:
    """Use Claude to answer a job form question."""
    try:
        resp = await ai_client.messages.create(
            model="claude-3-5-sonnet-20240620",
            max_tokens=150,
            temperature=0,
            system="You answer job application form questions concisely. Return ONLY the answer.",
            messages=[{"role": "user", "content": f"Q: {question}\nOptions: {json.dumps(options)}\nProfile: {json.dumps(profile)}\nAnswer:"}]
        )
        return resp.content[0].text.strip()
    except Exception:
        return ""

@router.post("/apply/indeed", response_model=IndeedApplyResponse)
async def apply_indeed(body: IndeedApplyRequest):
    steps: list[ApplyStepLog] = []
    job_title, company = None, None

    try:
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(headless=body.headless)
            context = await browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                viewport={"width": 1280, "height": 800},
            )

            # Set cookies
            cookies_to_set = []
            for name, value in body.auth_cookies.items():
                cookies_to_set.append({
                    "name": name,
                    "value": value,
                    "domain": ".indeed.com",
                    "path": "/",
                })
            await context.add_cookies(cookies_to_set)

            page = await context.new_page()
            steps.append(ApplyStepLog(step="browser_launch", status="success"))

            # 1. Navigate
            await page.goto(body.job_url, wait_until="domcontentloaded", timeout=body.timeout_seconds * 1000)
            await page.wait_for_timeout(2000)
            steps.append(ApplyStepLog(step="navigate", status="success"))

            # 2. Extract metadata
            try:
                job_title = await page.locator("h1").first.text_content()
                company = await page.locator("div[data-company-name='true']").first.text_content()
            except Exception:
                pass

            # 3. Click Apply
            try:
                apply_btn = page.locator("button#indeedApplyButton, button:has-text('Apply now')").first
                await apply_btn.wait_for(state="visible", timeout=5000)
                await apply_btn.click()
                await page.wait_for_timeout(3000)
                steps.append(ApplyStepLog(step="click_apply", status="success"))
            except PlaywrightTimeout:
                await browser.close()
                return IndeedApplyResponse(
                    status="requires_external",
                    job_title=job_title,
                    company=company,
                    steps=steps,
                    error="Indeed Apply button not found (might be external application layer)."
                )

            # 4. Indeed Apply is usually loaded in an iframe or modal.
            # We'll iteratively process pages until finding a "Submit application" button.
            for page_num in range(10):
                await page.wait_for_timeout(1500)

                # Look for the target frame if inside an iframe.
                # In newer Indeed layouts, the modal exists in the main frame.
                container = page.locator("div#ia-container, .ia-App")
                
                # Fill text inputs
                try:
                    text_inputs = page.locator("input[type='text'], input[type='number'], textarea")
                    for i in range(await text_inputs.count()):
                        inp = text_inputs.nth(i)
                        val = await inp.input_value()
                        if val.strip(): continue # Skip if already filled
                        
                        id_attr = await inp.get_attribute("id")
                        label_text = ""
                        if id_attr:
                            label_text = await page.locator(f"label[for='{id_attr}']").text_content() or ""
                        
                        if label_text:
                            ans = await _ai_answer(label_text, [], body.profile)
                            if ans:
                                await inp.fill(ans)
                                steps.append(ApplyStepLog(step=f"fill_text_{i}", status="success", detail=f"{ans[:20]}"))
                except Exception:
                    pass

                # Fill Selects
                try:
                    selects = page.locator("select")
                    for i in range(await selects.count()):
                        sel = selects.nth(i)
                        opts = sel.locator("option")
                        opt_texts = [await opts.nth(j).text_content() or "" for j in range(await opts.count())]
                        
                        id_attr = await sel.get_attribute("id")
                        label_text = ""
                        if id_attr:
                            label_text = await page.locator(f"label[for='{id_attr}']").text_content() or ""
                        
                        if label_text and opt_texts:
                            ans = await _ai_answer(label_text, opt_texts, body.profile)
                            best = next((o for o in opt_texts if ans.lower() in o.lower()), opt_texts[1] if len(opt_texts)>1 else None)
                            if best:
                                await sel.select_option(label=best)
                except Exception:
                    pass

                # Handle Radio / Checkboxes checking (simplified)
                try:
                    radios = page.locator("fieldset")
                    for i in range(await radios.count()):
                        fieldset = radios.nth(i)
                        leg = await fieldset.locator("legend").first.text_content() or ""
                        if not leg: continue
                        
                        labels = fieldset.locator("label")
                        lbl_texts = [await labels.nth(j).text_content() or "" for j in range(await labels.count())]
                        
                        ans = await _ai_answer(leg, lbl_texts, body.profile)
                        best_idx = next((idx for idx, l in enumerate(lbl_texts) if ans.lower() in l.lower()), 0)
                        await labels.nth(best_idx).click()
                except Exception:
                    pass

                # Click Continue/Next or Submit
                submit_btn = page.locator("button:has-text('Submit your application'), button:has-text('Submit'), button[aria-label='Submit']")
                continue_btn = page.locator("button:has-text('Continue'), button:has-text('Next')")
                
                try:
                    if await submit_btn.first.is_visible():
                        await submit_btn.first.click()
                        await page.wait_for_timeout(3000)
                        steps.append(ApplyStepLog(step="submit", status="success"))
                        break
                except Exception:
                    pass
                
                try:
                    if await continue_btn.first.is_visible():
                        await continue_btn.first.click()
                        await page.wait_for_timeout(1000)
                        steps.append(ApplyStepLog(step=f"next_p{page_num}", status="success"))
                        continue
                except Exception:
                    break # End of recognizable flow

            await browser.close()
            return IndeedApplyResponse(status="applied", job_title=job_title, company=company, steps=steps)

    except Exception as exc:
        return IndeedApplyResponse(status="failed", job_title=job_title, company=company, steps=steps, error=str(exc))

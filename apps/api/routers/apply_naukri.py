"""
Naukri Quick Apply Automation
==============================
Uses Playwright to automate applying on Naukri.com.

Naukri uses a simpler flow than LinkedIn:
  - Cookie-based auth (NKWAP or nauk_at)
  - Single "Apply" click for most jobs
  - Optional questionnaire

Endpoint:
  POST /api/apply/naukri
"""

import json
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from pydantic import BaseModel
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeout
from anthropic import AsyncAnthropic

router = APIRouter()
ai_client = AsyncAnthropic()

# ── Models ───────────────────────────────────────────────────────────

class NaukriApplyRequest(BaseModel):
    job_url: str                         # Full Naukri job URL
    auth_cookies: dict                   # e.g. {"nauk_at": "...", "NKWAP": "..."}
    profile: dict                        # User profile for AI answers
    headless: bool = True
    timeout_seconds: int = 45

class NaukriStepLog(BaseModel):
    step: str
    status: str
    detail: Optional[str] = None

class NaukriApplyResponse(BaseModel):
    status: str  # applied, already_applied, failed, questionnaire_failed
    job_title: Optional[str] = None
    company: Optional[str] = None
    steps: list[NaukriStepLog]
    error: Optional[str] = None


async def _ai_answer(question: str, options: list[str], profile: dict) -> str:
    """Use Claude to answer a Naukri application question."""
    try:
        resp = await ai_client.messages.create(
            model="claude-3-5-sonnet-20240620",
            max_tokens=200,
            temperature=0,
            system="You answer job application questions concisely using the candidate's profile. Return ONLY the answer.",
            messages=[{
                "role": "user",
                "content": f"Question: {question}\nOptions: {json.dumps(options)}\nProfile: {json.dumps(profile)}\n\nAnswer:"
            }]
        )
        return resp.content[0].text.strip()
    except Exception:
        return ""


@router.post("/apply/naukri", response_model=NaukriApplyResponse)
async def apply_naukri_quick(body: NaukriApplyRequest):
    """
    Automates Naukri.com job application.
    
    Flow:
    1. Navigate to job with auth cookies
    2. Click "Apply" button
    3. Handle questionnaire if present (AI fills answers)
    4. Confirm submission
    """
    steps: list[NaukriStepLog] = []
    job_title = None
    company = None

    try:
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(headless=body.headless)
            context = await browser.new_context(
                user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                viewport={"width": 1280, "height": 800},
            )

            # Set Naukri auth cookies
            cookies_to_set = []
            for name, value in body.auth_cookies.items():
                cookies_to_set.append({
                    "name": name,
                    "value": value,
                    "domain": ".naukri.com",
                    "path": "/",
                })
            await context.add_cookies(cookies_to_set)

            page = await context.new_page()
            steps.append(NaukriStepLog(step="browser_launch", status="success"))

            # 1. Navigate to job page
            await page.goto(body.job_url, wait_until="domcontentloaded", timeout=body.timeout_seconds * 1000)
            await page.wait_for_timeout(2000)
            steps.append(NaukriStepLog(step="navigate", status="success"))

            # Extract job metadata
            try:
                title_el = page.locator("h1.styles_jd-header-title__rZwM1, h1.jd-header-title, header h1").first
                job_title = (await title_el.text_content() or "").strip()
            except Exception:
                pass

            try:
                company_el = page.locator("a.styles_jd-header-comp-name__MvqAI, .jd-header-comp-name a, div.comp-name a").first
                company = (await company_el.text_content() or "").strip()
            except Exception:
                pass

            # 2. Check if already applied
            try:
                already_el = page.locator("text=Already Applied, button:has-text('Already Applied')")
                if await already_el.first.is_visible():
                    await browser.close()
                    return NaukriApplyResponse(
                        status="already_applied",
                        job_title=job_title,
                        company=company,
                        steps=steps + [NaukriStepLog(step="check", status="skipped", detail="Already applied")],
                    )
            except Exception:
                pass

            # 3. Click Apply button
            apply_btn = page.locator(
                "button#apply-button, "
                "button:has-text('Apply'), "
                "button:has-text('Apply on company site'), "
                "a:has-text('Apply'), "
                ".apply-button-container button"
            )
            try:
                await apply_btn.first.wait_for(state="visible", timeout=5000)
                await apply_btn.first.click()
                await page.wait_for_timeout(2000)
                steps.append(NaukriStepLog(step="click_apply", status="success"))
            except PlaywrightTimeout:
                await browser.close()
                return NaukriApplyResponse(
                    status="failed",
                    job_title=job_title,
                    company=company,
                    steps=steps + [NaukriStepLog(step="click_apply", status="failed", detail="Apply button not found")],
                    error="Could not find Apply button on the page.",
                )

            # 4. Handle questionnaire if it appears
            try:
                questionnaire = page.locator(".chatbot_DrawerContentWrapper, .apply-questionnaire, .screening-questions")
                if await questionnaire.first.is_visible():
                    steps.append(NaukriStepLog(step="questionnaire_detected", status="success"))

                    # Handle text inputs
                    text_inputs = questionnaire.locator("input[type='text'], textarea")
                    for i in range(await text_inputs.count()):
                        inp = text_inputs.nth(i)
                        current = await inp.input_value()
                        if current.strip():
                            continue

                        label_text = ""
                        try:
                            inp_id = await inp.get_attribute("id")
                            if inp_id:
                                label_text = await page.locator(f"label[for='{inp_id}']").text_content() or ""
                            if not label_text:
                                # Try getting the previous sibling or parent label
                                label_text = await inp.locator("xpath=preceding-sibling::label | ancestor::div/label").first.text_content() or ""
                        except Exception:
                            pass

                        if label_text:
                            answer = await _ai_answer(label_text, [], body.profile)
                            if answer:
                                await inp.fill(answer)
                                steps.append(NaukriStepLog(step="fill_question", status="success", detail=f"{label_text[:40]}: {answer[:40]}"))

                    # Handle select dropdowns
                    selects = questionnaire.locator("select")
                    for i in range(await selects.count()):
                        sel = selects.nth(i)
                        try:
                            options_els = sel.locator("option")
                            options_texts = []
                            for j in range(await options_els.count()):
                                t = await options_els.nth(j).text_content()
                                if t:
                                    options_texts.append(t.strip())

                            label_text = ""
                            sel_id = await sel.get_attribute("id")
                            if sel_id:
                                label_text = await page.locator(f"label[for='{sel_id}']").text_content() or ""

                            if options_texts and label_text:
                                answer = await _ai_answer(label_text, options_texts, body.profile)
                                best = next((o for o in options_texts if answer.lower() in o.lower()), options_texts[1] if len(options_texts) > 1 else None)
                                if best:
                                    await sel.select_option(label=best)
                                    steps.append(NaukriStepLog(step="select_answer", status="success", detail=f"{label_text[:40]}: {best}"))
                        except Exception:
                            pass

                    # Handle radio buttons
                    radio_questions = questionnaire.locator(".chatbot_RadioGroup, fieldset, .radio-group")
                    for i in range(await radio_questions.count()):
                        group = radio_questions.nth(i)
                        try:
                            question_text = await group.locator("legend, .question-text, p").first.text_content() or ""
                            radios = group.locator("input[type='radio']")
                            labels_list = []
                            for j in range(await radios.count()):
                                lbl = await radios.nth(j).locator("xpath=following-sibling::label | parent::label").first.text_content()
                                labels_list.append(lbl.strip() if lbl else "")

                            if question_text and labels_list:
                                answer = await _ai_answer(question_text, labels_list, body.profile)
                                best_idx = next((idx for idx, l in enumerate(labels_list) if answer.lower() in l.lower()), 0)
                                await radios.nth(best_idx).check()
                                steps.append(NaukriStepLog(step="radio_answer", status="success", detail=f"{question_text[:40]}: {labels_list[best_idx]}"))
                        except Exception:
                            pass

                    # Submit questionnaire
                    submit_btn = questionnaire.locator("button:has-text('Submit'), button:has-text('Apply'), button[type='submit']")
                    try:
                        await submit_btn.first.click()
                        await page.wait_for_timeout(2000)
                        steps.append(NaukriStepLog(step="submit_questionnaire", status="success"))
                    except Exception:
                        steps.append(NaukriStepLog(step="submit_questionnaire", status="failed"))

            except Exception:
                # No questionnaire — the apply click was sufficient
                pass

            # 5. Check for success confirmation
            try:
                success = page.locator("text=applied successfully, text=Application Submitted, text=You have already applied")
                await success.first.wait_for(state="visible", timeout=5000)
                steps.append(NaukriStepLog(step="confirm_success", status="success"))
            except Exception:
                steps.append(NaukriStepLog(step="confirm_success", status="skipped", detail="Could not confirm — may still have been submitted"))

            await browser.close()

        return NaukriApplyResponse(
            status="applied",
            job_title=job_title,
            company=company,
            steps=steps,
        )

    except Exception as exc:
        return NaukriApplyResponse(
            status="failed",
            job_title=job_title,
            company=company,
            steps=steps,
            error=str(exc),
        )

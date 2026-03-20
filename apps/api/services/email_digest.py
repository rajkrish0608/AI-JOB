"""
Email Digest Service
======================
Sends a daily email digest to each active user summarising:
  - New job applications submitted (last 24 h)
  - Status changes (e.g. moved to Interviewing / Offer / Rejected)
  - Dream company scan results (new roles found, new contacts discovered)

Relies on:
  - SUPABASE_SERVICE_ROLE_KEY  (bypass RLS for server-side reads)
  - SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS  (any SMTP provider)
  - DIGEST_FROM_EMAIL          (e.g. "digest@aijobapply.in")

If SMTP vars are missing the service logs a warning and skips sending
(useful in CI / local dev without credentials).
"""

import os
import asyncio
import smtplib
import textwrap
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

# ── Supabase client (reuse the helper already in dream_scanner) ──────────────
from services.dream_scanner import _get_supabase


# ── SMTP helpers ──────────────────────────────────────────────────────────────

SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASS = os.getenv("SMTP_PASS", "")
FROM_EMAIL = os.getenv("DIGEST_FROM_EMAIL", SMTP_USER or "noreply@aijobapply.in")


def _send_email(to_email: str, subject: str, html_body: str, text_body: str):
    """Synchronous SMTP send (called in executor to stay non-blocking)."""
    if not SMTP_HOST or not SMTP_USER or not SMTP_PASS:
        print(f"[digest] SMTP not configured — skipping send to {to_email}")
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = FROM_EMAIL
    msg["To"] = to_email
    msg.attach(MIMEText(text_body, "plain"))
    msg.attach(MIMEText(html_body, "html"))

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
        server.ehlo()
        server.starttls()
        server.login(SMTP_USER, SMTP_PASS)
        server.sendmail(FROM_EMAIL, [to_email], msg.as_string())
    print(f"[digest] Sent digest to {to_email}")


async def _send_email_async(to_email: str, subject: str, html_body: str, text_body: str):
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _send_email, to_email, subject, html_body, text_body)


# ── Digest builder ─────────────────────────────────────────────────────────────

def _build_digest_email(user_email: str, stats: dict) -> tuple[str, str]:
    """Returns (html, plain_text) for the digest email."""

    new_apps = stats.get("new_applications", [])
    status_changes = stats.get("status_changes", [])
    dream_roles = stats.get("dream_roles_found", 0)
    dream_contacts = stats.get("dream_contacts_found", 0)

    # ── Plain text ──
    text_lines = [
        "AI Job Apply — Daily Digest",
        "=" * 40,
        f"Hello! Here's your daily job search summary.\n",
    ]
    if new_apps:
        text_lines.append(f"📨 NEW APPLICATIONS ({len(new_apps)})")
        for a in new_apps[:5]:
            text_lines.append(f"  • {a['title']} @ {a['company']}")
        text_lines.append("")

    if status_changes:
        text_lines.append(f"🔔 STATUS UPDATES ({len(status_changes)})")
        for s in status_changes[:5]:
            text_lines.append(f"  • {s['title']} @ {s['company']} → {s['status'].upper()}")
        text_lines.append("")

    if dream_roles or dream_contacts:
        text_lines.append("🏢 DREAM COMPANY SCAN")
        text_lines.append(f"  • {dream_roles} new open roles found")
        text_lines.append(f"  • {dream_contacts} new HR contacts discovered")
        text_lines.append("")

    text_lines.append("Visit your dashboard: https://your-app.com/dashboard")
    text_body = "\n".join(text_lines)

    # ── HTML ──
    def app_rows(apps, limit=5):
        rows = ""
        for a in apps[:limit]:
            rows += f"""
            <tr>
              <td style="padding:8px 0;border-bottom:1px solid #1c1c1c;color:#e5e5e5;font-size:13px">{a.get('title','—')}</td>
              <td style="padding:8px 0;border-bottom:1px solid #1c1c1c;color:#a3a3a3;font-size:13px">{a.get('company','—')}</td>
            </tr>"""
        return rows

    def status_rows(changes, limit=5):
        badge_colors = {
            "interviewing": "#eab308", "offer": "#22c55e",
            "rejected": "#ef4444", "applied": "#3b82f6", "reviewing": "#a855f7"
        }
        rows = ""
        for s in changes[:limit]:
            status = s.get("status", "")
            color = badge_colors.get(status, "#6b7280")
            rows += f"""
            <tr>
              <td style="padding:8px 0;border-bottom:1px solid #1c1c1c;color:#e5e5e5;font-size:13px">{s.get('title','—')}</td>
              <td style="padding:8px 0;border-bottom:1px solid #1c1c1c;color:#a3a3a3;font-size:13px">{s.get('company','—')}</td>
              <td style="padding:8px 0;border-bottom:1px solid #1c1c1c;font-size:12px">
                <span style="background:{color}22;color:{color};padding:2px 8px;border-radius:4px;font-weight:600">{status.upper()}</span>
              </td>
            </tr>"""
        return rows

    html = f"""<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0c0c0c;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:32px auto">
    <tr><td style="padding:24px;background:#141414;border-radius:12px;border:1px solid #1c1c1c">
      <h1 style="margin:0 0 4px;font-size:18px;font-weight:600;color:#e5e5e5">AI Job Apply</h1>
      <p style="margin:0 0 24px;font-size:13px;color:#737373">Your daily job search digest</p>
      
      {'<h2 style="font-size:14px;font-weight:600;color:#e5e5e5;margin:16px 0 8px">📨 New Applications</h2><table width="100%">' + app_rows(new_apps) + '</table>' if new_apps else ''}
      {'<h2 style="font-size:14px;font-weight:600;color:#e5e5e5;margin:24px 0 8px">🔔 Status Updates</h2><table width="100%">' + status_rows(status_changes) + '</table>' if status_changes else ''}

      {f'''<div style="background:#1c1c1c;border-radius:8px;padding:16px;margin-top:24px">
        <p style="margin:0;font-size:13px;color:#a3a3a3">🏢 <strong style="color:#e5e5e5">Dream Company Scan</strong></p>
        <p style="margin:4px 0 0;font-size:13px;color:#737373">{dream_roles} new open roles &bull; {dream_contacts} new HR contacts</p>
      </div>''' if dream_roles or dream_contacts else ''}

      <p style="margin:24px 0 0;font-size:12px;color:#525252">
        <a href="https://your-app.com/dashboard/tracker" style="color:#737373">View dashboard →</a>
        &nbsp;&bull;&nbsp;
        <a href="https://your-app.com/settings/notifications" style="color:#525252">Unsubscribe</a>
      </p>
    </td></tr>
  </table>
</body>
</html>"""

    return html, text_body


# ── Main digest function ───────────────────────────────────────────────────────

async def send_daily_digest_for_user(user_id: str, user_email: str):
    """Build and send the daily digest for one user."""
    db = await _get_supabase()
    since = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()

    # New applications in last 24h
    new_apps_res = await db.table("applications") \
        .select("status, job:job_id(title, company)") \
        .eq("user_id", user_id) \
        .gte("applied_at", since) \
        .execute()

    new_apps = [
        {"title": r["job"]["title"], "company": r["job"]["company"]}
        for r in (new_apps_res.data or []) if r.get("job")
    ]

    # Status changes (excluding 'saved' and 'applied', which are not exciting)
    changes_res = await db.table("applications") \
        .select("status, job:job_id(title, company)") \
        .eq("user_id", user_id) \
        .gte("status_updated_at", since) \
        .in_("status", ["reviewing", "interviewing", "offer", "rejected"]) \
        .execute()

    status_changes = [
        {"title": r["job"]["title"], "company": r["job"]["company"], "status": r["status"]}
        for r in (changes_res.data or []) if r.get("job")
    ]

    # Dream company scan summary from last 24h
    dream_res = await db.table("dream_companies") \
        .select("roles_found_count, contacts_found_count") \
        .eq("user_id", user_id) \
        .gte("last_checked_at", since) \
        .execute()

    dream_roles    = sum(r.get("roles_found_count", 0) for r in (dream_res.data or []))
    dream_contacts = sum(r.get("contacts_found_count", 0) for r in (dream_res.data or []))

    # Skip sending if nothing to report
    if not new_apps and not status_changes and not dream_roles and not dream_contacts:
        print(f"[digest] Nothing to report for {user_email} — skipping")
        return

    stats = {
        "new_applications": new_apps,
        "status_changes": status_changes,
        "dream_roles_found": dream_roles,
        "dream_contacts_found": dream_contacts,
    }

    html, text = _build_digest_email(user_email, stats)
    date_str = datetime.now().strftime("%b %d")
    subject = f"Your Job Search Update — {date_str}"

    await _send_email_async(user_email, subject, html, text)


async def cron_daily_email_digest(ctx):
    """
    Daily cron: Fetches all active users and sends each a digest email.
    Runs at 07:00 UTC (12:30 IST) so it lands in the morning.
    """
    db = await _get_supabase()

    # Pull users who have at least one application
    res = await db.table("applications") \
        .select("user_id") \
        .execute()

    if not res.data:
        print("[digest_cron] No users with applications found.")
        return

    user_ids = list({r["user_id"] for r in res.data})
    print(f"[digest_cron] Sending digest to {len(user_ids)} users...")

    # Get emails from auth.users via service role
    for uid in user_ids:
        try:
            user_res = await db.auth.admin.get_user_by_id(uid)
            email = user_res.user.email if user_res and user_res.user else None
            if email:
                await send_daily_digest_for_user(uid, email)
        except Exception as e:
            print(f"[digest_cron] Error for user {uid}: {e}")

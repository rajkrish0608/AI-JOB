"""
PDF Export Service
==================
Converts an HTML resume into a downloadable PDF using WeasyPrint.

Two modes:
  1. POST /api/resume/pdf
     - Accepts { resume_data, template_name } (same as renderer)
     - Generates the HTML internally then converts to PDF

  2. POST /api/resume/pdf/html
     - Accepts raw HTML string directly
     - Converts to PDF immediately

Returns PDF bytes as application/pdf.
"""

import os
import io
import markdown
from fastapi import APIRouter, HTTPException, Depends
from auth import get_current_user
from fastapi.responses import Response
from jinja2 import Environment, FileSystemLoader
from pydantic import BaseModel
from typing import Any
from weasyprint import HTML, CSS

router = APIRouter()

# Jinja2 env (mirrors renderer)
TEMPLATE_DIR = os.path.join(os.path.dirname(__file__), "..", "templates", "resume")
env = Environment(loader=FileSystemLoader(TEMPLATE_DIR))

# WeasyPrint base CSS for print optimisation
PRINT_CSS = CSS(string="""
@page {
    size: A4;
    margin: 0.5in;
}
body {
    -weasyprint-app: none;  /* Suppress headless print dialogs */
}
""")


class PdfFromDataRequest(BaseModel):
    resume_data: dict[str, Any]
    template_name: str = "professional"


class PdfFromHtmlRequest(BaseModel):
    html: str


def _render_html(resume_data: dict, template_name: str) -> str:
    """Shared rendering logic: JSON → HTML string."""
    template_file = f"{template_name}.html"
    try:
        template = env.get_template(template_file)
    except Exception:
        raise HTTPException(
            status_code=400,
            detail=f"Template '{template_name}' not found."
        )

    data = resume_data.copy()
    if "sections" in data:
        for sec in data["sections"]:
            if "content" in sec:
                sec["content_html"] = markdown.markdown(sec["content"])

    return template.render(**data)


def _html_to_pdf(html_string: str) -> bytes:
    """Convert an HTML string to PDF bytes using WeasyPrint."""
    pdf_buffer = io.BytesIO()
    HTML(string=html_string).write_pdf(target=pdf_buffer, stylesheets=[PRINT_CSS])
    pdf_buffer.seek(0)
    return pdf_buffer.read()


@router.post("/resume/pdf")
async def export_resume_pdf_from_data(body: PdfFromDataRequest, user: dict = Depends(get_current_user)):
    """
    Full pipeline: JSON resume → HTML template → PDF download.
    """
    try:
        html_string = _render_html(body.resume_data, body.template_name)
        pdf_bytes = _html_to_pdf(html_string)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {str(exc)}")

    # Build a safe filename from the candidate name
    name = body.resume_data.get("full_name", "resume").replace(" ", "_").lower()
    filename = f"{name}_resume.pdf"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/resume/pdf/html")
async def export_resume_pdf_from_html(body: PdfFromHtmlRequest, user: dict = Depends(get_current_user)):
    """
    Direct HTML → PDF. Useful if the frontend has already rendered the HTML.
    """
    try:
        pdf_bytes = _html_to_pdf(body.html)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {str(exc)}")

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="resume.pdf"'},
    )

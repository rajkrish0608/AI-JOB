"""
Resume HTML Renderer Service
=============================
Takes a GeneratedResume JSON object (produced by the builder)
and converts it into raw HTML using Jinja2 templates.
"""

import os
import markdown
from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse
from jinja2 import Environment, FileSystemLoader
from pydantic import BaseModel
from typing import Any

router = APIRouter()

# Setup Jinja2 environment
TEMPLATE_DIR = os.path.join(os.path.dirname(__file__), "..", "templates", "resume")
env = Environment(loader=FileSystemLoader(TEMPLATE_DIR))

class RenderRequest(BaseModel):
    resume_data: dict[str, Any]
    template_name: str = "professional"

@router.post("/resume/render", response_class=HTMLResponse)
async def render_resume_to_html(body: RenderRequest):
    """
    Renders a JSON resume object (from /resume/generate) into HTML.
    Converts Markdown sections to HTML automatically.
    """
    template_file = f"{body.template_name}.html"
    
    try:
        template = env.get_template(template_file)
    except Exception:
        raise HTTPException(
            status_code=400, 
            detail=f"Template '{body.template_name}' not found."
        )
        
    data = body.resume_data.copy()
    
    # Pre-process markdown sections
    if "sections" in data:
        for sec in data["sections"]:
            if "content" in sec:
                # Convert markdown to HTML snippet
                sec["content_html"] = markdown.markdown(sec["content"])
                
    try:
        html_out = template.render(**data)
        return html_out
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Rendering failed: {str(e)}")

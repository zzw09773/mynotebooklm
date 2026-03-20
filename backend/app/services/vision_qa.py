"""
vision_qa.py — Visual QA for generated slide thumbnails.

Sends JPEG thumbnails to a local vision model (via OpenAI-compatible API)
and returns a list of per-slide issues found.

Enabled only when `vision_model` is set in settings.
"""
import base64
import json
import logging
from pathlib import Path

import httpx

log = logging.getLogger(__name__)

_QA_PROMPT = """Check these presentation slides for visual issues:
- Text overflow or cut off at edges
- Elements overlapping in a way that hurts readability
- Uneven spacing or excessive blank areas
- Low contrast (text unreadable on background)
- Numbers or words split awkwardly across lines
Return JSON only: [{"slide": N, "issues": ["description"]}]
Only include slides that have actual problems. Return [] if everything looks fine."""


async def visual_qa_check(
    thumbnail_paths: list[Path],
    api_base_url: str,
    api_key: str,
    model: str,
) -> list[dict]:
    """
    Send slide thumbnails to the vision model and return issues per slide.

    Args:
        thumbnail_paths: Ordered list of JPEG paths (slide_000.jpg, …).
        api_base_url:    OpenAI-compatible API base URL.
        api_key:         Bearer token for the API.
        model:           Vision model ID.

    Returns:
        List of {"slide": N, "issues": [...]} dicts for slides with problems.
        Returns [] on error (QA failure is non-fatal).
    """
    if not thumbnail_paths:
        return []

    content: list[dict] = []
    for i, path in enumerate(thumbnail_paths):
        try:
            img_b64 = base64.standard_b64encode(path.read_bytes()).decode()
        except OSError:
            log.warning("vision_qa: cannot read thumbnail %s, skipping", path)
            continue
        content.append({
            "type": "image_url",
            "image_url": {"url": f"data:image/jpeg;base64,{img_b64}"},
        })
        content.append({"type": "text", "text": f"Slide {i + 1}"})

    content.append({"type": "text", "text": _QA_PROMPT})

    try:
        async with httpx.AsyncClient(verify=False, timeout=120) as client:
            resp = await client.post(
                f"{api_base_url}/chat/completions",
                headers={"Authorization": f"Bearer {api_key}"},
                json={
                    "model": model,
                    "messages": [{"role": "user", "content": content}],
                    "max_tokens": 1000,
                },
            )
            resp.raise_for_status()
            raw = resp.json()["choices"][0]["message"]["content"]

        # Strip markdown fences if the model wraps JSON in ```json ... ```
        raw = raw.strip()
        if raw.startswith("```"):
            lines = [l for l in raw.split("\n") if not l.strip().startswith("```")]
            raw = "\n".join(lines).strip()

        return json.loads(raw)

    except Exception:
        log.exception("vision_qa: QA check failed (non-fatal)")
        return []

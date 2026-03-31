"""
vision_qa.py — Visual QA for generated slide thumbnails.

Sends JPEG thumbnails to a local vision model (via OpenAI-compatible API)
and returns a list of per-slide issues found.

Enabled only when `vision_model` is set in settings.

Changes from v1:
- Structured issue types for automated repair classification
- Parallel processing (up to 4 concurrent requests) for faster QA
"""
import asyncio
import base64
import json
import logging
from enum import Enum
from pathlib import Path

import httpx

log = logging.getLogger(__name__)


class IssueType(str, Enum):
    LOW_CONTRAST = "low_contrast"
    TEXT_OVERFLOW = "text_overflow"
    EXCESSIVE_BLANK = "excessive_blank"
    OVERLAP = "overlap"
    UNKNOWN = "unknown"


_QA_PROMPT = """Check this presentation slide for visual issues.
Return JSON only, no explanation.

Issue types to detect:
- "low_contrast": text color is too similar to background, hard to read
- "text_overflow": text is cut off at the edge of the slide
- "excessive_blank": large empty white/blank areas taking over the slide
- "overlap": elements overlap each other hurting readability
- "unknown": any other visual problem

Format: {"issues": [{"type": "<issue_type>", "description": "<brief description>"}]}
Return {"issues": []} if everything looks fine."""

# Max concurrent VLM requests (avoid CUDA OOM on constrained hosts)
_QA_SEMAPHORE_SIZE = 4


async def _check_one_slide(
    client: httpx.AsyncClient,
    sem: asyncio.Semaphore,
    path: Path,
    slide_idx: int,
    api_base_url: str,
    api_key: str,
    model: str,
) -> dict | None:
    """Check a single slide thumbnail. Returns issue dict or None."""
    async with sem:
        try:
            img_b64 = base64.standard_b64encode(path.read_bytes()).decode()
        except OSError:
            log.warning("vision_qa: cannot read thumbnail %s, skipping", path)
            return None

        content = [
            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{img_b64}"}},
            {"type": "text", "text": f"Slide {slide_idx + 1}\n\n{_QA_PROMPT}"},
        ]

        try:
            resp = await client.post(
                f"{api_base_url}/chat/completions",
                headers={"Authorization": f"Bearer {api_key}"},
                json={
                    "model": model,
                    "messages": [{"role": "user", "content": content}],
                    "max_tokens": 400,
                },
            )
            resp.raise_for_status()
            raw = resp.json()["choices"][0]["message"]["content"].strip()

            # Strip markdown fences if the model wraps JSON in ```json ... ```
            if raw.startswith("```"):
                lines = [line for line in raw.split("\n") if not line.strip().startswith("```")]
                raw = "\n".join(lines).strip()

            parsed = json.loads(raw)
            issues = parsed.get("issues", [])
            if issues:
                return {"slide": slide_idx + 1, "issues": issues}
            return None

        except Exception as exc:
            log.warning("vision_qa: slide %d check failed (non-fatal): %s", slide_idx + 1, type(exc).__name__)
            return None


async def visual_qa_check(
    thumbnail_paths: list[Path],
    api_base_url: str,
    api_key: str,
    model: str,
) -> list[dict]:
    """
    Send slide thumbnails to the vision model in parallel and return issues per slide.

    Args:
        thumbnail_paths: Ordered list of JPEG paths (slide_000.jpg, …).
        api_base_url:    OpenAI-compatible API base URL.
        api_key:         Bearer token for the API.
        model:           Vision model ID.

    Returns:
        List of {"slide": N, "issues": [{"type": ..., "description": ...}]} dicts
        for slides with problems. Returns [] on error (QA failure is non-fatal).
    """
    if not thumbnail_paths:
        return []

    sem = asyncio.Semaphore(_QA_SEMAPHORE_SIZE)

    async with httpx.AsyncClient(verify=False, timeout=120) as client:
        tasks = [
            _check_one_slide(client, sem, path, i, api_base_url, api_key, model)
            for i, path in enumerate(thumbnail_paths)
        ]
        results = await asyncio.gather(*tasks, return_exceptions=False)

    return [r for r in results if r is not None]


def classify_issues(issues: list[dict]) -> set[IssueType]:
    """
    Extract unique issue types from visual_qa_check results.
    Used by the feedback loop to decide which auto-repairs to apply.
    """
    types: set[IssueType] = set()
    for slide_issues in issues:
        for issue in slide_issues.get("issues", []):
            raw_type = issue.get("type", "unknown")
            try:
                types.add(IssueType(raw_type))
            except ValueError:
                types.add(IssueType.UNKNOWN)
    return types

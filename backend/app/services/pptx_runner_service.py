"""
pptx_runner_service.py — Render validated SlidesSpec JSON to PPTX via Node.js.

The deterministic renderer (app/scripts/slides_renderer.js) receives the JSON
in a temp file and writes the resulting PPTX to disk.

Exit codes from the renderer:
  0 = success
  1 = runtime error
"""
import asyncio
import logging
import tempfile
from enum import Enum
from pathlib import Path

log = logging.getLogger(__name__)


class RunResult(str, Enum):
    SUCCESS = "success"
    RUNTIME_ERROR = "runtime_error"  # exit 1 — execution failed
    TIMEOUT = "timeout"              # process killed due to timeout


_RENDERER_SCRIPT = Path(__file__).parent.parent / "scripts" / "slides_renderer.js"


async def execute_slides_json(
    slides_json: str, output_path: str, timeout: int = 120
) -> tuple[RunResult, str]:
    """
    Render a validated SlidesSpec JSON string to a .pptx file using the
    deterministic slides_renderer.js template engine.

    Unlike execute_pptxgenjs, this path does NOT use a vm sandbox or execute
    dynamic code — it feeds pure JSON to a fixed renderer, so SYNTAX_ERROR
    is never returned (only SUCCESS or RUNTIME_ERROR).

    Args:
        slides_json: Serialised SlidesSpec JSON string.
        output_path: Destination path for the generated PPTX.
        timeout:     Max seconds to wait for Node.js subprocess.

    Returns:
        (RunResult, stderr_text) tuple.
    """
    with tempfile.NamedTemporaryFile(suffix=".json", mode="w", delete=False, encoding="utf-8") as f:
        f.write(slides_json)
        json_file = f.name

    try:
        proc = await asyncio.create_subprocess_exec(
            "node",
            str(_RENDERER_SCRIPT),
            json_file,
            output_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env={**__import__("os").environ, "NODE_PATH": "/usr/lib/node_modules"},
        )
        try:
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        except asyncio.TimeoutError:
            proc.kill()
            log.error("slides_renderer timed out after %ds", timeout)
            return RunResult.TIMEOUT, f"Timed out after {timeout}s"

        stderr_text = stderr.decode(errors="replace")

        if proc.returncode != 0:
            log.error("slides_renderer failed (exit %d): %s", proc.returncode, stderr_text)
            return RunResult.RUNTIME_ERROR, stderr_text

        if not Path(output_path).exists():
            log.error("slides_renderer returned 0 but output file missing: %s", output_path)
            return RunResult.RUNTIME_ERROR, "Output file not created"

        log.info(
            "slides_renderer produced %s (%d bytes)",
            output_path,
            Path(output_path).stat().st_size,
        )
        return RunResult.SUCCESS, ""

    finally:
        Path(json_file).unlink(missing_ok=True)

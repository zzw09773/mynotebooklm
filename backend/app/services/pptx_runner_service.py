"""
pptx_runner_service.py — Execute LLM-generated PptxGenJS code via a Node.js subprocess.

The Node.js runner (app/scripts/pptx_runner.js) receives the code in a temp file,
executes it inside a vm sandbox, and writes the resulting PPTX to disk.

Security: asyncio.create_subprocess_exec is used (not shell=True), which prevents
shell injection. The code_file path is passed as a positional argv argument.
"""
import asyncio
import logging
import tempfile
from pathlib import Path

log = logging.getLogger(__name__)

_RUNNER_SCRIPT = Path(__file__).parent.parent / "scripts" / "pptx_runner.js"


async def execute_pptxgenjs(code: str, output_path: str, timeout: int = 60) -> bool:
    """
    Execute LLM-generated PptxGenJS code to produce a .pptx file.

    Args:
        code:        JavaScript snippet using the `pres` variable.
        output_path: Destination path for the generated PPTX.
        timeout:     Max seconds to wait for Node.js subprocess.

    Returns:
        True if PPTX was produced successfully, False otherwise.
    """
    with tempfile.NamedTemporaryFile(suffix=".js", mode="w", delete=False, encoding="utf-8") as f:
        f.write(code)
        code_file = f.name

    try:
        # Use create_subprocess_exec (not shell=True) to avoid shell injection.
        # Arguments are passed as a list, not interpolated into a shell string.
        proc = await asyncio.create_subprocess_exec(
            "node",
            str(_RUNNER_SCRIPT),
            code_file,
            output_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        except asyncio.TimeoutError:
            proc.kill()
            log.error("PptxGenJS runner timed out after %ds", timeout)
            return False

        if proc.returncode != 0:
            log.error(
                "PptxGenJS runner failed (exit %d): %s",
                proc.returncode,
                stderr.decode(errors="replace"),
            )
            return False

        if not Path(output_path).exists():
            log.error("PptxGenJS runner returned 0 but output file missing: %s", output_path)
            return False

        log.info(
            "PptxGenJS runner produced %s (%d bytes)",
            output_path,
            Path(output_path).stat().st_size,
        )
        return True

    finally:
        Path(code_file).unlink(missing_ok=True)

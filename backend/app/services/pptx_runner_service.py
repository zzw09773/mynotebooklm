"""
pptx_runner_service.py — Execute LLM-generated PptxGenJS code via a Node.js subprocess.

The Node.js runner (app/scripts/pptx_runner.js) receives the code in a temp file,
executes it inside a vm sandbox, and writes the resulting PPTX to disk.

Exit codes from the runner:
  0 = success
  1 = runtime error (code executed but threw an exception)
  2 = syntax error (code could not be compiled; retryable by the LLM)

Security: asyncio.create_subprocess_exec is used (not shell=True), which prevents
shell injection. The code_file path is passed as a positional argv argument.
"""
import asyncio
import logging
import tempfile
from enum import Enum
from pathlib import Path

log = logging.getLogger(__name__)

_RUNNER_SCRIPT = Path(__file__).parent.parent / "scripts" / "pptx_runner.js"


class RunResult(str, Enum):
    SUCCESS = "success"
    SYNTAX_ERROR = "syntax_error"   # exit 2 — LLM can fix and retry
    RUNTIME_ERROR = "runtime_error" # exit 1 — execution failed
    TIMEOUT = "timeout"             # process killed due to timeout


# Default preamble injected when the LLM omits it (tech-innovation theme).
# This prevents "theme is not defined" / "FONT is not defined" runtime errors.
_DEFAULT_PREAMBLE = """\
pres.defineLayout({name:"16x9",width:10,height:5.625});
pres.layout="16x9";
var theme={bg:"1E1E1E",accent:"0066FF",title:"FFFFFF",text:"CCCCCC",muted:"888888",cardBg:"2A2A2A"};
var FONT="Microsoft JhengHei";
"""


def _preprocess_code(code: str) -> str:
    """
    Fix common LLM code-generation mistakes before passing to Node.js runner.
    These repairs are done in Python because Python's re module behaves
    predictably with Unicode strings.
    """
    # Strip trailing non-JS lines added by LLMs (e.g. "--- End of JS code ---",
    # markdown separators, or explanatory text after the last JS statement).
    lines = code.rstrip().split("\n")
    while lines and (
        lines[-1].strip().startswith("---")
        or lines[-1].strip().startswith("//")
        or lines[-1].strip() == ""
    ):
        lines.pop()
    code = "\n".join(lines)

    # Inject preamble if LLM forgot to define theme/FONT/layout.
    # The check is simple: if neither "var theme" nor "const theme" appears in
    # the code, the LLM skipped the preamble and "theme is not defined" would
    # occur at runtime.  Prepending the default preamble fixes this without
    # touching any slide content.
    if "theme" not in code:
        log.warning("LLM output missing 'theme' definition — injecting default preamble")
        code = _DEFAULT_PREAMBLE + code
    elif not code.lstrip().startswith("pres.defineLayout"):
        # theme is defined somewhere but defineLayout is missing at the top
        if "pres.defineLayout" not in code:
            log.warning("LLM output missing pres.defineLayout — injecting layout header")
            code = (
                'pres.defineLayout({name:"16x9",width:10,height:5.625});\npres.layout="16x9";\n'
                + code
            )

    # Note: automatic quote-mismatch repair ("value' → "value") is intentionally
    # NOT done here — the regex cannot safely distinguish mismatched quotes from
    # valid JS like '"'  (a string containing a single double-quote character).
    return code


async def execute_pptxgenjs(
    code: str, output_path: str, timeout: int = 60
) -> tuple[RunResult, str]:
    """
    Execute LLM-generated PptxGenJS code to produce a .pptx file.

    Args:
        code:        JavaScript snippet using the `pres` variable.
        output_path: Destination path for the generated PPTX.
        timeout:     Max seconds to wait for Node.js subprocess.

    Returns:
        (RunResult, stderr_text) tuple.
        RunResult.SUCCESS means the PPTX file was produced successfully.
    """
    code = _preprocess_code(code)
    with tempfile.NamedTemporaryFile(suffix=".js", mode="w", delete=False, encoding="utf-8") as f:
        f.write(code)
        code_file = f.name

    try:
        # Use create_subprocess_exec (not shell=True) to avoid shell injection.
        proc = await asyncio.create_subprocess_exec(
            "node",
            str(_RUNNER_SCRIPT),
            code_file,
            output_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env={**__import__("os").environ, "NODE_PATH": "/usr/lib/node_modules"},
        )
        try:
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        except asyncio.TimeoutError:
            proc.kill()
            log.error("PptxGenJS runner timed out after %ds", timeout)
            return RunResult.TIMEOUT, f"Timed out after {timeout}s"

        stderr_text = stderr.decode(errors="replace")

        if proc.returncode == 2:
            log.error("PptxGenJS runner syntax error: %s", stderr_text)
            return RunResult.SYNTAX_ERROR, stderr_text

        if proc.returncode != 0:
            log.error(
                "PptxGenJS runner failed (exit %d): %s",
                proc.returncode,
                stderr_text,
            )
            return RunResult.RUNTIME_ERROR, stderr_text

        if not Path(output_path).exists():
            log.error("PptxGenJS runner returned 0 but output file missing: %s", output_path)
            return RunResult.RUNTIME_ERROR, "Output file not created"

        log.info(
            "PptxGenJS runner produced %s (%d bytes)",
            output_path,
            Path(output_path).stat().st_size,
        )
        return RunResult.SUCCESS, ""

    finally:
        Path(code_file).unlink(missing_ok=True)

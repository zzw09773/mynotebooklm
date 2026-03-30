"""
comfyui_service.py — Async client for ComfyUI image generation API.

Integrates with the Flux.1-dev workflow verified on the target ComfyUI instance:
  - Diffusion model: flux1-dev-fp8.safetensors (UNETLoader)
  - Text encoders:   t5xxl_fp8_e4m3fn.safetensors + clip_l.safetensors (DualCLIPLoader, type="flux")
  - VAE:             ae.safetensors (VAELoader)
  - Sampler:         SamplerCustomAdvanced + BasicGuider + FluxGuidance (NOT KSampler)

Usage:
    from app.services.comfyui_service import is_available, generate_image

    if await is_available():
        ok = await generate_image("a professional illustration of...", Path("/data/..."))
"""
import copy
import logging
import random
import uuid
from pathlib import Path

import httpx

log = logging.getLogger(__name__)

# ── Flux Workflow Template ─────────────────────────────────────────────────────
# Verified against actual ComfyUI history on this instance.
# Nodes 10, 11, 12, 16, 17 are model-load nodes that ComfyUI caches between runs.
# Only node "30" (text) and node "25" (seed) change between calls.

_FLUX_WORKFLOW: dict = {
    # ── Output ─────────────────────────────────────────────────────────────────
    "8": {
        "class_type": "VAEDecode",
        "inputs": {"samples": ["13", 0], "vae": ["10", 0]},
    },
    "9": {
        "class_type": "SaveImage",
        "inputs": {"filename_prefix": "notebooklm_slide", "images": ["8", 0]},
    },
    # ── Model loaders (auto-cached by ComfyUI after first load) ────────────────
    "10": {
        "class_type": "VAELoader",
        "inputs": {"vae_name": "ae.safetensors"},
    },
    "11": {
        "class_type": "DualCLIPLoader",
        "inputs": {
            "clip_name1": "t5xxl_fp8_e4m3fn.safetensors",
            "clip_name2": "clip_l.safetensors",
            "type": "flux",
        },
    },
    "12": {
        "class_type": "UNETLoader",
        "inputs": {"unet_name": "flux1-dev-fp8.safetensors", "weight_dtype": "default"},
    },
    # ── Sampling pipeline ──────────────────────────────────────────────────────
    "13": {
        "class_type": "SamplerCustomAdvanced",
        "inputs": {
            "noise": ["25", 0],
            "guider": ["22", 0],
            "sampler": ["16", 0],
            "sigmas": ["17", 0],
            "latent_image": ["27", 0],
        },
    },
    "16": {
        "class_type": "KSamplerSelect",
        "inputs": {"sampler_name": "euler"},
    },
    "17": {
        "class_type": "BasicScheduler",
        "inputs": {
            "scheduler": "simple",
            "steps": 20,
            "denoise": 1.0,
            "model": ["12", 0],
        },
    },
    "22": {
        "class_type": "BasicGuider",
        "inputs": {"model": ["12", 0], "conditioning": ["26", 0]},
    },
    "25": {
        "class_type": "RandomNoise",
        "inputs": {"noise_seed": 0},  # replaced at runtime
    },
    # ── Prompt + Guidance ──────────────────────────────────────────────────────
    "26": {
        "class_type": "FluxGuidance",
        "inputs": {"guidance": 3.5, "conditioning": ["30", 0]},
    },
    "27": {
        "class_type": "EmptyLatentImage",
        "inputs": {"width": 1024, "height": 768, "batch_size": 1},  # 4:3 for slides
    },
    "30": {
        "class_type": "CLIPTextEncode",
        "inputs": {
            "text": "",  # replaced at runtime with English prompt
            "clip": ["11", 0],
        },
    },
}


def _get_api_url() -> str:
    """Return ComfyUI base URL from runtime settings (empty string if disabled)."""
    try:
        from app.routers.settings import _runtime_settings
        return _runtime_settings.comfyui_api_url.rstrip("/")
    except Exception:
        return ""


async def is_available() -> bool:
    """Return True if ComfyUI is reachable at the configured URL."""
    base_url = _get_api_url()
    if not base_url:
        return False
    try:
        async with httpx.AsyncClient(verify=False, timeout=5.0) as client:
            resp = await client.get(f"{base_url}/system_stats")
            return resp.status_code == 200
    except Exception as exc:
        log.debug("ComfyUI not available at %s: %s", base_url, exc)
        return False


async def generate_image(
    prompt: str,
    save_path: Path,
    width: int = 1024,
    height: int = 768,
    seed: int | None = None,
    timeout: int = 180,
) -> bool:
    """
    Generate one image via ComfyUI Flux workflow and save it to save_path.

    Args:
        prompt:    English image generation prompt (Flux does not support Chinese).
        save_path: Where to save the downloaded PNG file.
        width:     Image width in pixels (default 1024, 4:3 landscape for slides).
        height:    Image height in pixels (default 768).
        seed:      RNG seed. Random if None.
        timeout:   Max seconds to wait for generation.

    Returns:
        True on success, False on any failure (non-fatal — caller can skip illustration).
    """
    base_url = _get_api_url()
    if not base_url:
        log.debug("ComfyUI disabled (comfyui_api_url not set)")
        return False

    if seed is None:
        seed = random.randint(0, 2**32 - 1)

    # Build workflow with injected prompt, seed, and dimensions
    workflow = copy.deepcopy(_FLUX_WORKFLOW)
    workflow["30"]["inputs"]["text"] = prompt
    workflow["25"]["inputs"]["noise_seed"] = seed
    workflow["27"]["inputs"]["width"] = width
    workflow["27"]["inputs"]["height"] = height

    client_id = str(uuid.uuid4())
    payload = {"prompt": workflow, "client_id": client_id}

    try:
        async with httpx.AsyncClient(verify=False, timeout=httpx.Timeout(30.0, connect=10.0)) as client:
            # 1. Submit workflow
            resp = await client.post(f"{base_url}/prompt", json=payload)
            if resp.status_code != 200:
                log.warning("ComfyUI /prompt returned %d: %s", resp.status_code, resp.text[:200])
                return False

            data = resp.json()
            prompt_id: str = data.get("prompt_id", "")
            if not prompt_id:
                log.warning("ComfyUI response missing prompt_id: %s", data)
                return False

            log.info("ComfyUI submitted prompt_id=%s seed=%d", prompt_id, seed)

        # 2. Poll /history/{prompt_id} until completed or timeout
        import asyncio
        import time
        deadline = time.monotonic() + timeout
        async with httpx.AsyncClient(verify=False, timeout=10.0) as client:
            while time.monotonic() < deadline:
                await asyncio.sleep(2.0)
                try:
                    hist_resp = await client.get(f"{base_url}/history/{prompt_id}")
                    hist = hist_resp.json()
                except Exception as exc:
                    log.debug("ComfyUI history poll failed: %s", exc)
                    continue

                item = hist.get(prompt_id, {})
                status = item.get("status", {})
                if status.get("completed"):
                    # 3. Extract output filename
                    outputs = item.get("outputs", {})
                    images = outputs.get("9", {}).get("images", [])
                    if not images:
                        log.warning("ComfyUI completed but no images in output for prompt_id=%s", prompt_id)
                        return False

                    img_info = images[0]
                    filename = img_info["filename"]
                    subfolder = img_info.get("subfolder", "")
                    img_type = img_info.get("type", "output")

                    # 4. Download the image
                    params = {"filename": filename, "subfolder": subfolder, "type": img_type}
                    img_resp = await client.get(f"{base_url}/view", params=params)
                    if img_resp.status_code != 200:
                        log.warning("ComfyUI /view returned %d for %s", img_resp.status_code, filename)
                        return False

                    save_path.parent.mkdir(parents=True, exist_ok=True)
                    save_path.write_bytes(img_resp.content)
                    log.info("ComfyUI image saved to %s (%d bytes)", save_path, len(img_resp.content))
                    return True

                # Check for execution error
                messages = status.get("messages", [])
                for msg_type, _msg_data in messages:
                    if msg_type == "execution_error":
                        log.error("ComfyUI execution error for prompt_id=%s", prompt_id)
                        return False

        log.warning("ComfyUI timed out after %ds for prompt_id=%s", timeout, prompt_id)
        return False

    except httpx.ConnectError as exc:
        log.warning("ComfyUI connection error: %s", exc)
        return False
    except httpx.TimeoutException as exc:
        log.warning("ComfyUI timeout: %s", exc)
        return False
    except Exception as exc:
        log.error("ComfyUI unexpected error: %s", exc, exc_info=True)
        return False

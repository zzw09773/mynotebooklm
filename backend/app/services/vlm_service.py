"""
vlm_service.py — VLM image understanding for document ingestion.

Sends image bytes to an OpenAI-compatible vision endpoint and returns a
natural-language description of the image content (charts, diagrams, layout).

This supplements OCR-extracted text with semantic understanding that Tesseract
cannot provide.  Always non-fatal: returns "" on any error.
"""
import base64
import logging

import httpx

log = logging.getLogger(__name__)

_DESCRIBE_PROMPT = """請描述這張圖片的內容。重點關注：
1. 圖表/表格的數據和結論
2. 流程圖的步驟和關係
3. 圖片中無法被 OCR 辨識的視覺資訊（手寫、印章、圖示）
4. 版面結構和重要標註

用繁體中文回答，簡潔扼要，200字以內。
如果圖片只有純文字且沒有特殊視覺元素，回覆「純文字頁面」。"""


async def describe_image(
    image_bytes: bytes,
    api_base_url: str,
    api_key: str,
    model: str,
    context_hint: str = "",
) -> str:
    """
    Send an image to the VLM and return a description of its content.

    Args:
        image_bytes:   Raw image data (JPEG or PNG).
        api_base_url:  OpenAI-compatible API base URL.
        api_key:       Bearer token for the API.
        model:         Vision model ID.
        context_hint:  Optional hint prepended to the prompt (e.g. "這是 PDF 的第 3 頁").

    Returns:
        Description string, or "" on any error (non-fatal).
        Returns "" (not "純文字頁面") when the page has only plain text
        so that callers can use a simple truthiness check.
    """
    img_b64 = base64.standard_b64encode(image_bytes).decode()
    prompt = f"{context_hint}\n\n{_DESCRIBE_PROMPT}".strip() if context_hint else _DESCRIBE_PROMPT

    content = [
        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{img_b64}"}},
        {"type": "text", "text": prompt},
    ]

    try:
        async with httpx.AsyncClient(verify=False, timeout=60) as client:
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
            text = resp.json()["choices"][0]["message"]["content"].strip()

        if text == "純文字頁面":
            return ""
        return text

    except Exception:
        log.exception("vlm_service: describe_image failed (non-fatal)")
        return ""

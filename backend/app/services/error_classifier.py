"""
LLM / Embedding API error classification and retry strategy.

Inspired by Claude Code's services/api/errors.ts pattern:
classify errors into distinct types so each can be handled with the
appropriate retry strategy and user-facing message.
"""
from __future__ import annotations

import logging
import re
from enum import Enum


class LLMErrorType(Enum):
    AUTH_INVALID = "auth"            # 401/403 — don't retry, prompt user to fix API key
    RATE_LIMITED = "rate_limit"      # 429 — exponential backoff retry
    MODEL_UNAVAILABLE = "model"      # 500 with model-specific pattern — don't retry
    TIMEOUT = "timeout"              # read timeout — retry with same params
    CONNECTION = "connection"        # connection refused/reset — short retry
    PROMPT_TOO_LONG = "too_long"     # token limit exceeded — truncate then retry
    UNKNOWN = "unknown"              # retry once


# ── User-facing messages (zh-TW) ─────────────────────────────────────────────

_USER_MESSAGES: dict[LLMErrorType, str] = {
    LLMErrorType.AUTH_INVALID: (
        "API 金鑰無效或已過期，請至「設定」頁面更新 API Key 後重試。"
    ),
    LLMErrorType.RATE_LIMITED: (
        "AI 伺服器請求過於頻繁，系統將自動重試，請稍候。"
    ),
    LLMErrorType.MODEL_UNAVAILABLE: (
        "AI 模型目前無法使用（可能正在重新載入），請稍後重試。"
        " 若持續發生，請聯繫管理員確認推論服務狀態。"
    ),
    LLMErrorType.TIMEOUT: (
        "AI 伺服器回應逾時，系統將自動重試，請稍候。"
    ),
    LLMErrorType.CONNECTION: (
        "無法連線到 AI 伺服器，請確認服務是否正常運行後重試。"
    ),
    LLMErrorType.PROMPT_TOO_LONG: (
        "輸入內容超過模型 token 上限，系統將自動截短後重試。"
    ),
    LLMErrorType.UNKNOWN: (
        "AI 服務發生未知錯誤，請稍後重試。"
    ),
}

# ── Retry policy per error type ───────────────────────────────────────────────

class RetryPolicy:
    def __init__(self, should_retry: bool, max_attempts: int = 1, backoff_secs: float = 0.0):
        self.should_retry = should_retry
        self.max_attempts = max_attempts
        self.backoff_secs = backoff_secs


_RETRY_POLICY: dict[LLMErrorType, RetryPolicy] = {
    LLMErrorType.AUTH_INVALID:      RetryPolicy(should_retry=False),
    LLMErrorType.RATE_LIMITED:      RetryPolicy(should_retry=True, max_attempts=3, backoff_secs=10.0),
    LLMErrorType.MODEL_UNAVAILABLE: RetryPolicy(should_retry=False),
    LLMErrorType.TIMEOUT:           RetryPolicy(should_retry=True, max_attempts=2, backoff_secs=5.0),
    LLMErrorType.CONNECTION:        RetryPolicy(should_retry=True, max_attempts=2, backoff_secs=3.0),
    LLMErrorType.PROMPT_TOO_LONG:   RetryPolicy(should_retry=False),  # caller must truncate first
    LLMErrorType.UNKNOWN:           RetryPolicy(should_retry=True, max_attempts=1, backoff_secs=5.0),
}


# ── Classifier ────────────────────────────────────────────────────────────────

def classify_llm_error(exc: Exception) -> LLMErrorType:
    """
    Classify an exception raised during an LLM or Embedding API call.

    Inspects the exception type name and message for known patterns,
    matching the approach from Claude Code's services/api/errors.ts.
    """
    exc_type = type(exc).__name__
    msg = str(exc).lower()

    # Auth errors
    if any(p in msg for p in ("401", "403", "invalid or expired", "invalid api key",
                               "api key required", "unauthorized", "forbidden")):
        return LLMErrorType.AUTH_INVALID

    # Rate limiting
    if "429" in msg or "rate limit" in msg or "too many requests" in msg:
        return LLMErrorType.RATE_LIMITED

    # Token / prompt too long
    if any(p in msg for p in ("prompt is too long", "context length", "token limit",
                               "maximum context", "tokens > ")):
        return LLMErrorType.PROMPT_TOO_LONG

    # Timeout — asyncio.TimeoutError or httpx read timeout
    if exc_type in ("TimeoutError", "ReadTimeout", "ConnectTimeout"):
        return LLMErrorType.TIMEOUT
    if "timeout" in msg or "timed out" in msg:
        return LLMErrorType.TIMEOUT

    # Connection errors
    if exc_type in ("ConnectError", "RemoteProtocolError", "ConnectionError",
                    "APIConnectionError", "APIConnectionTimeoutError"):
        return LLMErrorType.CONNECTION
    if any(p in msg for p in ("connection refused", "connection reset", "connect error",
                               "network", "econnrefused")):
        return LLMErrorType.CONNECTION

    # Model unavailable: 500 with known inference-server patterns
    if "500" in msg or "internal server error" in msg:
        if any(p in msg for p in ("no available versions", "model not found",
                                   "model unavailable", "backend", "triton")):
            return LLMErrorType.MODEL_UNAVAILABLE
        # Generic 500 from inference server — treat as model issue for embedding,
        # unknown for LLM (LLM 500s are often transient)
        return LLMErrorType.UNKNOWN

    return LLMErrorType.UNKNOWN


def get_user_message(error_type: LLMErrorType) -> str:
    return _USER_MESSAGES.get(error_type, _USER_MESSAGES[LLMErrorType.UNKNOWN])


def get_retry_policy(error_type: LLMErrorType) -> RetryPolicy:
    return _RETRY_POLICY.get(error_type, _RETRY_POLICY[LLMErrorType.UNKNOWN])


def log_classified_error(exc: Exception, context: str = "") -> LLMErrorType:
    """Classify, log, and return the error type. Convenience wrapper."""
    error_type = classify_llm_error(exc)
    prefix = f"[{context}] " if context else ""
    logging.warning(
        "%sLLM error classified as %s: %s", prefix, error_type.value, str(exc)[:200]
    )
    return error_type

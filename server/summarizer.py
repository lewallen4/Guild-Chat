"""
summarizer.py — Uses the model to write a compact summary of each session.

The summary is written into memory.md under RECENT SESSIONS so the model
has useful context about past conversations on startup.

Supports two backends:
  - Local: uses model_loader.generate_summary() (llama.cpp)
  - OpenRouter: makes a non-streaming API call when local model is
    unavailable or the user's active backend is OpenRouter

Falls back gracefully to a plain first-message preview if both fail.
"""

import re
import json
import httpx
from typing import List, Dict, Optional
from datetime import datetime


# ── Summary prompt ──────────────────────────────────────────────────

SUMMARY_PROMPT_TEMPLATE = """\
Below is a transcript of a chat session.
Write a 1–3 sentence summary capturing only the key facts, decisions, or requests.
Do NOT use bullet points. Write plain prose sentences only.
If nothing notable happened, write: No notable content.

---
{conversation}
---

Summary: """

OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"


class SessionSummarizer:
    def __init__(self):
        self._model = None

    def set_model(self, model_loader) -> None:
        """Called by app.py after both objects are created."""
        self._model = model_loader

    async def summarize_session(
        self,
        messages: List[Dict],
        existing_memory: str = "",
        openrouter_key: str = "",
        openrouter_model: str = "openrouter/auto",
        prefer_openrouter: bool = False,
    ) -> Dict:
        """
        Returns a summary dict consumed by session_manager.save_to_memory().
        {
            "summary":       str,
            "message_count": int,
            "timestamp":     str,
        }

        Backend selection:
          - If prefer_openrouter is True and a key is available, use OpenRouter.
          - Otherwise try local model first, fall back to OpenRouter if local fails.
          - If both fail, use the plain text fallback.
        """
        if not messages:
            return {}

        timestamp     = datetime.now().strftime("%Y-%m-%d %H:%M")
        message_count = len(messages)
        fallback      = self._fallback_summary(messages)

        transcript = self._build_transcript(messages)
        if not transcript:
            return {"summary": fallback, "message_count": message_count, "timestamp": timestamp}

        summary = None

        # OpenRouter first if preferred
        if prefer_openrouter and openrouter_key:
            summary = await self._openrouter_summary(transcript, openrouter_key, openrouter_model)

        # Local model
        if summary is None:
            summary = self._local_summary(transcript)

        # OpenRouter as fallback if local failed
        if summary is None and openrouter_key and not prefer_openrouter:
            summary = await self._openrouter_summary(transcript, openrouter_key, openrouter_model)

        return {
            "summary":       summary or fallback,
            "message_count": message_count,
            "timestamp":     timestamp,
        }

    # ── Internal ───────────────────────────────────────────────────

    def _build_transcript(self, messages: List[Dict]) -> str:
        lines = []
        for m in messages[-20:]:
            role_label = "Person" if m["role"] == "user" else "AI"
            content = m["content"].strip()
            if len(content) > 300:
                content = content[:300] + "…"
            lines.append(f"{role_label}: {content}")
        return "\n".join(lines)

    def _local_summary(self, transcript: str) -> Optional[str]:
        if self._model is None:
            return None
        prompt = SUMMARY_PROMPT_TEMPLATE.format(conversation=transcript)
        try:
            raw = self._model.generate_summary(prompt, max_tokens=150)
        except Exception as e:
            print(f"Summarizer local model call failed: {e}")
            return None
        return self._clean_summary(raw)

    async def _openrouter_summary(
        self,
        transcript: str,
        api_key: str,
        model: str,
    ) -> Optional[str]:
        prompt = SUMMARY_PROMPT_TEMPLATE.format(conversation=transcript)
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://guild-chat.local",
            "X-Title": "Guild Chat",
        }
        body = {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.3,
            "max_tokens": 150,
            "stream": False,
        }
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(OPENROUTER_API_URL, headers=headers, json=body)
                if resp.status_code != 200:
                    print(f"Summarizer OpenRouter error {resp.status_code}: {resp.text[:200]}")
                    return None
                data = resp.json()
                raw = data["choices"][0]["message"]["content"]
                result = self._clean_summary(raw)
                if result:
                    print(f"  ✓ Summarizer used OpenRouter ({model})")
                return result
        except Exception as e:
            print(f"Summarizer OpenRouter call failed: {e}")
            return None

    def _clean_summary(self, raw: str) -> Optional[str]:
        if not raw or not raw.strip():
            return None
        raw = raw.strip()
        lines = raw.splitlines()
        cleaned = " ".join(
            line.lstrip("-•* ").strip()
            for line in lines
            if line.strip()
        )
        sentences = re.split(r'(?<=[.!?])\s+', cleaned)
        sentences = [s.strip() for s in sentences if s.strip()]
        if not sentences:
            return None
        result = " ".join(sentences[:3])
        if result[-1] not in ".!?":
            result += "."
        return result

    def _fallback_summary(self, messages: List[Dict]) -> str:
        first_user_msg = ""
        for m in messages:
            if m.get("role") == "user":
                first_user_msg = m["content"].strip()
                break
        count = len(messages)
        if first_user_msg:
            preview = first_user_msg[:120]
            if len(first_user_msg) > 120:
                preview += "…"
            return f"Session with {count} messages, starting with: {preview}"
        return f"Session with {count} messages."

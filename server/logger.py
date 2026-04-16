"""
logger.py — Rotating file logger capped at 3000 lines.

Logs model I/O, session events, knowledge queries, and errors
to server/logs/local-chat.log. Oldest lines are trimmed when
the file exceeds 3000 lines.

Usage:
    from logger import log
    log("SESSION", "start sid=abc123 user=skyee")
    log("PROMPT", full_prompt_text)
    log("RESPONSE", response_text)
    log("ERROR", "something broke")
"""

from pathlib import Path
from datetime import datetime
import threading

LOG_DIR = Path("logs")
LOG_FILE = LOG_DIR / "local-chat.log"
MAX_LINES = 3000

_lock = threading.Lock()


def _ensure_dir():
    LOG_DIR.mkdir(exist_ok=True)


def log(category: str, message: str) -> None:
    """
    Append a timestamped log entry. Thread-safe.
    Category should be one of: SESSION, PROMPT, RESPONSE, SUMMARY,
    KNOWLEDGE, SETTINGS, ERROR, WARN, INFO
    """
    _ensure_dir()
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cat = category.upper().ljust(10)

    # Format multi-line messages with continuation indent
    lines = message.rstrip().split("\n")
    formatted = f"[{timestamp}] {cat}| {lines[0]}\n"
    for continuation in lines[1:]:
        formatted += f"[{timestamp}] {cat}| {continuation}\n"

    with _lock:
        try:
            # Append the new entry
            with open(LOG_FILE, "a", encoding="utf-8") as f:
                f.write(formatted)

            # Trim if over limit
            _trim_if_needed()
        except Exception as e:
            # Don't crash the app if logging fails
            print(f"Log write error: {e}")


def _trim_if_needed():
    """Keep only the last MAX_LINES lines in the log file."""
    try:
        with open(LOG_FILE, "r", encoding="utf-8") as f:
            all_lines = f.readlines()

        if len(all_lines) > MAX_LINES:
            # Keep the last MAX_LINES, prepend a trim marker
            trimmed = all_lines[-MAX_LINES:]
            with open(LOG_FILE, "w", encoding="utf-8") as f:
                f.writelines(trimmed)
    except Exception:
        pass


def log_prompt(arch: str, prompt: str, memory_used: bool, knowledge_used: bool, temperature: float) -> None:
    """Log a full prompt with metadata header."""
    char_count = len(prompt)
    meta = f"arch={arch} chars={char_count} memory={'yes' if memory_used else 'no'} knowledge={'yes' if knowledge_used else 'no'} temp={temperature}"
    log("PROMPT", f"{meta}\n{'─' * 60}\n{prompt}\n{'─' * 60}")


def log_response(response: str, duration_ms: int = 0) -> None:
    """Log a model response with stats."""
    char_count = len(response)
    duration_str = f" {duration_ms}ms" if duration_ms else ""
    log("RESPONSE", f"{char_count} chars{duration_str}\n{'─' * 60}\n{response}\n{'─' * 60}")


def log_session(event: str, session_id: str, user_id: str = "", extra: str = "") -> None:
    """Log a session lifecycle event."""
    sid_short = session_id[:8] if session_id else "—"
    parts = [f"{event} sid={sid_short}"]
    if user_id:
        parts.append(f"user={user_id}")
    if extra:
        parts.append(extra)
    log("SESSION", " ".join(parts))


def log_knowledge(query: str, results_count: int, top_score: float = 0) -> None:
    """Log a knowledge base search."""
    log("KNOWLEDGE", f"query=\"{query[:100]}\" results={results_count} top_score={top_score:.3f}")


def log_summary(session_id: str, summary: str) -> None:
    """Log a session summary."""
    sid_short = session_id[:8] if session_id else "—"
    log("SUMMARY", f"sid={sid_short} → {summary}")


def log_error(context: str, error: Exception) -> None:
    """Log an error with context."""
    log("ERROR", f"[{context}] {type(error).__name__}: {error}")

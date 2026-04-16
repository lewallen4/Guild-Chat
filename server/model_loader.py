import asyncio
from typing import AsyncGenerator, List, Dict, Any
from pathlib import Path

try:
    import llama_cpp
    HAS_LLAMA_CPP = True
    print("✅ llama-cpp-python found")
except ImportError as e:
    HAS_LLAMA_CPP = False
    print(f"❌ llama-cpp-python not found: {e}")

try:
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer
    HAS_TRANSFORMERS = True
    print("✅ transformers found")
except ImportError as e:
    HAS_TRANSFORMERS = False
    print(f"❌ transformers not found: {e}")


# ── Per-architecture stop sequences ────────────────────────────────
# Keys are matched against the model's architecture metadata from GGUF.
# The "_default" key is the fallback for anything unrecognized.

STOP_MAP = {
    "gemma4": [
        "<turn|>",
        "<|turn>user",
    ],
    "gemma": [
        "<end_of_turn>",
        "<start_of_turn>user",
    ],
    "llama": [
        "\nUSER:", "\nUser:", "\nuser:",
        "\nHuman:", "\nHUMAN:",
        "\n### Human", "\n### User",
        "\n[INST]", "\n<|user|>",
        "User:", "Human:",
    ],
    "granite": [
        "\nUSER:", "\nUser:",
        "\nHuman:", "User:", "Human:",
        "<|end_of_text|>",
    ],
    "mistral": [
        "\n[INST]",
        "</s>",
    ],
    "_default": [
        "\nUSER:", "\nUser:", "\nuser:",
        "\nHuman:", "\nHUMAN:", "\nhuman:",
        "\n### Human", "\n### User",
        "\n[INST]", "\n<|user|>", "\n<human>",
        "User:", "Human:",
    ],
}


def _detect_stop_sequences(model) -> tuple:
    """
    Read the GGUF metadata to determine model architecture,
    then return (arch_name, stop_sequences).
    """
    arch = "unknown"
    try:
        # llama-cpp-python exposes metadata as model.metadata
        meta = getattr(model, "metadata", {}) or {}

        # Try general.architecture first
        arch_raw = meta.get("general.architecture", "")
        if not arch_raw:
            # Fall back to model description or name
            arch_raw = meta.get("general.name", "")

        arch = arch_raw.lower().strip()
    except Exception as e:
        print(f"  ⚠ Could not read model metadata: {e}")

    # Match against known architectures (check gemma4 before gemma)
    for key in ["gemma4", "gemma", "granite", "llama", "mistral"]:
        if key in arch:
            print(f"  → Detected architecture: {arch} → using '{key}' stop sequences")
            return key, STOP_MAP[key]

    print(f"  → Architecture '{arch}' not recognized → using default stop sequences")
    return arch, STOP_MAP["_default"]


class ModelLoader:
    def __init__(self, model_path: str):
        self.model_path = Path(model_path)
        self.model      = None
        self.tokenizer  = None
        self.backend    = None
        self.arch       = "unknown"
        self.stop_sequences = STOP_MAP["_default"]
        self.load_model()

    def load_model(self):
        if not self.model_path.exists():
            raise FileNotFoundError(f"Model not found at {self.model_path}")

        if HAS_LLAMA_CPP:
            print(f"Loading model with llama.cpp: {self.model_path}")
            try:
                self.model = llama_cpp.Llama(
                    model_path=str(self.model_path),
                    n_ctx=8192,
                    n_threads=4,
                    n_gpu_layers=0,
                    verbose=False,
                    logits_all=False,
                    embedding=True,
                )
                self.backend = "llama.cpp"

                # Auto-detect architecture and stop sequences
                self.arch, self.stop_sequences = _detect_stop_sequences(self.model)

                print("✅ Model loaded with llama.cpp")
                return
            except Exception as e:
                print(f"❌ llama.cpp failed: {e}")

        if HAS_TRANSFORMERS:
            print(f"Loading model with transformers: {self.model_path}")
            try:
                self.tokenizer = AutoTokenizer.from_pretrained(self.model_path.parent)
                self.model = AutoModelForCausalLM.from_pretrained(
                    self.model_path.parent,
                    torch_dtype=torch.float32,
                    low_cpu_mem_usage=True,
                )
                self.backend = "transformers"
                print("✅ Model loaded with transformers")
                return
            except Exception as e:
                print(f"❌ transformers failed: {e}")

        raise RuntimeError("No suitable backend found to load the model")

    def generate_simple(self, prompt: str, max_tokens: int = 300) -> str:
        """
        One-shot blocking generation — no streaming, no SSE.
        Used for internal tasks like summarization where we just need
        the full text back without yielding chunks to a client.
        Falls back to empty string on any error so callers don't crash.
        """
        if self.backend == "llama.cpp":
            try:
                result = self.model(
                    prompt,
                    max_tokens=max_tokens,
                    temperature=0.3,
                    top_p=0.9,
                    repeat_penalty=1.1,
                    stop=self.stop_sequences + ["###", "---"],
                    echo=False,
                    stream=False,
                )
                return result["choices"][0]["text"].strip()
            except Exception as e:
                print(f"generate_simple error: {e}")
                return ""

        elif self.backend == "transformers":
            return ""

        return ""

    def generate_summary(self, prompt: str, max_tokens: int = 200) -> str:
        """
        Blocking generation specifically for session summarization.
        Uses stop sequences that won't collide with transcript content
        (the transcript uses 'Person:' / 'AI:' labels, not 'User:' / 'Human:').
        """
        summary_stops = ["---", "###", "\n\n\n", "Person:", "AI:", "Transcript:"]

        if self.backend == "llama.cpp":
            try:
                result = self.model(
                    prompt,
                    max_tokens=max_tokens,
                    temperature=0.4,
                    top_p=0.9,
                    repeat_penalty=1.1,
                    stop=summary_stops,
                    echo=False,
                    stream=False,
                )
                return result["choices"][0]["text"].strip()
            except Exception as e:
                print(f"generate_summary error: {e}")
                return ""

        elif self.backend == "transformers":
            return ""

        return ""

    def embed(self, text: str) -> list:
        """
        Generate an embedding vector for the given text.
        Returns a list of floats, or empty list on failure.
        """
        if self.backend == "llama.cpp":
            try:
                result = self.model.embed(text)
                # llama-cpp-python may return list-of-lists or flat list
                if result and isinstance(result[0], list):
                    return result[0]
                return result
            except Exception as e:
                print(f"embed error: {e}")
                return []
        return []

    async def generate_stream(self, context: Dict[str, Any]) -> AsyncGenerator[str, None]:
        prompt = context.get("prompt", "")
        temperature = context.get("temperature", 0.7)
        max_tokens = context.get("max_tokens", 1024)

        if self.backend == "llama.cpp":
            try:
                stream = self.model(
                    prompt,
                    max_tokens=max_tokens,
                    temperature=temperature,
                    top_p=0.95,
                    repeat_penalty=1.1,
                    stop=self.stop_sequences,
                    echo=False,
                    stream=True,
                )
                for chunk in stream:
                    text = chunk["choices"][0]["text"]
                    for stop in self.stop_sequences:
                        if stop.strip() in text:
                            before = text[:text.find(stop.strip())]
                            if before:
                                yield before
                            return
                    yield text
                    await asyncio.sleep(0)
            except Exception as e:
                yield f"[Error during generation: {e}]"

        elif self.backend == "transformers":
            yield "This is a simulated response from the transformers backend."
            await asyncio.sleep(0.5)

        else:
            yield f"Mock response (no model loaded). Prompt preview: '{prompt[:50]}...'"
            await asyncio.sleep(0.1)

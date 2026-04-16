# Guild Chat

A self-hosted AI chat server built on FastAPI and llama.cpp. Fully local, multi-user, with persistent memory, session history, and a built-in knowledge base — no cloud APIs, no telemetry, no data leaving your machine.

---

## Quick Start

```bash
git clone https://github.com/lewallen4/Guild-chat.git
cd Guild-chat
bash setup.sh
bash gui_model_pull.sh
bash run.sh --lan
```

Open `http://your-ip:8000` from any device on your network.

---

## Requirements

- Python 3.10+
- A GGUF model file (downloaded via the included model puller)
- Linux (Ubuntu/Debian, RHEL/Fedora) or macOS
- Recommended: NVIDIA GPU with 8+ GB VRAM (CPU-only works but is slower)

---

## Setup

```bash
bash setup.sh
```

This creates a Python virtual environment at `~/.localchat-venv`, installs all dependencies (FastAPI, uvicorn, llama-cpp-python, etc.), and prepares the directory structure.

---

## Downloading a Model

### GUI picker (recommended)

```bash
bash gui_model_pull.sh
```

Presents an interactive menu with models from Meta (Llama), Mistral, IBM (Granite), and Google (Gemma). Select a number and it downloads via curl with a progress bar. Available models include:

| # | Model | Size | RAM Needed |
|---|-------|------|------------|
| 1–6 | Llama 3.1 / 3.2 / 3.3 / 4 Scout | 0.8–50 GB | 4–64 GB |
| 7 | Mistral Small 3.1 24B | 14.5 GB | 20 GB |
| 8 | IBM Granite 3.3 8B | 4.6 GB | 8 GB |
| 9–10 | IBM Granite 4 (1B / 32B) | 0.9–19.5 GB | 4–24 GB |
| 11 | IBM Granite Guardian 3.2 5B | 3.1 GB | 8 GB |
| 12–15 | Google Gemma 4 31B (multiple quants) | 18–33 GB | 24–40 GB |

### Minimal (no menu)

```bash
bash model_pull.sh
```

Downloads IBM Granite 3.3 8B Q4_K_M by default.

Models are saved to `server/models/model.gguf`.

---

## Running the Server

### Interactive (foreground)

```bash
bash run.sh              # localhost only
bash run.sh --lan        # LAN accessible (0.0.0.0)
bash run.sh --port 9000  # custom port
bash run.sh --dev        # hot-reload + debug logging
```

### As a Background Service (systemd)

```bash
sudo bash install-service.sh          # runs as your user
sudo bash install-service.sh --root   # runs as root
```

The service starts on every boot, bound to `0.0.0.0:8000`.

```bash
sudo systemctl status local-chat      # check status
journalctl -u local-chat -f           # live logs
sudo systemctl restart local-chat     # restart
sudo systemctl stop local-chat        # stop
sudo bash install-service.sh remove   # uninstall
```

---

## Using the Chat

1. Open `http://localhost:8000` (or your LAN IP)
2. Enter a 5-character user ID (letters, numbers, `-`, `_`)
3. Start chatting

Each user gets their own workspace with isolated memory and session history. The sidebar shows past sessions — click any to resume it.

### Features

- **Streaming responses** with markdown rendering, syntax-highlighted code blocks, and copy buttons
- **Collapsible `<think>` blocks** for models that emit reasoning (Gemma 4, etc.)
- **Per-user persistent memory** that builds automatically from session summaries
- **Session history** with click-to-resume — no duplicate sessions, one active per user
- **Light/dark theme** toggle
- **Keyboard shortcuts:** `Ctrl+N` new session, `Ctrl+B` toggle sidebar, `Esc` clear input

---

## Knowledge Base

Make your AI an expert on your own documents. Local Chat can ingest Confluence XML exports, markdown files, and plain text, then retrieve relevant content at query time and inject it into the prompt.

No external embedding model or vector database required — it uses your loaded chat model to generate embeddings.

### Setup

1. Create the knowledge directory:

```bash
mkdir -p server/knowledge
```

2. Drop your files in. Subdirectories are supported:

```
server/knowledge/
├── confluence/
│   └── export.xml
├── docs/
│   ├── architecture.md
│   └── runbooks.txt
└── notes.md
```

Supported formats: `.xml` (Confluence), `.md`, `.txt`

3. Start the server, then run ingestion:

```bash
bash ingest.sh
```

This parses all documents, chunks them, embeds each chunk with your model, and saves the index to `server/knowledge_index.json`. Ingestion may take a few minutes depending on document volume.

4. Chat normally. Relevant knowledge is automatically retrieved and injected into the prompt when you ask questions.

### Re-ingesting

When documents change, just run `bash ingest.sh` again. It rebuilds the full index.

### API

```
GET  /api/knowledge/status           # check if loaded + chunk count
POST /api/knowledge/ingest           # trigger ingestion
GET  /api/knowledge/search?q=query   # test retrieval
```

---

## Project Structure

```
Local-chat/
├── setup.sh                 # environment + dependency setup
├── run.sh                   # server launcher (foreground)
├── install-service.sh       # systemd service installer
├── model_pull.sh            # minimal model downloader
├── gui_model_pull.sh        # interactive model downloader
├── ingest.sh                # knowledge base ingestion trigger
├── README.md
├── server/
│   ├── app.py               # FastAPI routes, SSE streaming, session lifecycle
│   ├── model_loader.py      # llama.cpp model loading, generation, embedding
│   ├── session_manager.py   # per-user memory, session persistence, prompt assembly
│   ├── summarizer.py        # session summarization (1–3 sentence prose)
│   ├── knowledge_base.py    # document ingestion, chunking, embedding, retrieval
│   ├── requirements.txt
│   ├── models/
│   │   ├── model.gguf       # your downloaded model (not in git)
│   │   ├── system_prompt.txt
│   │   ├── memory.md
│   │   └── default_memory.md
│   ├── knowledge/           # drop documents here for RAG (not in git)
│   ├── static/
│   │   ├── script.js        # frontend logic, markdown rendering, streaming
│   │   └── style.css
│   └── templates/
│       └── index.html
└── .github/
    └── workflows/           # CI/CD
```

---

## Configuration

### Context Window

The default context window is 4096 tokens. To increase it, edit `n_ctx` in `server/model_loader.py`:

```python
n_ctx=8192,  # or 16384, 32768 — depends on your model + available RAM
```

### System Prompt

Edit `server/models/system_prompt.txt` to customize the AI's behavior.

### Memory

Per-user memory is stored in `server/users/<user_id>/memory.md`. Session summaries are appended automatically (1–3 sentences each, 10 most recent kept for prompt injection). The 20 most recent session files stay in the active directory; older sessions are moved to `server/cold_session_storage/<user_id>/sessions/` for external backup and retention.

### GPU Layers

To offload layers to GPU, edit `n_gpu_layers` in `server/model_loader.py`:

```python
n_gpu_layers=35,  # adjust based on your VRAM
```

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Chat UI |
| `GET` | `/api/user/{id}/check` | Check if user exists |
| `POST` | `/api/chat/start` | Start new session |
| `POST` | `/api/chat/rejoin` | Rejoin existing session |
| `POST` | `/api/chat/{sid}` | Send message (SSE stream) |
| `POST` | `/api/chat/{sid}/end` | End session |
| `GET` | `/api/sessions/{sid}/history` | Get session messages |
| `GET` | `/api/user/{id}/sessions` | List user's sessions |
| `GET` | `/api/memory?user_id=` | Get user memory |
| `GET` | `/api/knowledge/status` | Knowledge base status |
| `POST` | `/api/knowledge/ingest` | Trigger ingestion |
| `GET` | `/api/knowledge/search?q=` | Search knowledge base |

---

## License

MIT

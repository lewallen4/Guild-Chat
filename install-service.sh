#!/usr/bin/env bash
# ============================================================
#  Skye-AI — systemd Service Installer
#
#  Installs Local Chat as a background service that starts
#  on every boot, bound to 0.0.0.0 for LAN access.
#
#  Usage:
#    sudo bash install-service.sh          # install as project owner
#    sudo bash install-service.sh --root   # install as root (sudo)
#    sudo bash install-service.sh remove   # disable + remove
#
#  After install:
#    sudo systemctl status  local-chat
#    sudo systemctl restart local-chat
#    sudo systemctl stop    local-chat
#    journalctl -u local-chat -f          # live logs
# ============================================================

set -uo pipefail

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

SERVICE_NAME="local-chat"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
RUN_AS_ROOT="false"

ok()   { echo -e "  ${GREEN}✓${RESET}  $1"; }
warn() { echo -e "  ${YELLOW}⚠${RESET}  $1"; }
die()  { echo -e "\n  ${RED}✗${RESET}  $1\n"; exit 1; }

# ── Must be root ───────────────────────────────────────────────────
if [ "$EUID" -ne 0 ]; then
    die "Run with sudo:  sudo bash install-service.sh"
fi

# ── Parse args ─────────────────────────────────────────────────────
for arg in "$@"; do
    case "$arg" in
        remove) ;;  # handled below
        --root) RUN_AS_ROOT="true" ;;
        *) warn "Unknown option: $arg" ;;
    esac
done

# ── Resolve paths (from wherever the script lives) ─────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$SCRIPT_DIR/server"
RUN_SCRIPT="$SCRIPT_DIR/run.sh"

# ── Detect the user who owns the project (not root) ────────────────
PROJECT_USER=$(stat -c '%U' "$SCRIPT_DIR" 2>/dev/null || stat -f '%Su' "$SCRIPT_DIR" 2>/dev/null)
PROJECT_GROUP=$(stat -c '%G' "$SCRIPT_DIR" 2>/dev/null || stat -f '%Sg' "$SCRIPT_DIR" 2>/dev/null)
VENV_DIR="/home/${PROJECT_USER}/.localchat-venv"
PYTHON="${VENV_DIR}/bin/python"

# ── Override for root mode ─────────────────────────────────────────
if [ "$RUN_AS_ROOT" = "true" ]; then
    # When running as root, the venv might be in the project owner's home
    # or in root's home. Check project owner's first, fall back to root's.
    if [ -f "$PYTHON" ]; then
        : # found it under project owner's home, use it
    elif [ -f "/root/.localchat-venv/bin/python" ]; then
        VENV_DIR="/root/.localchat-venv"
        PYTHON="${VENV_DIR}/bin/python"
    fi
    PROJECT_USER="root"
    PROJECT_GROUP="root"
fi

# ── Remove mode ────────────────────────────────────────────────────
if [ "${1:-}" = "remove" ]; then
    echo ""
    echo -e "${CYAN}${BOLD}Removing ${SERVICE_NAME} service...${RESET}"
    echo ""
    systemctl stop "$SERVICE_NAME" 2>/dev/null && ok "Stopped"
    systemctl disable "$SERVICE_NAME" 2>/dev/null && ok "Disabled"
    rm -f "$SERVICE_FILE" && ok "Service file removed"
    systemctl daemon-reload
    ok "Done"
    echo ""
    exit 0
fi

# ── Validation ─────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}${BOLD}╔════════════════════════════════════════════╗${RESET}"
echo -e "${CYAN}${BOLD}║   Skye-AI  —  Service Installer            ║${RESET}"
echo -e "${CYAN}${BOLD}╚════════════════════════════════════════════╝${RESET}"
echo ""

[ -d "$SERVER_DIR" ] || die "Server directory not found: $SERVER_DIR"
[ -f "$RUN_SCRIPT" ] || die "run.sh not found: $RUN_SCRIPT"
[ -f "$PYTHON" ]     || die "Virtualenv not found: $VENV_DIR — run setup.sh first"

# Find the model
MODEL_PATH=$(find "$SERVER_DIR/models" -maxdepth 2 \( -name "*.gguf" -o -name "*.model" \) 2>/dev/null | sort | head -1)
[ -n "$MODEL_PATH" ] || die "No model found in server/models/ — run model_pull.sh first"

ok "Project:  $SCRIPT_DIR"
ok "User:     $PROJECT_USER"
ok "Python:   $PYTHON"
ok "Model:    $(basename "$MODEL_PATH")"
echo ""

# ── Write service file ─────────────────────────────────────────────
cat > "$SERVICE_FILE" << EOF
[Unit]
Description=Local Chat — Skye-AI Server
After=network.target

[Service]
Type=simple
User=${PROJECT_USER}
Group=${PROJECT_GROUP}
WorkingDirectory=${SERVER_DIR}

# Environment
Environment="HAVEN_MODEL_PATH=${MODEL_PATH}"
Environment="LOCALCHAT_MODEL_PATH=${MODEL_PATH}"
Environment="HAVEN_MEMORY_PATH=${SERVER_DIR}/models/memory.md"
Environment="LOCALCHAT_MEMORY_PATH=${SERVER_DIR}/models/memory.md"

# Launch: LAN-accessible on port 8000
ExecStart=${PYTHON} -m uvicorn app:app --host 0.0.0.0 --port 8000 --workers 1

# Restart on crash, but not if we stopped it intentionally
Restart=on-failure
RestartSec=5

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${SERVICE_NAME}

[Install]
WantedBy=multi-user.target
EOF

ok "Service file written to $SERVICE_FILE"

# ── Enable + start ─────────────────────────────────────────────────
systemctl daemon-reload
ok "systemd reloaded"

systemctl enable "$SERVICE_NAME"
ok "Enabled on boot"

systemctl start "$SERVICE_NAME"
ok "Started"

echo ""
echo -e "${GREEN}${BOLD}  Service is running!${RESET}"
echo ""
echo -e "  ${BOLD}Status:${RESET}   sudo systemctl status ${SERVICE_NAME}"
echo -e "  ${BOLD}Logs:${RESET}     journalctl -u ${SERVICE_NAME} -f"
echo -e "  ${BOLD}Restart:${RESET}  sudo systemctl restart ${SERVICE_NAME}"
echo -e "  ${BOLD}Stop:${RESET}     sudo systemctl stop ${SERVICE_NAME}"
echo -e "  ${BOLD}Remove:${RESET}   sudo bash install-service.sh remove"
echo ""

# Show LAN IP
LAN_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
if [ -n "$LAN_IP" ]; then
    echo -e "  ${BOLD}Access:${RESET}   http://${LAN_IP}:8000"
else
    echo -e "  ${BOLD}Access:${RESET}   http://0.0.0.0:8000"
fi
echo ""

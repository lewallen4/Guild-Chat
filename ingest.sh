#!/usr/bin/env bash
# ============================================================
#  Knowledge Base Ingestion
#
#  Drops your Confluence XML, .md, or .txt files into
#  server/knowledge/ and embeds them using the loaded model.
#
#  Usage:
#    1. Put files in server/knowledge/
#    2. Make sure the server is running (bash run.sh)
#    3. Run: bash ingest.sh
#
#  Or run without the server for direct ingestion:
#    cd server && python3 -c "
#      from model_loader import ModelLoader
#      from knowledge_base import KnowledgeBase
#      ml = ModelLoader('models/model.gguf')
#      kb = KnowledgeBase()
#      kb.set_model(ml)
#      kb.ingest()
#    "
# ============================================================

set -uo pipefail

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KNOWLEDGE_DIR="$SCRIPT_DIR/server/knowledge"
SERVER_URL="${LOCAL_CHAT_URL:-http://localhost:8000}"

echo ""
echo -e "${CYAN}${BOLD}╔════════════════════════════════════════════╗${RESET}"
echo -e "${CYAN}${BOLD}║    Knowledge Base  —  Ingestion            ║${RESET}"
echo -e "${CYAN}${BOLD}╚════════════════════════════════════════════╝${RESET}"
echo ""

# Check knowledge directory
if [ ! -d "$KNOWLEDGE_DIR" ]; then
    mkdir -p "$KNOWLEDGE_DIR"
    echo -e "  ${YELLOW}⚠${RESET}  Created ${KNOWLEDGE_DIR}"
    echo -e "  ${DIM}Drop your .xml, .md, or .txt files there and re-run.${RESET}"
    echo ""
    exit 0
fi

FILE_COUNT=$(find "$KNOWLEDGE_DIR" -maxdepth 1 -type f \( -name "*.xml" -o -name "*.md" -o -name "*.txt" \) | wc -l)
if [ "$FILE_COUNT" -eq 0 ]; then
    echo -e "  ${YELLOW}⚠${RESET}  No .xml, .md, or .txt files found in:"
    echo -e "     ${DIM}${KNOWLEDGE_DIR}${RESET}"
    echo ""
    echo -e "  ${DIM}Drop your Confluence export or docs there and re-run.${RESET}"
    echo ""
    exit 0
fi

echo -e "  ${GREEN}✓${RESET}  Found ${BOLD}${FILE_COUNT}${RESET} file(s) in knowledge/"
echo ""

# Try API ingestion (server must be running)
echo -e "  ${DIM}Sending ingest request to ${SERVER_URL}...${RESET}"
echo ""

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${SERVER_URL}/api/knowledge/ingest" 2>/dev/null)
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -n -1)

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "  ${GREEN}${BOLD}✓  Ingestion complete${RESET}"
    echo -e "  ${DIM}${BODY}${RESET}"
else
    echo -e "  ${RED}✗${RESET}  Server returned HTTP ${HTTP_CODE}"
    echo -e "  ${DIM}${BODY}${RESET}"
    echo ""
    echo -e "  ${YELLOW}⚠${RESET}  Is the server running? Start it with: ${BOLD}bash run.sh${RESET}"
fi

echo ""

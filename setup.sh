#!/usr/bin/env bash
# ============================================================
#  Skye-AI — Environment Setup
#  Safe to re-run at any time. Self-healing — detects and
#  offers to install any missing system dependencies before
#  proceeding. Never requires a manual retry.
#
#  Supports: Ubuntu/Debian, RHEL/CentOS/Fedora, macOS (brew)
#  Usage: bash setup.sh
# ============================================================

# Intentionally no set -e — individual failures are caught
# and recovered from rather than aborting the whole script.
set -uo pipefail

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
RESET='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$SCRIPT_DIR/server"
MODELS_DIR="$SERVER_DIR/models"
VENV_DIR="$HOME/.localchat-venv"
SETUP_OK=true

# ── Helpers ────────────────────────────────────────────────────────
banner() {
    echo ""
    echo -e "${CYAN}${BOLD}╔══════════════════════════════════════════╗${RESET}"
    echo -e "${CYAN}${BOLD}║          Skye-AI  —  Setup               ║${RESET}"
    echo -e "${CYAN}${BOLD}╚══════════════════════════════════════════╝${RESET}"
    echo ""
}

step()  { echo -e "\n${CYAN}▶${RESET} ${BOLD}$1${RESET}"; }
ok()    { echo -e "  ${GREEN}✓${RESET}  $1"; }
warn()  { echo -e "  ${YELLOW}⚠${RESET}   $1"; }
die()   { echo -e "\n${RED}✗ Fatal:${RESET} $1\n"; exit 1; }
fail()  { echo -e "  ${RED}✗${RESET}  $1"; SETUP_OK=false; }
ask()   { read -rp "    → $1 (y/N): " _REPLY; [[ "$_REPLY" =~ ^[Yy]$ ]]; }

# ── Package manager detection ──────────────────────────────────────
detect_pm() {
    if   command -v apt-get >/dev/null 2>&1; then PM="apt"
    elif command -v dnf     >/dev/null 2>&1; then PM="dnf"
    elif command -v yum     >/dev/null 2>&1; then PM="yum"
    elif command -v brew    >/dev/null 2>&1; then PM="brew"
    elif command -v zypper  >/dev/null 2>&1; then PM="zypper"
    elif command -v pacman  >/dev/null 2>&1; then PM="pacman"
    else PM="unknown"
    fi
    ok "Package manager: $PM"
}

# ── Install a system package (prompts first) ───────────────────────
# Args: description  apt-pkg  dnf/yum-pkg  brew-pkg
install_pkg() {
    local DESC="$1"
    local APT_PKG="${2:-}"
    local DNF_PKG="${3:-$APT_PKG}"
    local BREW_PKG="${4:-$APT_PKG}"
    local ZYPPER_PKG="${5:-$DNF_PKG}"
    local PACMAN_PKG="${6:-$APT_PKG}"

    warn "$DESC is not installed."
    if ! ask "Attempt to install it now?"; then
        fail "$DESC skipped. Some steps may not complete."
        return 1
    fi

    echo ""
    case "$PM" in
        apt)
            sudo apt-get update -qq \
                && sudo apt-get install -y $APT_PKG \
                && ok "$DESC installed." \
                || { fail "apt install failed for: $APT_PKG"; return 1; }
            ;;
        dnf)
            sudo dnf install -y $DNF_PKG \
                && ok "$DESC installed." \
                || { fail "dnf install failed for: $DNF_PKG"; return 1; }
            ;;
        yum)
            sudo yum install -y $DNF_PKG \
                && ok "$DESC installed." \
                || { fail "yum install failed for: $DNF_PKG"; return 1; }
            ;;
        brew)
            brew install $BREW_PKG \
                && ok "$DESC installed." \
                || { fail "brew install failed for: $BREW_PKG"; return 1; }
            ;;
        zypper)
            sudo zypper install -y $ZYPPER_PKG \
                && ok "$DESC installed." \
                || { fail "zypper install failed for: $ZYPPER_PKG"; return 1; }
            ;;
        pacman)
            sudo pacman -S --noconfirm $PACMAN_PKG \
                && ok "$DESC installed." \
                || { fail "pacman install failed for: $PACMAN_PKG"; return 1; }
            ;;
        *)
            fail "No supported package manager found. Install $DESC manually then re-run."
            return 1
            ;;
    esac
}

# ── Bootstrap pip (tries multiple paths) ──────────────────────────
bootstrap_pip() {
    local PYTHON_BIN="$1"  # python3 or venv python

    # 1. ensurepip (built-in to Python 3.4+, fastest)
    if "$PYTHON_BIN" -m ensurepip --upgrade 2>/dev/null; then
        ok "pip bootstrapped via ensurepip."
        return 0
    fi

    # 2. get-pip.py via curl or wget
    warn "ensurepip unavailable — trying get-pip.py..."
    local GET_PIP="/tmp/get-pip-$$.py"
    if command -v curl >/dev/null 2>&1; then
        curl -fsSL https://bootstrap.pypa.io/get-pip.py -o "$GET_PIP" 2>/dev/null
    elif command -v wget >/dev/null 2>&1; then
        wget -q https://bootstrap.pypa.io/get-pip.py -O "$GET_PIP" 2>/dev/null
    fi

    if [ -f "$GET_PIP" ]; then
        "$PYTHON_BIN" "$GET_PIP" 2>/dev/null && rm -f "$GET_PIP" \
            && ok "pip installed via get-pip.py." \
            && return 0
        rm -f "$GET_PIP"
    fi

    # 3. System package manager
    install_pkg "pip" \
        "python3-pip" \
        "python3-pip" \
        "python3-pip" \
        "python3-pip" \
        "python-pip" \
        && return 0

    return 1
}

# ── Prerequisites ──────────────────────────────────────────────────
check_prereqs() {
    step "Checking prerequisites"
    detect_pm

    # Python 3
    if command -v python3 >/dev/null 2>&1; then
        ok "Python: $(python3 --version)"
    else
        install_pkg "Python 3" \
            "python3 python3-dev" \
            "python3 python3-devel" \
            "python3" \
            "python3 python3-devel" \
            "python" \
            || die "Python 3 is required. Install it manually and re-run."
    fi

    # pip (system level — also needed to bootstrap into venv)
    if python3 -m pip --version >/dev/null 2>&1; then
        ok "pip: $(python3 -m pip --version | cut -d' ' -f1-2)"
    else
        warn "pip not available for python3."
        if ask "Attempt to install pip now?"; then
            echo ""
            bootstrap_pip python3 \
                || fail "pip could not be installed. Dependency installation will fail."
        else
            fail "pip skipped. Python dependencies cannot be installed."
        fi
    fi

    # python3-venv / virtualenv
    if python3 -m venv --help >/dev/null 2>&1; then
        ok "python3-venv available"
    else
        # RHEL/CentOS: python3-venv doesn't exist — virtualenv or python3 itself
        # provides venv depending on the version. Try the right package per PM.
        install_pkg "python3-venv" \
            "python3-venv python3-full" \
            "python3" \
            "python3" \
            "python3" \
            "python" \
            || fail "python3-venv unavailable. Venv creation may fail."
        # Re-check after install attempt
        if ! python3 -m venv --help >/dev/null 2>&1; then
            # On RHEL, venv sometimes needs python3-virtualenv as fallback
            install_pkg "python3-virtualenv (fallback)" \
                "python3-virtualenv" \
                "python3-virtualenv" \
                "virtualenv" \
                "python3-virtualenv" \
                "python-virtualenv" \
                || fail "Could not install venv support."
        fi
    fi

    # cmake
    if command -v cmake >/dev/null 2>&1; then
        ok "cmake: $(cmake --version | head -1)"
    else
        install_pkg "cmake" \
            "cmake" \
            "cmake" \
            "cmake" \
            "cmake" \
            "cmake" \
            || warn "cmake not installed. llama-cpp-python will try a pre-built wheel."
    fi

    # C++ compiler — build-essential doesn't always pull g++ on minimal installs
    if command -v g++ >/dev/null 2>&1 || command -v c++ >/dev/null 2>&1; then
        local CXX_VER
        CXX_VER=$(g++ --version 2>/dev/null | head -1 || c++ --version 2>/dev/null | head -1)
        ok "C++ compiler: $CXX_VER"
    else
        install_pkg "g++ / C++ compiler" \
            "g++ build-essential" \
            "gcc-c++ make" \
            "gcc" \
            "gcc-c++ make" \
            "gcc" \
            || warn "C++ compiler not installed. llama-cpp-python source build will fail."
    fi

    # curl or wget — needed for pip bootstrap and model downloads
    if command -v curl >/dev/null 2>&1; then
        ok "curl available"
    elif command -v wget >/dev/null 2>&1; then
        ok "wget available"
    else
        install_pkg "curl" \
            "curl" \
            "curl" \
            "curl" \
            "curl" \
            "curl" \
            || warn "Neither curl nor wget found. model_pull.sh will not work."
    fi
}

# ── Virtual environment ────────────────────────────────────────────
setup_venv() {
    step "Setting up virtual environment"

    if [ ! -d "$VENV_DIR" ]; then
        if python3 -m venv "$VENV_DIR" 2>/dev/null; then
            ok "Virtualenv created at $VENV_DIR"
        elif command -v virtualenv >/dev/null 2>&1; then
            # RHEL fallback: use virtualenv directly
            virtualenv -p python3 "$VENV_DIR" \
                && ok "Virtualenv created via virtualenv at $VENV_DIR" \
                || die "Failed to create virtualenv. Check python3-venv or virtualenv is installed."
        else
            die "Failed to create virtualenv at $VENV_DIR."
        fi
    else
        ok "Reusing existing virtualenv at $VENV_DIR"
    fi

    PIP="$VENV_DIR/bin/pip"
    PYTHON="$VENV_DIR/bin/python"

    # Repair venv if pip is missing inside it
    if [ ! -f "$PIP" ]; then
        warn "pip is missing from the virtualenv."
        if ask "Bootstrap pip into the virtualenv now?"; then
            echo ""
            bootstrap_pip "$PYTHON" \
                || die "Could not bootstrap pip into the virtualenv. Delete $VENV_DIR and re-run."
        else
            die "pip is required inside the virtualenv. Cannot continue."
        fi
    fi

    # Upgrade pip
    "$PIP" install --upgrade pip --quiet 2>/dev/null \
        && ok "pip upgraded" \
        || warn "pip upgrade failed — continuing with existing version."
}

# ── Python dependencies ────────────────────────────────────────────
install_deps() {
    step "Installing Python dependencies"

    PIP="$VENV_DIR/bin/pip"
    PYTHON="$VENV_DIR/bin/python"

    "$PIP" install --upgrade \
        fastapi \
        "uvicorn[standard]" \
        "jinja2>=3.1.4" \
        "python-multipart>=0.0.9" \
        "httpx>=0.27.0" \
        aiofiles \
        --quiet \
        && ok "FastAPI stack installed" \
        || fail "FastAPI stack installation failed. Check your network connection."

    # llama-cpp-python
    if "$PYTHON" -c "import llama_cpp" 2>/dev/null; then
        ok "llama-cpp-python already installed — skipping"
    else
        echo ""
        echo -e "  Installing llama-cpp-python..."
        echo -e "  ${YELLOW}This may take several minutes if building from source.${RESET}"
        echo ""
        if "$PIP" install llama-cpp-python --quiet 2>/dev/null; then
            ok "llama-cpp-python installed (pre-built wheel)"
        else
            warn "Pre-built wheel unavailable — building from source."
            warn "cmake and g++ are required for this step."
            echo ""
            CMAKE_ARGS="-DLLAMA_BLAS=ON -DLLAMA_BLAS_VENDOR=OpenBLAS" \
                "$PIP" install llama-cpp-python --no-cache-dir \
                && ok "llama-cpp-python built from source" \
                || { fail "llama-cpp-python installation failed."; \
                     warn "Ensure cmake and g++ are installed, then re-run."; }
        fi
    fi

    "$PIP" install sentencepiece --quiet 2>/dev/null \
        && ok "sentencepiece installed" \
        || warn "sentencepiece skipped (optional)"
}

# ── Directory structure ────────────────────────────────────────────
setup_dirs() {
    step "Verifying directory structure"

    mkdir -p "$MODELS_DIR" && ok "server/models/ ready"
    mkdir -p "$SERVER_DIR/sessions" && ok "server/sessions/ ready"
    mkdir -p "$SERVER_DIR/users" && ok "server/users/ ready"

    if [ ! -f "$MODELS_DIR/memory.md" ]; then
        cat > "$MODELS_DIR/memory.md" << 'EOF'
# Local-chat Memory

## FACTS
<!-- Add persistent facts here. This section is never auto-modified. -->

## RECENT SESSIONS
<!-- Auto-managed. Newest entries appear first. Capped at 10 sessions. -->
EOF
        ok "Created server/models/memory.md"
    else
        ok "memory.md already exists"
    fi
}

# ── Model check ────────────────────────────────────────────────────
check_model() {
    step "Checking for model file"

    FOUND=0
    for f in "$MODELS_DIR"/*.gguf "$MODELS_DIR"/*.model; do
        [ -f "$f" ] && FOUND=1 && ok "Model found: $(basename "$f")" && break
    done

    if [ "$FOUND" -eq 0 ]; then
        echo ""
        echo -e "  ${YELLOW}⚠  No model file found in server/models/${RESET}"
        echo ""
        echo "  Run the model acquisition utility:"
        echo "→ bash model_pull.sh or"
        echo "               modmodel_pull.sh"
        echo ""
    fi
}

# ── Finish ─────────────────────────────────────────────────────────
finish() {
    echo ""
    if [ "$SETUP_OK" = true ]; then
        echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════╗${RESET}"
        echo -e "${GREEN}${BOLD}║           Setup complete!  ✓             ║${RESET}"
        echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════╝${RESET}"
        echo ""
        echo "  Virtualenv: $VENV_DIR"
        echo ""
        echo "  Next steps:"
        echo "  1. bash model_pull.sh   — download a model"
        echo "  2. bash run.sh          — start the server"
    else
        echo -e "${YELLOW}${BOLD}╔══════════════════════════════════════════╗${RESET}"
        echo -e "${YELLOW}${BOLD}║      Setup completed with warnings  ⚠    ║${RESET}"
        echo -e "${YELLOW}${BOLD}╚══════════════════════════════════════════╝${RESET}"
        echo ""
        echo "  One or more steps did not complete."
        echo "  Review the warnings above and re-run:  bash setup.sh"
        echo "  Completed steps will be skipped automatically."
    fi
    echo ""
}

# ── Main ───────────────────────────────────────────────────────────
banner
check_prereqs
setup_venv
install_deps
setup_dirs
check_model
finish

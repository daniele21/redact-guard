#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TAURI_DIR="$PROJECT_ROOT/src-tauri"
BINARIES_DIR="$TAURI_DIR/binaries"
RESOURCES_DIR="$TAURI_DIR/resources"

PYTHON_VERSION="3.13.2"
PBS_RELEASE="20250212"
KORGIS_WHEEL="${KORGIS_WHEEL:-}"
KORGIS_WHEEL_SHA256="${KORGIS_WHEEL_SHA256:-}"

detect_platform() {
    local os arch
    case "$(uname -s)" in
        Darwin) os="apple-darwin" ;;
        Linux) os="unknown-linux-gnu" ;;
        MINGW*|MSYS*|CYGWIN*) os="pc-windows-msvc" ;;
        *) echo "❌ Unsupported OS: $(uname -s)"; exit 1 ;;
    esac
    case "$(uname -m)" in
        arm64|aarch64) arch="aarch64" ;;
        x86_64|amd64) arch="x86_64" ;;
        *) echo "❌ Unsupported architecture: $(uname -m)"; exit 1 ;;
    esac
    echo "${arch}-${os}"
}

get_tauri_target() {
    case "$(uname -s)-$(uname -m)" in
        Darwin-arm64) echo "aarch64-apple-darwin" ;;
        Darwin-x86_64) echo "x86_64-apple-darwin" ;;
        Linux-x86_64) echo "x86_64-unknown-linux-gnu" ;;
        Linux-aarch64) echo "aarch64-unknown-linux-gnu" ;;
        MINGW*-x86_64|MSYS*-x86_64) echo "x86_64-pc-windows-msvc" ;;
        *) echo "❌ Unsupported platform"; exit 1 ;;
    esac
}

PLATFORM=$(detect_platform)
TAURI_TARGET=$(get_tauri_target)
PBS_URL="https://github.com/indygreg/python-build-standalone/releases/download/${PBS_RELEASE}/cpython-${PYTHON_VERSION}+${PBS_RELEASE}-${PLATFORM}-install_only_stripped.tar.gz"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  RedactGuard API Sidecar Build"
echo "  Platform: $PLATFORM"
echo "  Python: $PYTHON_VERSION"
if [ -n "$KORGIS_WHEEL" ]; then
    echo "  Korgis: managed runtime from pinned wheel"
else
    echo "  Korgis: external runtime (managed wheel not supplied)"
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

rm -rf "$RESOURCES_DIR/python" "$RESOURCES_DIR/backend" "$RESOURCES_DIR/korgis" "$BINARIES_DIR"
mkdir -p "$RESOURCES_DIR" "$BINARIES_DIR"

PYTHON_ARCHIVE="$RESOURCES_DIR/python-standalone.tar.gz"
curl -L --progress-bar -o "$PYTHON_ARCHIVE" "$PBS_URL"

mkdir -p "$RESOURCES_DIR/python"
tar -xzf "$PYTHON_ARCHIVE" -C "$RESOURCES_DIR/python" --strip-components=1
rm -f "$PYTHON_ARCHIVE"

PYTHON_BIN="$RESOURCES_DIR/python/bin/python3"
if [ ! -f "$PYTHON_BIN" ]; then PYTHON_BIN="$RESOURCES_DIR/python/bin/python3.13"; fi
if [ ! -f "$PYTHON_BIN" ]; then PYTHON_BIN="$RESOURCES_DIR/python/python.exe"; fi

"$PYTHON_BIN" -m venv "$RESOURCES_DIR/python/venv"
if [[ "$PLATFORM" == *"windows"* ]]; then
    VENV_PYTHON="$RESOURCES_DIR/python/venv/Scripts/python.exe"
else
    VENV_PYTHON="$RESOURCES_DIR/python/venv/bin/python"
fi

"$VENV_PYTHON" -m pip install --upgrade pip --quiet
"$VENV_PYTHON" -m pip install --no-cache-dir -r "$PROJECT_ROOT/anonimizer/requirements.txt"

if [ -n "$KORGIS_WHEEL" ]; then
    if [ ! -f "$KORGIS_WHEEL" ]; then
        echo "❌ KORGIS_WHEEL does not exist: $KORGIS_WHEEL"
        exit 1
    fi

    ACTUAL_KORGIS_SHA256="$("$PYTHON_BIN" - "$KORGIS_WHEEL" <<'PY'
import hashlib
import sys
from pathlib import Path

path = Path(sys.argv[1])
digest = hashlib.sha256()
with path.open("rb") as fh:
    for chunk in iter(lambda: fh.read(1024 * 1024), b""):
        digest.update(chunk)
print(digest.hexdigest())
PY
)"

    if [ -n "$KORGIS_WHEEL_SHA256" ] && [ "$ACTUAL_KORGIS_SHA256" != "$KORGIS_WHEEL_SHA256" ]; then
        echo "❌ Korgis wheel checksum mismatch"
        echo "   expected: $KORGIS_WHEEL_SHA256"
        echo "   actual:   $ACTUAL_KORGIS_SHA256"
        exit 1
    fi

    mkdir -p "$RESOURCES_DIR/korgis"
    "$PYTHON_BIN" -m venv "$RESOURCES_DIR/korgis/venv"
    if [[ "$PLATFORM" == *"windows"* ]]; then
        KORGIS_PYTHON="$RESOURCES_DIR/korgis/venv/Scripts/python.exe"
    else
        KORGIS_PYTHON="$RESOURCES_DIR/korgis/venv/bin/python"
    fi

    "$KORGIS_PYTHON" -m pip install --upgrade pip --quiet
    "$KORGIS_PYTHON" -m pip install --no-cache-dir "$KORGIS_WHEEL"

    KORGIS_VERSION="$("$KORGIS_PYTHON" - <<'PY'
from importlib.metadata import version
print(version("local-llm-server"))
PY
)"

    "$PYTHON_BIN" - "$RESOURCES_DIR/korgis/manifest.json" "$KORGIS_VERSION" "$ACTUAL_KORGIS_SHA256" <<'PY'
import json
import sys
from pathlib import Path

target = Path(sys.argv[1])
payload = {
    "package": "local-llm-server",
    "version": sys.argv[2],
    "wheel_sha256": sys.argv[3],
}
target.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
PY
fi

mkdir -p "$RESOURCES_DIR/backend"
cp -r "$PROJECT_ROOT/anonimizer/"* "$RESOURCES_DIR/backend/"
cp "$PROJECT_ROOT/config.json" "$RESOURCES_DIR/backend/"

SIDECAR_NAME="redactguard-server-${TAURI_TARGET}"
SIDECAR_CRATE="$PROJECT_ROOT/sidecar"
cargo build --release --manifest-path "$SIDECAR_CRATE/Cargo.toml"

if [[ "$PLATFORM" == *"windows"* ]]; then
    cp "$SIDECAR_CRATE/target/release/redactguard-server.exe" "$BINARIES_DIR/${SIDECAR_NAME}.exe"
else
    cp "$SIDECAR_CRATE/target/release/redactguard-server" "$BINARIES_DIR/$SIDECAR_NAME"
    chmod +x "$BINARIES_DIR/$SIDECAR_NAME"
fi

if [ -n "$KORGIS_WHEEL" ]; then
    echo "✅ Sidecar build complete with a separate managed Korgis runtime environment."
else
    echo "✅ Sidecar build complete. Korgis remains an external local runtime."
fi

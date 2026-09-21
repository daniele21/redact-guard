#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TAURI_DIR="$PROJECT_ROOT/src-tauri"
BINARIES_DIR="$TAURI_DIR/binaries"
RESOURCES_DIR="$TAURI_DIR/resources"

PYTHON_VERSION="3.13.2"
PBS_RELEASE="20250212"

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
echo "  Korgis: external runtime (not bundled)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

rm -rf "$RESOURCES_DIR/python" "$RESOURCES_DIR/backend" "$BINARIES_DIR"
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

echo "✅ Sidecar build complete. Korgis remains a separately managed local runtime."

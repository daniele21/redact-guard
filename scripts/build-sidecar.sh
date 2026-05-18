#!/bin/bash
# =============================================================================
# RedactGuard — Build script for packaging the Python backend as a sidecar
#
# This script:
# 1. Downloads python-build-standalone for the target platform
# 2. Creates an isolated venv with all dependencies
# 3. Creates a launcher script that acts as the sidecar binary
# 4. Places everything in src-tauri/binaries/ for Tauri bundling
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TAURI_DIR="$PROJECT_ROOT/src-tauri"
BINARIES_DIR="$TAURI_DIR/binaries"
RESOURCES_DIR="$TAURI_DIR/resources"

# Python build standalone version
PYTHON_VERSION="3.13.2"
PBS_RELEASE="20250212"

# Detect platform
detect_platform() {
    local os arch
    case "$(uname -s)" in
        Darwin) os="apple-darwin" ;;
        Linux)  os="unknown-linux-gnu" ;;
        MINGW*|MSYS*|CYGWIN*) os="pc-windows-msvc" ;;
        *) echo "❌ Unsupported OS: $(uname -s)"; exit 1 ;;
    esac

    case "$(uname -m)" in
        arm64|aarch64) arch="aarch64" ;;
        x86_64|amd64)  arch="x86_64" ;;
        *) echo "❌ Unsupported architecture: $(uname -m)"; exit 1 ;;
    esac

    echo "${arch}-${os}"
}

# Get Tauri target triple (used for sidecar naming)
get_tauri_target() {
    case "$(uname -s)-$(uname -m)" in
        Darwin-arm64)    echo "aarch64-apple-darwin" ;;
        Darwin-x86_64)   echo "x86_64-apple-darwin" ;;
        Linux-x86_64)    echo "x86_64-unknown-linux-gnu" ;;
        Linux-aarch64)   echo "aarch64-unknown-linux-gnu" ;;
        MINGW*-x86_64|MSYS*-x86_64) echo "x86_64-pc-windows-msvc" ;;
        *) echo "❌ Unsupported platform"; exit 1 ;;
    esac
}

PLATFORM=$(detect_platform)
TAURI_TARGET=$(get_tauri_target)
PBS_URL="https://github.com/indygreg/python-build-standalone/releases/download/${PBS_RELEASE}/cpython-${PYTHON_VERSION}+${PBS_RELEASE}-${PLATFORM}-install_only_stripped.tar.gz"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  RedactGuard Sidecar Build"
echo "  Platform: $PLATFORM"
echo "  Python: $PYTHON_VERSION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Clean previous builds
rm -rf "$RESOURCES_DIR/python" "$RESOURCES_DIR/backend" "$BINARIES_DIR"
mkdir -p "$RESOURCES_DIR" "$BINARIES_DIR"

# Step 1: Download Python standalone
PYTHON_ARCHIVE="$RESOURCES_DIR/python-standalone.tar.gz"
if [ ! -f "$PYTHON_ARCHIVE" ]; then
    echo ""
    echo "📥 Downloading Python $PYTHON_VERSION standalone..."
    echo "   URL: $PBS_URL"
    curl -L --progress-bar -o "$PYTHON_ARCHIVE" "$PBS_URL"
else
    echo "✅ Python archive already downloaded"
fi

# Step 2: Extract Python
echo ""
echo "📦 Extracting Python..."
mkdir -p "$RESOURCES_DIR/python"
tar -xzf "$PYTHON_ARCHIVE" -C "$RESOURCES_DIR/python" --strip-components=1
rm -f "$PYTHON_ARCHIVE"

PYTHON_BIN="$RESOURCES_DIR/python/bin/python3"
if [ ! -f "$PYTHON_BIN" ]; then
    PYTHON_BIN="$RESOURCES_DIR/python/bin/python3.13"
fi
echo "   Python binary: $PYTHON_BIN"
"$PYTHON_BIN" --version

# Step 3: Create venv
echo ""
echo "🔧 Creating isolated virtual environment..."
"$PYTHON_BIN" -m venv "$RESOURCES_DIR/python/venv"
VENV_PIP="$RESOURCES_DIR/python/venv/bin/pip"
VENV_PYTHON="$RESOURCES_DIR/python/venv/bin/python"

"$VENV_PIP" install --upgrade pip --quiet

# Step 4: Install dependencies
echo ""
echo "📦 Installing Python dependencies..."

# Install llama-cpp-python with Metal support on macOS
if [[ "$PLATFORM" == *"apple-darwin"* ]]; then
    echo "   🍎 Building llama-cpp-python with Metal acceleration..."
    CMAKE_ARGS="-DGGML_METAL=on" "$VENV_PIP" install --no-cache-dir llama-cpp-python
else
    "$VENV_PIP" install --no-cache-dir llama-cpp-python
fi

"$VENV_PIP" install --no-cache-dir -r "$PROJECT_ROOT/anonimizer/requirements.txt"

# Step 5: Copy backend code
echo ""
echo "📋 Copying backend source..."
mkdir -p "$RESOURCES_DIR/backend"
cp -r "$PROJECT_ROOT/anonimizer/"* "$RESOURCES_DIR/backend/"
cp "$PROJECT_ROOT/config.json" "$RESOURCES_DIR/backend/"

# Step 6: Create the sidecar launcher script
echo ""
echo "🚀 Creating sidecar launcher..."

SIDECAR_NAME="redactguard-server-${TAURI_TARGET}"

cat > "$BINARIES_DIR/$SIDECAR_NAME" << 'LAUNCHER_EOF'
#!/bin/bash
# RedactGuard Sidecar Launcher
# This script is called by Tauri to start backend services.

set -euo pipefail

# Resolve paths relative to the app bundle
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS: binary is in .app/Contents/MacOS/, resources in .app/Contents/Resources/
    SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
    RESOURCES_DIR="$(cd "$SCRIPT_DIR/../Resources" 2>/dev/null && pwd || echo "$SCRIPT_DIR/../resources")"
else
    SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
    RESOURCES_DIR="$SCRIPT_DIR/../resources"
fi

PYTHON_VENV="$RESOURCES_DIR/python/venv"
PYTHON_BIN="$PYTHON_VENV/bin/python"
BACKEND_DIR="$RESOURCES_DIR/backend"

# Fallback for development
if [ ! -d "$PYTHON_VENV" ]; then
    PYTHON_BIN="$(dirname "$0")/../../.venv/bin/python"
    BACKEND_DIR="$(dirname "$0")/../../anonimizer"
fi

export PYTHONPATH="$BACKEND_DIR"

COMMAND="${1:-api}"
shift || true

case "$COMMAND" in
    api)
        PORT="${2:-8000}"
        exec "$PYTHON_BIN" -m uvicorn main:app \
            --host 127.0.0.1 \
            --port "$PORT" \
            --app-dir "$BACKEND_DIR" \
            "$@"
        ;;
    llm)
        PORT="${2:-1235}"
        exec "$PYTHON_BIN" "$BACKEND_DIR/llama_cpp_server.py" \
            --port "$PORT" \
            "$@"
        ;;
    *)
        echo "Usage: $0 {api|llm} [--port PORT]"
        exit 1
        ;;
esac
LAUNCHER_EOF

chmod +x "$BINARIES_DIR/$SIDECAR_NAME"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ Sidecar build complete!"
echo ""
echo "  Sidecar:   $BINARIES_DIR/$SIDECAR_NAME"
echo "  Python:    $RESOURCES_DIR/python/"
echo "  Backend:   $RESOURCES_DIR/backend/"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

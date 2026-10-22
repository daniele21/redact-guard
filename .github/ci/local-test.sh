#!/usr/bin/env bash
# Bounded, source-owned validation for the trusted shared Apple Silicon Mac lane.
# This is NOT package/inference/UX E2E or a replacement for Validate PR.
set -euo pipefail

if [[ "$(uname -s)" != Darwin || "$(uname -m)" != arm64 ]]; then
  echo "Shared Mac CI requires macOS ARM64." >&2
  exit 1
fi

for tool in python3 node cargo; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "Missing required Mac CI tool: $tool" >&2
    exit 1
  fi
done
if ! cargo fmt --version >/dev/null 2>&1; then
  echo "Missing required rustfmt component." >&2
  exit 1
fi

python3 - <<'PY'
import sys
if sys.version_info < (3, 10):
    raise SystemExit("Python >=3.10 is required for local Mac CI")
PY
node -e 'if (Number(process.versions.node.split(".")[0]) < 22) process.exit(1)'

# Pure, fast source-contract checks first; no global installs or model downloads.
bash -n scripts/build-sidecar.sh scripts/build-signed-macos.sh
python3 -m unittest discover -s scripts -p 'test_signed_macos_build.py'
cargo fmt --check --manifest-path sidecar/Cargo.toml
cargo fmt --check --manifest-path src-tauri/Cargo.toml
node --experimental-strip-types --test \
  src/components/review/reviewGate.test.mjs \
  src/components/review/reviewVisits.test.mjs \
  src/hooks/documentQueue.test.mjs \
  src/services/backendAddress.test.mjs

# Install only lightweight backend test dependencies in a disposable venv.
# Do not mutate user/runner Python, create persistent caches or print PII.
ci_dir="$(mktemp -d "${TMPDIR:-/tmp}/redactguard-ci.XXXXXXXX")"
trap 'rm -rf -- "$ci_dir"' EXIT
python3 -m venv "$ci_dir/venv"
PIP_DISABLE_PIP_VERSION_CHECK=1 PIP_DEFAULT_TIMEOUT=15 \
  "$ci_dir/venv/bin/python" -m pip install --quiet --retries 1 \
  'pydantic>=2.7' 'diskcache>=5.6.3' 'pyyaml>=6.0.1' 'fastapi>=0.111'
"$ci_dir/venv/bin/python" -m compileall -q anonimizer
"$ci_dir/venv/bin/python" -m unittest discover -s anonimizer/tests -p 'test_*.py'
"$ci_dir/venv/bin/python" scripts/verify-managed-packaging.py

echo "Shared Mac source-owned validation passed; not proof of native UI or model inference."

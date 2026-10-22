#!/usr/bin/env bash
# Signed local Apple Silicon build using the exact pinned Korgis wheel.
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PIN_FILE="${REDACTGUARD_SIGNING_IDENTITY_FILE:-$HOME/Library/Application Support/RedactGuard/build-signing-identity}"
IDENTITY_ARG="${REDACTGUARD_SIGNING_IDENTITY:-}"
CHECK_ONLY=0

usage() {
  cat <<'HELP'
Usage: pnpm macos:build-local --identity <CERTIFICATE_SHA1>    # initial build
       pnpm macos:build-local                                 # subsequent builds
       pnpm macos:build-local --check-signing                 # keychain preflight
Select an existing signing identity using: security find-identity -v -p codesigning
The public identity fingerprint is stored in user-specific Application Support.
Korgis is built from the exact .engineering/korgis-runtime.json commit.
HELP
}
while [[ $# -gt 0 ]]; do
  case "$1" in
    --identity)
      [[ $# -ge 2 ]] || { echo "Missing --identity value" >&2; exit 2; }
      IDENTITY_ARG="$2"; shift 2 ;;
    --check-signing) CHECK_ONLY=1; shift ;;
    --help|-h) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done
for cmd in security awk tr; do
  command -v "$cmd" >/dev/null || { echo "Missing tool: $cmd" >&2; exit 1; }
done
if [[ -f "$PIN_FILE" ]]; then
  pinned="$(cat "$PIN_FILE" | tr '[:lower:]' '[:upper:]')"
  if [[ -n "$IDENTITY_ARG" && "$(printf '%s' "$IDENTITY_ARG" | tr '[:lower:]' '[:upper:]')" != "$pinned" ]]; then
    echo "Refusing to change pinned signing identity $pinned." >&2; exit 1
  fi
  identity="$pinned"
else
  [[ -n "$IDENTITY_ARG" ]] || {
    echo "Select an existing Keychain identity ONCE with --identity SHA1." >&2
    security find-identity -v -p codesigning >&2
    exit 1
  }
  identity="$(printf '%s' "$IDENTITY_ARG" | tr '[:lower:]' '[:upper:]')"
fi
if [[ ! "$identity" =~ ^[0-9A-F]{40}$ ]]; then
  echo "Must provide a real 40-character certificate fingerprint, never '-'." >&2
  exit 1
fi
if ! security find-identity -v -p codesigning |
  awk -v expected="$identity" '{ if (toupper($2) == expected) found=1 } END {exit !found}'; then
  echo "The pinned certificate is not a valid, available Keychain signing identity." >&2
  exit 1
fi
if [[ ! -f "$PIN_FILE" ]]; then
  mkdir -p "$(dirname "$PIN_FILE")"
  temporary="$(mktemp "$PIN_FILE.XXXXXXXX")"
  printf '%s\n' "$identity" > "$temporary"
  chmod 600 "$temporary"
  mv "$temporary" "$PIN_FILE"
fi
echo "Persistent Keychain identity: $identity"
if [[ "$CHECK_ONLY" == 1 ]]; then
  echo "Signing preflight OK (no build started)."; exit 0
fi

[[ "$(uname -s)" == Darwin && "$(uname -m)" == arm64 ]] || {
  echo "This managed signed build requires Apple Silicon macOS." >&2; exit 1;
}
for cmd in python3.13 pnpm git cargo codesign shasum; do
  command -v "$cmd" >/dev/null || { echo "Missing tool: $cmd" >&2; exit 1; }
done
cd "$ROOT"
source_sha="$(git rev-parse HEAD)"
if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  echo "WARNING: tracked worktree modifications; build is not exact HEAD." >&2
fi
korgis_repo="$(python3.13 -c 'import json; print(json.load(open(".engineering/korgis-runtime.json"))["repository"])')"
korgis_sha="$(python3.13 -c 'import json; print(json.load(open(".engineering/korgis-runtime.json"))["commit"])')"
[[ "$korgis_repo" == daniele21/korgis && "$korgis_sha" =~ ^[0-9a-f]{40}$ ]] || {
  echo "Invalid canonical Korgis pin." >&2; exit 1;
}

workdir="$(mktemp -d "${TMPDIR:-/tmp}/redactguard-signed.XXXXXXXX")"
trap 'rm -rf -- "$workdir"' EXIT
korgis_source="${REDACTGUARD_KORGIS_SOURCE:-https://github.com/daniele21/korgis.git}"
echo "Preparing Korgis source $korgis_sha"
# Create a clean commit snapshot: never build an arbitrary Korgis local branch.
git clone --quiet --filter=blob:none --no-checkout "$korgis_source" "$workdir/korgis"
git -C "$workdir/korgis" checkout --quiet --detach "$korgis_sha"
[[ "$(git -C "$workdir/korgis" rev-parse HEAD)" == "$korgis_sha" ]] || exit 1

python3.13 -m venv "$workdir/build-venv"
"$workdir/build-venv/bin/python" -m pip install 'build==1.2.2.post1'
mkdir -p "$workdir/wheels"
"$workdir/build-venv/bin/python" -m build --wheel --outdir "$workdir/wheels" "$workdir/korgis"
wheels=("$workdir/wheels/"*.whl)
[[ "${#wheels[@]}" == 1 && -f "${wheels[0]}" ]] || {
  echo "Expected exactly one pinned Korgis wheel." >&2; exit 1;
}
wheel="${wheels[0]}"
python3.13 scripts/verify-korgis-wheel.py "$wheel" --expected-commit "$korgis_sha"
export KORGIS_WHEEL="$wheel"
export KORGIS_WHEEL_SHA256="$(shasum -a 256 "$wheel" | awk '{print $1}')"
export KORGIS_SOURCE_COMMIT="$korgis_sha"
export REDACTGUARD_BUILD_TARGET=aarch64-apple-darwin
pnpm install --frozen-lockfile
pnpm tauri:build-sidecar

# Local development builds are not notarized or automatically distributed.
unset APPLE_ID APPLE_PASSWORD APPLE_TEAM_ID APPLE_API_KEY APPLE_API_KEY_PATH APPLE_API_ISSUER
export APPLE_SIGNING_IDENTITY="$identity"
pnpm tauri build --bundles app --target aarch64-apple-darwin

app="$ROOT/src-tauri/target/aarch64-apple-darwin/release/bundle/macos/RedactGuard.app"
[[ -d "$app" ]] || { echo "Missing RedactGuard.app." >&2; exit 1; }
manifest="$(find "$app/Contents" -type f -path '*/korgis/manifest.json' -print -quit)"
[[ -n "$manifest" ]] || { echo "Managed Korgis is missing from the signed app." >&2; exit 1; }
python3.13 - "$manifest" "$korgis_sha" <<'PY'
import json, sys
from pathlib import Path
manifest = json.loads(Path(sys.argv[1]).read_text())
assert manifest["source_commit"] == sys.argv[2], "bundled Korgis SHA mismatch"
assert len(manifest["wheel_sha256"]) == 64, "missing wheel digest"
PY

codesign --verify --deep --strict --verbose=2 "$app"
cert_prefix="$workdir/codesign-cert"
codesign --display --extract-certificates "$cert_prefix" "$app" >/dev/null 2>&1
[[ -f "$cert_prefix"0 ]] || { echo "No embedded signing certificate." >&2; exit 1; }
actual_signer="$(shasum -a 1 "$cert_prefix"0 | awk '{print toupper($1)}')"
[[ "$actual_signer" == "$identity" ]] || {
  echo "Signed app certificate is NOT the persistent pinned Keychain identity." >&2; exit 1;
}
echo "RedactGuard managed app built, signed and verified."
echo "RedactGuard revision: $source_sha | Korgis revision: $korgis_sha"
echo "Open: open \"$app\""
echo "This is local signing, not notarization or real-model E2E proof."

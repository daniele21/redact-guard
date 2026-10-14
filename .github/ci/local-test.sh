#!/usr/bin/env bash
# Initial Python validation lane; does not replace frontend, Rust or OS matrix CI.
set -euo pipefail

python3 - <<'PY'
import sys
if sys.version_info < (3, 10):
    raise SystemExit("Python >=3.10 is required for local Mac CI")
PY

ci_dir="$(mktemp -d /tmp/redact-guard-ci.XXXXXXXX)"
trap 'rm -rf -- "$ci_dir"' EXIT
python3 -m venv "$ci_dir/venv"
"$ci_dir/venv/bin/python" -m pip install --disable-pip-version-check --quiet \
  'pydantic>=2.7' 'diskcache>=5.6.3' 'pyyaml>=6.0.1' 'fastapi>=0.111'
"$ci_dir/venv/bin/python" -m compileall -q anonimizer
"$ci_dir/venv/bin/python" -m unittest discover -s anonimizer/tests -p 'test_*.py'

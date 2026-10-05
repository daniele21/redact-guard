#!/usr/bin/env python3
"""Verify the minimum Korgis wheel contract required by managed RedactGuard."""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path


EXPECTED_EVIDENCE_VERSION = "korgis-request-evidence-v1"


def _venv_python(root: Path) -> Path:
    if sys.platform == "win32":
        return root / "Scripts" / "python.exe"
    return root / "bin" / "python"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("wheel", type=Path)
    parser.add_argument("--expected-commit", default=None)
    args = parser.parse_args()

    wheel = args.wheel.expanduser().resolve()
    if not wheel.is_file() or wheel.suffix != ".whl":
        raise SystemExit(f"Korgis wheel not found: {wheel}")

    with tempfile.TemporaryDirectory(prefix="redactguard-korgis-wheel-") as tmp:
        venv = Path(tmp) / "venv"
        subprocess.run([sys.executable, "-m", "venv", str(venv)], check=True)
        python = _venv_python(venv)
        subprocess.run(
            [str(python), "-m", "pip", "install", "--no-deps", str(wheel)],
            check=True,
        )

        probe = r"""
import json
from importlib.metadata import version
from local_llm_server.resource_telemetry import REQUEST_EVIDENCE_VERSION

print(json.dumps({
    "package_version": version("local-llm-server"),
    "request_evidence_version": REQUEST_EVIDENCE_VERSION,
}))
"""
        completed = subprocess.run(
            [str(python), "-c", probe],
            check=True,
            capture_output=True,
            text=True,
        )
        payload = json.loads(completed.stdout.strip())

    if payload.get("request_evidence_version") != EXPECTED_EVIDENCE_VERSION:
        raise SystemExit(
            "Korgis wheel does not expose the required request evidence protocol: "
            f"{payload!r}"
        )

    result = {
        "wheel": wheel.name,
        "package_version": payload.get("package_version"),
        "request_evidence_version": payload.get("request_evidence_version"),
        "expected_commit": args.expected_commit,
        "status": "compatible",
    }
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Fail when managed Korgis packaging drifts across canonical owners."""
from __future__ import annotations

import json
import re
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
PIN = ROOT / ".engineering" / "korgis-runtime.json"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(message)


def main() -> int:
    payload = json.loads(PIN.read_text(encoding="utf-8"))
    require(payload.get("repository") == "daniele21/korgis", "unexpected Korgis repository")
    commit = str(payload.get("commit") or "")
    require(bool(re.fullmatch(r"[0-9a-f]{40}", commit)), "Korgis commit must be a full SHA")
    require(
        payload.get("identity_protocol") == "local-llm-identity-v1",
        "unexpected Korgis identity protocol",
    )
    require(
        payload.get("request_evidence_protocol") == "korgis-request-evidence-v1",
        "unexpected Korgis request evidence protocol",
    )
    require(
        payload.get("packaging_mode") == "separate-wheel-venv",
        "managed packaging must preserve the Korgis process/environment boundary",
    )

    validate_path = ROOT / ".github" / "workflows" / "validate.yml"
    build_path = ROOT / ".github" / "workflows" / "build.yml"
    validate = validate_path.read_text(encoding="utf-8")
    build = build_path.read_text(encoding="utf-8")
    for path, content in ((validate_path, validate), (build_path, build)):
        parsed = yaml.safe_load(content)
        require(isinstance(parsed, dict), f"{path.name} must parse as a YAML mapping")
        require("jobs" in parsed, f"{path.name} must define jobs")
    packaging = (ROOT / "scripts" / "build-sidecar.sh").read_text(encoding="utf-8")
    tauri = (ROOT / "src-tauri" / "src" / "sidecar.rs").read_text(encoding="utf-8")

    for name, workflow in (("validate", validate), ("build", build)):
        require(
            ".engineering/korgis-runtime.json" in workflow,
            f"{name} workflow must read the canonical Korgis pin",
        )

    for token in (
        "KORGIS_WHEEL",
        "KORGIS_WHEEL_SHA256",
        "KORGIS_SOURCE_COMMIT",
    ):
        require(token in build, f"release workflow does not export {token}")
        require(token in packaging, f"packaging script does not consume {token}")

    require(
        '"source_commit": sys.argv[4] or None' in packaging,
        "managed Korgis bundle manifest must retain the source commit",
    )
    require(
        "REDACTGUARD_BUILD_TARGET" in build,
        "release workflow must pass the requested Tauri target to sidecar packaging",
    )
    require(
        "REDACTGUARD_BUILD_TARGET" in packaging
        and 'TAURI_TARGET=$(get_tauri_target)' in packaging
        and 'does not match requested bundle target' in packaging,
        "sidecar packaging must fail when the build host target differs from the requested bundle target",
    )
    require(
        'if cfg!(debug_assertions)' in tauri
        and '"external"' in tauri
        and '"managed"' in tauri,
        "Tauri must keep an explicit development/release runtime-mode default",
    )
    require(
        '.sidecar("redactguard-server")' in tauri
        and '.args(["korgis"' in tauri,
        "managed Korgis must remain a separate sidecar process",
    )
    require(
        '--enable-admin-api' in tauri,
        "managed Korgis must expose the loopback-only lifecycle API to RedactGuard",
    )

    print(
        json.dumps(
            {
                "korgis_commit": commit,
                "request_evidence_protocol": payload["request_evidence_protocol"],
                "packaging_mode": payload["packaging_mode"],
                "status": "ok",
            },
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

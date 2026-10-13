#!/usr/bin/env python3
"""Deterministic native smoke for the API sidecar inside a packaged macOS .app.

This validates actual bundled Python/backend paths and local API startup without
claiming model inference, user-visible Tauri functionality, or physical-Mac UX.
It never downloads a model or exposes a network listener beyond loopback.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import tempfile
import time
from urllib.error import HTTPError, URLError
from urllib.request import urlopen


def free_port() -> int:
    with socket.socket() as bound:
        bound.bind(("127.0.0.1", 0))
        return int(bound.getsockname()[1])


def get_json(url: str) -> dict:
    with urlopen(url, timeout=4) as result:
        if result.status != 200:
            raise RuntimeError("Unexpected HTTP status.")
        body = json.load(result)
        if not isinstance(body, dict):
            raise RuntimeError("Local endpoint returned invalid JSON.")
        return body


def classify_startup_failure(logfile: Path) -> str:
    """Return a fixed diagnostic label; never expose local paths or log contents."""
    try:
        tail = logfile.read_bytes()[-16000:].decode("utf-8", errors="replace")
    except OSError:
        return "startup_failed_no_logs"
    if "Cannot locate RedactGuard Python environment or backend" in tail:
        return "packaged_resource_path_missing"
    if "ModuleNotFoundError" in tail:
        return "python_module_unavailable"
    if "ImportError" in tail:
        return "python_import_failure"
    if "Permission denied" in tail:
        return "packaged_executable_not_permitted"
    if "Address already in use" in tail:
        return "loopback_port_conflict"
    if "Traceback (most recent call last)" in tail:
        return "python_exception"
    return "packaged_sidecar_exited"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--app", required=True, type=Path)
    parser.add_argument("--timeout", type=float, default=120.0)
    args = parser.parse_args()

    if os.uname().sysname != "Darwin":
        parser.error("This smoke requires macOS.")
    binaries = list((args.app / "Contents" / "MacOS").glob("redactguard-server*"))
    if len(binaries) != 1 or not binaries[0].is_file():
        raise SystemExit("Packaged RedactGuard API launcher missing or ambiguous.")

    with tempfile.TemporaryDirectory(prefix="redactguard-packaged-smoke-") as temp:
        root = Path(temp)
        api_port = free_port()
        absent_runtime_port = free_port()
        while absent_runtime_port == api_port:
            absent_runtime_port = free_port()
        env = dict(os.environ)
        env.update({
            "KORGIS_MODE": "external",
            "KORGIS_MODEL": "synthetic-model",
            "KORGIS_BASE_URL": f"http://127.0.0.1:{absent_runtime_port}/v1",
            "REDACTGUARD_MODEL_PREFERENCE_FILE": str(root / "model-selection.json"),
            "REDACTGUARD_POLICY_VARIANTS_FILE": str(root / "pii-variants.json"),
            "XDG_CACHE_HOME": str(root / "cache"),
        })
        logfile = root / "api.log"
        with logfile.open("wb") as output:
            process = subprocess.Popen(
                [str(binaries[0]), "api", "--port", str(api_port)],
                env=env,
                stdout=output,
                stderr=subprocess.STDOUT,
                start_new_session=True,
            )
            deadline = time.monotonic() + args.timeout
            base = f"http://127.0.0.1:{api_port}/api"
            health = None
            try:
                while time.monotonic() < deadline:
                    if process.poll() is not None:
                        raise RuntimeError(
                            "Packaged backend exited: " + classify_startup_failure(logfile)
                        )
                    try:
                        health = get_json(base + "/health")
                        break
                    except (OSError, ValueError, RuntimeError, URLError, HTTPError):
                        time.sleep(0.5)
                if health is None:
                    raise RuntimeError("Packaged backend did not become ready.")

                # The absent external model must not turn into an invented online state.
                if health.get("llm_status") == "online":
                    raise RuntimeError("Unreachable runtime incorrectly reported as ready.")
                policy = get_json(base + "/profiles/general/policy")
                if policy.get("profile") != "general" or not policy.get("effective_types"):
                    raise RuntimeError("Bundled PII definitions were not available.")
                catalog = get_json(base + "/local-models")
                if catalog.get("discovery_available") is not False:
                    raise RuntimeError("Unreachable Korgis was not reported accurately.")
                if catalog.get("selected_model") != "synthetic-model":
                    raise RuntimeError("Packaged model configuration was not propagated.")
                print(json.dumps({
                    "status": "PASS", "scope": "packaged macOS API sidecar",
                    "runtime": "external_unavailable_intentional",
                    "pii_catalog": "loaded",
                    "model_preference": "retained",
                }, sort_keys=True))
            except Exception as exc:
                # Sanitized diagnostic: do not publish model, PII, paths or raw logs.
                print(f"Packaged sidecar smoke failed: {type(exc).__name__}")
                raise
            finally:
                if process.poll() is None:
                    os.killpg(process.pid, signal.SIGINT)
                    try:
                        process.wait(timeout=15)
                    except subprocess.TimeoutExpired:
                        os.killpg(process.pid, signal.SIGKILL)
                        process.wait(timeout=5)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

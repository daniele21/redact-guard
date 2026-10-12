#!/usr/bin/env python3
"""Representative macOS E2E for the packaged managed Korgis boundary.

The runner launches the packaged sidecar binary exactly as the desktop bundle
ships it, starts packaged Korgis and the packaged RedactGuard API on loopback,
analyzes a generated synthetic PDF, and retains only privacy-safe evidence.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import platform
import re
import signal
import socket
import subprocess
import time
from typing import Any, Mapping, Sequence
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
import uuid

_FULL_SHA = re.compile(r"^[0-9a-f]{40}$")
_EXPECTED_MEMORY_SOURCE = "ps_process_tree_rss_excluding_sampler"
_EXPECTED_CPU_SOURCE = "ps_process_tree_cpu_time_delta_excluding_sampler"


class E2EError(RuntimeError):
    """Bounded failure with no raw document or private path in the message."""


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def _request_json(
    url: str,
    *,
    method: str = "GET",
    data: bytes | None = None,
    content_type: str | None = None,
    timeout: float = 600.0,
) -> tuple[int, Mapping[str, Any]]:
    headers = {}
    if content_type:
        headers["Content-Type"] = content_type
    request = Request(
        url,
        data=data,
        headers=headers,
        method=method,
    )
    try:
        with urlopen(request, timeout=timeout) as response:  # noqa: S310 - loopback only
            status = int(getattr(response, "status", 200))
            raw = response.read()
    except HTTPError as exc:
        status = int(exc.code)
        raw = exc.read()
    except (URLError, TimeoutError, OSError) as exc:
        raise E2EError(
            f"loopback request failed: {type(exc).__name__}"
        ) from exc
    try:
        payload = json.loads(raw.decode("utf-8")) if raw else {}
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise E2EError(
            f"loopback response was not JSON (status {status})"
        ) from exc
    if not isinstance(payload, Mapping):
        raise E2EError(
            f"loopback response was not an object (status {status})"
        )
    return status, payload


def _wait_json(
    url: str,
    *,
    timeout: float,
) -> Mapping[str, Any]:
    deadline = time.monotonic() + timeout
    last_status = None
    while time.monotonic() < deadline:
        try:
            status, payload = _request_json(url, timeout=3)
            last_status = status
            if status == 200:
                return payload
        except E2EError:
            pass
        time.sleep(0.5)
    raise E2EError(
        f"health endpoint did not become ready (last status {last_status})"
    )


def _find_launcher(app_bundle: Path) -> Path:
    macos = app_bundle.expanduser().resolve() / "Contents" / "MacOS"
    if not macos.is_dir():
        raise E2EError("app bundle has no Contents/MacOS directory")
    candidates = sorted(
        path
        for path in macos.glob("redactguard-server*")
        if path.is_file()
    )
    if len(candidates) != 1:
        raise E2EError(
            "packaged RedactGuard sidecar launcher is missing or ambiguous"
        )
    return candidates[0]


def _find_manifest(app_bundle: Path) -> Path:
    contents = app_bundle.expanduser().resolve() / "Contents"
    candidates = sorted(
        contents.glob("**/korgis/manifest.json")
    )
    if len(candidates) != 1:
        raise E2EError(
            "packaged Korgis manifest is missing or ambiguous"
        )
    return candidates[0]


def _read_manifest(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(
            path.read_text(encoding="utf-8")
        )
    except (OSError, json.JSONDecodeError) as exc:
        raise E2EError(
            "packaged Korgis manifest is unreadable"
        ) from exc
    if not isinstance(payload, dict):
        raise E2EError(
            "packaged Korgis manifest must be an object"
        )
    return {
        "package": payload.get("package"),
        "version": payload.get("version"),
        "wheel_sha256": payload.get("wheel_sha256"),
        "source_commit": payload.get("source_commit"),
    }


def _start_process(
    command: Sequence[str],
    *,
    env: Mapping[str, str] | None,
    log_path: Path,
) -> tuple[subprocess.Popen[bytes], Any]:
    log_path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )
    handle = log_path.open("wb")
    process = subprocess.Popen(
        list(command),
        env=dict(env) if env is not None else None,
        stdout=handle,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    return process, handle


def _stop_process(
    process: subprocess.Popen[bytes] | None,
) -> dict[str, Any]:
    if process is None:
        return {
            "started": False,
            "graceful": True,
            "hard_kill_required": False,
        }
    hard_kill = False
    graceful = True
    if process.poll() is None:
        try:
            os.killpg(process.pid, signal.SIGINT)
            process.wait(timeout=20)
        except subprocess.TimeoutExpired:
            graceful = False
            try:
                os.killpg(process.pid, signal.SIGTERM)
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                hard_kill = True
                os.killpg(process.pid, signal.SIGKILL)
                process.wait(timeout=5)
        except ProcessLookupError:
            pass
    return {
        "started": True,
        "exit_code": process.returncode,
        "graceful": graceful,
        "hard_kill_required": hard_kill,
    }


def _synthetic_pdf_bytes() -> bytes:
    text = (
        "Synthetic test document. Name: Mario Rossi. "
        "Email: mario.rossi@example.test."
    )
    stream = (
        f"BT /F1 12 Tf 72 720 Td ({text}) Tj ET"
    ).encode("ascii")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        (
            b"<< /Type /Page /Parent 2 0 R "
            b"/MediaBox [0 0 612 792] "
            b"/Resources << /Font << /F1 5 0 R >> >> "
            b"/Contents 4 0 R >>"
        ),
        (
            b"<< /Length "
            + str(len(stream)).encode("ascii")
            + b" >>\nstream\n"
            + stream
            + b"\nendstream"
        ),
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    body = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for index, obj in enumerate(objects, start=1):
        offsets.append(len(body))
        body.extend(
            f"{index} 0 obj\n".encode("ascii")
        )
        body.extend(obj)
        body.extend(b"\nendobj\n")
    xref = len(body)
    body.extend(
        f"xref\n0 {len(objects) + 1}\n".encode("ascii")
    )
    body.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        body.extend(
            f"{offset:010d} 00000 n \n".encode("ascii")
        )
    body.extend(
        (
            f"trailer\n<< /Size {len(objects) + 1} "
            f"/Root 1 0 R >>\n"
            f"startxref\n{xref}\n%%EOF\n"
        ).encode("ascii")
    )
    return bytes(body)


def _multipart_upload(
    pdf: bytes,
) -> tuple[bytes, str]:
    boundary = (
        f"----redactguard-e2e-{uuid.uuid4().hex}"
    )
    chunks = [
        f"--{boundary}\r\n".encode(),
        (
            b'Content-Disposition: form-data; '
            b'name="profile"\r\n\r\n'
        ),
        b"general\r\n",
        f"--{boundary}\r\n".encode(),
        (
            b'Content-Disposition: form-data; '
            b'name="file"; filename="synthetic.pdf"\r\n'
        ),
        b"Content-Type: application/pdf\r\n\r\n",
        pdf,
        b"\r\n",
        f"--{boundary}--\r\n".encode(),
    ]
    return (
        b"".join(chunks),
        f"multipart/form-data; boundary={boundary}",
    )


def _mac_hardware_profile() -> dict[str, Any]:
    return {
        "system": platform.system(),
        "machine": platform.machine(),
        "macos_version": platform.mac_ver()[0] or None,
    }


def validate_summary(
    summary: Mapping[str, Any],
) -> list[str]:
    errors: list[str] = []
    hardware = summary.get("hardware")
    hardware = (
        hardware
        if isinstance(hardware, Mapping)
        else {}
    )
    if hardware.get("system") != "Darwin":
        errors.append(
            "representative_device_is_not_macos"
        )
    if not _FULL_SHA.fullmatch(
        str(
            summary.get(
                "redactguard_source_commit"
            )
            or ""
        )
    ):
        errors.append(
            "invalid_redactguard_source_commit"
        )
    expected = summary.get(
        "expected_korgis_commit"
    )
    manifest = summary.get(
        "package_manifest"
    )
    manifest = (
        manifest
        if isinstance(manifest, Mapping)
        else {}
    )
    if manifest.get("source_commit") != expected:
        errors.append(
            "packaged_korgis_commit_mismatch"
        )
    wheel_sha = str(
        manifest.get("wheel_sha256")
        or ""
    )
    if not re.fullmatch(
        r"[0-9a-f]{64}",
        wheel_sha,
    ):
        errors.append(
            "invalid_packaged_korgis_wheel_sha256"
        )

    health = summary.get("health")
    health = (
        health
        if isinstance(health, Mapping)
        else {}
    )
    if health.get("llm_status") != "online":
        errors.append(
            "redactguard_health_not_online"
        )
    if health.get("korgis_mode") != "managed":
        errors.append(
            "redactguard_not_in_managed_mode"
        )
    if (
        health.get(
            "korgis_request_evidence_supported"
        )
        is not True
    ):
        errors.append(
            "request_evidence_not_supported"
        )

    document = summary.get("document")
    document = (
        document
        if isinstance(document, Mapping)
        else {}
    )
    if document.get("analysis_status") not in {
        "complete",
        "needs_attention",
    }:
        errors.append(
            "document_analysis_not_complete"
        )
    if document.get("local_processing") is not True:
        errors.append(
            "document_not_marked_local"
        )

    resources = document.get("resources")
    resources = (
        resources
        if isinstance(resources, Mapping)
        else {}
    )
    if (
        not isinstance(
            resources.get("inference_requests"),
            int,
        )
        or resources.get(
            "inference_requests",
            0,
        )
        < 1
    ):
        errors.append(
            "no_inference_requests"
        )
    if (
        not isinstance(
            resources.get("evidence_requests"),
            int,
        )
        or resources.get(
            "evidence_requests",
            0,
        )
        < 1
    ):
        errors.append(
            "no_resource_evidence_requests"
        )
    if (
        _EXPECTED_MEMORY_SOURCE
        not in resources.get(
            "memory_sources",
            [],
        )
    ):
        errors.append(
            "expected_memory_source_missing"
        )
    if (
        resources.get("average_cpu_percent")
        is not None
        and _EXPECTED_CPU_SOURCE
        not in resources.get(
            "cpu_sources",
            [],
        )
    ):
        errors.append(
            "expected_cpu_source_missing"
        )
    if (
        "process_global"
        not in resources.get(
            "attribution_qualities",
            [],
        )
    ):
        errors.append(
            "process_global_attribution_missing"
        )

    cleanup = summary.get("cleanup")
    cleanup = (
        cleanup
        if isinstance(cleanup, Mapping)
        else {}
    )
    for process_name in ("api", "korgis"):
        item = cleanup.get(process_name)
        item = (
            item
            if isinstance(item, Mapping)
            else {}
        )
        if (
            item.get("hard_kill_required")
            is True
        ):
            errors.append(
                f"{process_name}_required_hard_kill"
            )
    return errors


def run(
    *,
    app_bundle: Path,
    model: str,
    redactguard_source_commit: str,
    expected_korgis_commit: str,
    startup_timeout: float,
    output_dir: Path,
) -> dict[str, Any]:
    if platform.system() != "Darwin":
        raise E2EError(
            "packaged managed-runtime evidence must run on macOS"
        )
    if not _FULL_SHA.fullmatch(
        redactguard_source_commit
    ):
        raise E2EError(
            "RedactGuard source commit must be a full lowercase Git SHA"
        )
    if not _FULL_SHA.fullmatch(
        expected_korgis_commit
    ):
        raise E2EError(
            "Korgis source commit must be a full lowercase Git SHA"
        )

    launcher = _find_launcher(
        app_bundle
    )
    manifest = _read_manifest(
        _find_manifest(app_bundle)
    )
    korgis_port = _free_port()
    api_port = _free_port()
    while api_port == korgis_port:
        api_port = _free_port()

    output_dir.mkdir(
        parents=True,
        exist_ok=True,
    )
    korgis_process = None
    api_process = None
    korgis_log = None
    api_log = None
    cleanup: dict[str, Any] = {}
    evidence: dict[str, Any] = {}
    try:
        korgis_process, korgis_log = _start_process(
            [
                str(launcher),
                "korgis",
                "--port",
                str(korgis_port),
                "--model",
                model,
            ],
            env=os.environ.copy(),
            log_path=(
                output_dir
                / "korgis.log"
            ),
        )
        _wait_json(
            (
                "http://127.0.0.1:"
                f"{korgis_port}/health"
            ),
            timeout=startup_timeout,
        )

        env = os.environ.copy()
        env.update(
            {
                "KORGIS_MODE": "managed",
                "KORGIS_BASE_URL": (
                    "http://127.0.0.1:"
                    f"{korgis_port}/v1"
                ),
                "KORGIS_MODEL": model,
            }
        )
        api_process, api_log = _start_process(
            [
                str(launcher),
                "api",
                "--port",
                str(api_port),
            ],
            env=env,
            log_path=(
                output_dir
                / "api.log"
            ),
        )
        health = _wait_json(
            (
                "http://127.0.0.1:"
                f"{api_port}/api/health"
            ),
            timeout=60,
        )

        (
            upload_body,
            upload_content_type,
        ) = _multipart_upload(
            _synthetic_pdf_bytes()
        )
        (
            upload_status,
            upload,
        ) = _request_json(
            (
                "http://127.0.0.1:"
                f"{api_port}/api/upload"
            ),
            method="POST",
            data=upload_body,
            content_type=(
                upload_content_type
            ),
            timeout=120,
        )
        if upload_status != 200:
            raise E2EError(
                "synthetic PDF upload failed "
                f"with status {upload_status}"
            )
        doc_id = upload.get("doc_id")
        if (
            not isinstance(doc_id, str)
            or not doc_id
        ):
            raise E2EError(
                "upload response did not "
                "return a document id"
            )

        analyze_status, _ = _request_json(
            (
                "http://127.0.0.1:"
                f"{api_port}/api/analyze/"
                f"{doc_id}/page/1"
            ),
            method="POST",
            timeout=900,
        )
        if analyze_status != 200:
            raise E2EError(
                "synthetic analysis failed "
                f"with status {analyze_status}"
            )
        (
            summary_status,
            document_summary,
        ) = _request_json(
            (
                "http://127.0.0.1:"
                f"{api_port}/api/analyze/"
                f"{doc_id}/summary"
            ),
            timeout=30,
        )
        if summary_status != 200:
            raise E2EError(
                "document summary endpoint failed"
            )
        (
            resource_status,
            resource_state,
        ) = _request_json(
            (
                "http://127.0.0.1:"
                f"{korgis_port}"
                "/api/v1/resources"
            ),
            timeout=10,
        )
        if resource_status != 200:
            raise E2EError(
                "packaged Korgis resource "
                "endpoint failed"
            )

        resources = document_summary.get(
            "resources"
        )
        resources = (
            dict(resources)
            if isinstance(
                resources,
                Mapping,
            )
            else {}
        )
        observation = resource_state.get(
            "observation"
        )
        observation = (
            observation
            if isinstance(
                observation,
                Mapping,
            )
            else {}
        )
        evidence = {
            "health": {
                "status": health.get(
                    "status"
                ),
                "llm_status": health.get(
                    "llm_status"
                ),
                "model": health.get(
                    "model"
                ),
                "korgis_mode": health.get(
                    "korgis_mode"
                ),
                "korgis_protocol_version": (
                    health.get(
                        "korgis_protocol_version"
                    )
                ),
                "korgis_compatibility": (
                    health.get(
                        "korgis_compatibility"
                    )
                ),
                (
                    "korgis_request_"
                    "evidence_supported"
                ): health.get(
                    "korgis_request_evidence_supported"
                ),
            },
            "document": {
                "pages_total": (
                    document_summary.get(
                        "pages_total"
                    )
                ),
                "pages_analyzed": (
                    document_summary.get(
                        "pages_analyzed"
                    )
                ),
                "analysis_status": (
                    document_summary.get(
                        "analysis_status"
                    )
                ),
                "local_processing": (
                    document_summary.get(
                        "local_processing"
                    )
                ),
                "resources": resources,
                "document_content_retained": False,
                "findings_retained": False,
            },
            "korgis_control_plane": {
                "policy_state": (
                    resource_state.get(
                        "policy_state"
                    )
                ),
                "observation_schema_version": (
                    observation.get(
                        "schema_version"
                    )
                ),
            },
        }
    finally:
        cleanup["api"] = _stop_process(
            api_process
        )
        cleanup["korgis"] = _stop_process(
            korgis_process
        )
        if api_log is not None:
            api_log.close()
        if korgis_log is not None:
            korgis_log.close()

    result: dict[str, Any] = {
        "schema_version": 1,
        "procedure": (
            "redactguard_packaged_"
            "managed_korgis_e2e_v1"
        ),
        "captured_at": _utc_now(),
        "redactguard_source_commit": (
            redactguard_source_commit
        ),
        "expected_korgis_commit": (
            expected_korgis_commit
        ),
        "package_manifest": manifest,
        "hardware": _mac_hardware_profile(),
        **evidence,
        "cleanup": cleanup,
        "privacy": {
            "synthetic_document_only": True,
            "document_content_retained": False,
            "findings_retained": False,
            "private_paths_retained": False,
            "process_ids_retained": False,
            "raw_logs_retained_locally": True,
        },
    }
    errors = validate_summary(result)
    result["validation_errors"] = errors
    result["status"] = (
        "PASS"
        if not errors
        else "FAIL"
    )
    return result


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Run packaged RedactGuard "
            "managed-Korgis E2E on macOS"
        )
    )
    parser.add_argument(
        "--app",
        type=Path,
        required=True,
    )
    parser.add_argument(
        "--model",
        required=True,
    )
    parser.add_argument(
        "--redactguard-source-commit",
        required=True,
    )
    parser.add_argument(
        "--expected-korgis-commit",
        required=True,
    )
    parser.add_argument(
        "--startup-timeout",
        type=float,
        default=900.0,
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        required=True,
    )
    return parser


def main(
    argv: Sequence[str] | None = None,
) -> int:
    args = _parser().parse_args(argv)
    try:
        result = run(
            app_bundle=args.app,
            model=args.model,
            redactguard_source_commit=(
                args.redactguard_source_commit
            ),
            expected_korgis_commit=(
                args.expected_korgis_commit
            ),
            startup_timeout=(
                args.startup_timeout
            ),
            output_dir=(
                args.output_dir.expanduser()
            ),
        )
    except E2EError as exc:
        raise SystemExit(
            str(exc)
        ) from exc
    summary_path = (
        args.output_dir.expanduser()
        / "managed-package-e2e-summary.json"
    )
    summary_path.write_text(
        json.dumps(
            result,
            indent=2,
            sort_keys=True,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "status": result["status"],
                "summary": summary_path.name,
            }
        )
    )
    return (
        0
        if result["status"] == "PASS"
        else 1
    )


if __name__ == "__main__":
    raise SystemExit(main())

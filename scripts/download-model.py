#!/usr/bin/env python3
"""
RedactGuard — Model Download Manager

Downloads the default GGUF model on first launch with:
- Progress bar
- Resume support
- SHA256 verification
"""

import hashlib
import os
import sys
import urllib.request
from pathlib import Path

# Default model configuration
DEFAULT_MODEL_URL = (
    "https://huggingface.co/lmstudio-community/NVIDIA-Nemotron-3-Nano-4B-GGUF/"
    "resolve/main/NVIDIA-Nemotron-3-Nano-4B-Q4_K_M.gguf"
)
DEFAULT_MODEL_SHA256 = ""  # TODO: fill with actual hash once verified
DEFAULT_MODEL_FILENAME = "NVIDIA-Nemotron-3-Nano-4B-Q4_K_M.gguf"


def get_models_dir() -> Path:
    """Get the models directory, respecting XDG conventions."""
    # Check env override first
    env_dir = os.environ.get("REDACTGUARD_MODELS_DIR")
    if env_dir:
        return Path(env_dir)

    # Default: ~/.redactguard/models/
    return Path.home() / ".redactguard" / "models"


def download_with_progress(url: str, dest: Path, expected_sha256: str = "") -> bool:
    """Download a file with progress bar and resume support."""
    dest.parent.mkdir(parents=True, exist_ok=True)

    # Check if already downloaded
    if dest.exists() and expected_sha256:
        if verify_sha256(dest, expected_sha256):
            print(f"✅ Model already downloaded and verified: {dest.name}")
            return True
        else:
            print(f"⚠️  Existing file failed verification, re-downloading...")
            dest.unlink()

    # Check for partial download (resume support)
    partial = dest.with_suffix(dest.suffix + ".part")
    resume_size = partial.stat().st_size if partial.exists() else 0

    # Build request with range header for resume
    req = urllib.request.Request(url)
    if resume_size > 0:
        req.add_header("Range", f"bytes={resume_size}-")
        print(f"📥 Resuming download from {_format_size(resume_size)}...")

    try:
        with urllib.request.urlopen(req) as response:
            total_size = int(response.headers.get("Content-Length", 0))
            if resume_size > 0:
                total_size += resume_size

            mode = "ab" if resume_size > 0 else "wb"
            downloaded = resume_size

            print(f"📥 Downloading: {dest.name}")
            print(f"   Size: {_format_size(total_size)}")
            print(f"   Destination: {dest}")
            print()

            with open(partial, mode) as f:
                block_size = 1024 * 1024  # 1MB blocks
                while True:
                    chunk = response.read(block_size)
                    if not chunk:
                        break
                    f.write(chunk)
                    downloaded += len(chunk)
                    _print_progress(downloaded, total_size)

            print()  # newline after progress bar

    except (urllib.error.URLError, OSError) as e:
        print(f"\n❌ Download failed: {e}")
        print(f"   Partial file saved at: {partial}")
        print(f"   Re-run to resume download.")
        return False

    # Verify if hash provided
    if expected_sha256:
        print("🔐 Verifying integrity...")
        if not verify_sha256(partial, expected_sha256):
            print("❌ SHA256 verification failed! File may be corrupted.")
            partial.unlink()
            return False
        print("✅ Integrity verified.")

    # Move partial to final
    partial.rename(dest)
    print(f"✅ Model ready: {dest}")
    return True


def verify_sha256(path: Path, expected: str) -> bool:
    """Verify SHA256 hash of a file."""
    sha256 = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            sha256.update(chunk)
    return sha256.hexdigest() == expected.lower()


def _format_size(size: int) -> str:
    """Format bytes to human-readable string."""
    for unit in ["B", "KB", "MB", "GB"]:
        if size < 1024:
            return f"{size:.1f} {unit}"
        size /= 1024
    return f"{size:.1f} TB"


def _print_progress(downloaded: int, total: int):
    """Print a progress bar to stderr."""
    if total == 0:
        return
    pct = downloaded / total * 100
    bar_len = 40
    filled = int(bar_len * downloaded / total)
    bar = "█" * filled + "░" * (bar_len - filled)
    sys.stdout.write(
        f"\r   [{bar}] {pct:5.1f}% ({_format_size(downloaded)} / {_format_size(total)})"
    )
    sys.stdout.flush()


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Download RedactGuard LLM model")
    parser.add_argument("--url", default=DEFAULT_MODEL_URL, help="Model download URL")
    parser.add_argument("--sha256", default=DEFAULT_MODEL_SHA256, help="Expected SHA256")
    parser.add_argument("--output-dir", default=None, help="Override output directory")
    parser.add_argument("--filename", default=DEFAULT_MODEL_FILENAME, help="Output filename")
    args = parser.parse_args()

    models_dir = Path(args.output_dir) if args.output_dir else get_models_dir()
    dest = models_dir / args.filename

    success = download_with_progress(args.url, dest, args.sha256)
    if success:
        # Print the path for callers to use
        print(f"\nMODEL_PATH={dest}")
        sys.exit(0)
    else:
        sys.exit(1)


if __name__ == "__main__":
    main()

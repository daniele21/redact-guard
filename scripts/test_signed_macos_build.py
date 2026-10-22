"""No-network regression tests for persistent Keychain signer selection."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).with_name("build-signed-macos.sh")
CERT_A = "A" * 40
CERT_B = "B" * 40

class SigningContractTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        folder = Path(self.tmp.name)
        binary = folder / "bin"
        binary.mkdir()
        cmd = binary / "security"
        cmd.write_text(
            "#!/bin/sh\n"
            "printf '  1) %s \"Apple Development: Test\"\\n' \"$MOCK_CERT\"\n"
        )
        cmd.chmod(0o755)
        self.pin = folder / "config" / "signer"
        self.env = {
            **os.environ, "PATH": f"{binary}:{os.getenv('PATH', '')}",
            "MOCK_CERT": CERT_A,
            "REDACTGUARD_SIGNING_IDENTITY_FILE": str(self.pin)
        }

    def run_signer(self, *args, **env):
        return subprocess.run(
            ["bash", str(SCRIPT), *args],
            env={**self.env, **env}, capture_output=True, text=True,
        )

    def test_initial_pin_and_subsequent_reuse(self):
        first = self.run_signer("--identity", CERT_A.lower(), "--check-signing")
        self.assertEqual(first.returncode, 0, first.stderr)
        self.assertEqual(self.pin.read_text().strip(), CERT_A)
        self.assertEqual(self.pin.stat().st_mode & 0o777, 0o600)
        self.assertEqual(self.run_signer("--check-signing").returncode, 0)

    def test_missing_key_and_adhoc_do_not_create_pin(self):
        self.assertNotEqual(self.run_signer("--check-signing").returncode, 0)
        self.assertNotEqual(
            self.run_signer("--identity", "-", "--check-signing").returncode, 0
        )
        self.assertFalse(self.pin.exists())

    def test_pin_cannot_change_or_fallback_if_key_missing(self):
        self.assertEqual(
            self.run_signer("--identity", CERT_A, "--check-signing").returncode, 0
        )
        mismatch = self.run_signer("--identity", CERT_B, "--check-signing")
        self.assertNotEqual(mismatch.returncode, 0)
        self.assertIn("Refusing to change", mismatch.stderr)
        absent = self.run_signer("--check-signing", MOCK_CERT=CERT_B)
        self.assertNotEqual(absent.returncode, 0)
        self.assertEqual(self.pin.read_text().strip(), CERT_A)

    def test_shell_syntax(self):
        run = subprocess.run(["bash", "-n", str(SCRIPT)], capture_output=True)
        self.assertEqual(run.returncode, 0, run.stderr)

if __name__ == "__main__":
    unittest.main()

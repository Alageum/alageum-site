"""Dependency-free operational regression tests; no Docker or live server needed."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class BackendReadinessTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.directory = Path(self.temporary.name)
        self.environment = {
            **os.environ,
            "PATH": f"{self.directory}:{os.environ['PATH']}",
            "BACKEND_READY_TIMEOUT_SECONDS": "1",
            "READY_TEST_DIR": str(self.directory),
        }
        self.stub("docker", 'printf "%s\\n" "$*" >> "$READY_TEST_DIR/docker.log"\n')
        # Fast retries exercise readiness transitions without slowing the suite.
        self.stub("sleep", '/bin/sleep 0.02\n')
        self.artifact = self.directory / "fixture.dump"
        self.artifact.write_text("disposable fake backup; all Docker calls are stubbed")

    def stub(self, name, body):
        path = self.directory / name
        path.write_text("#!/usr/bin/env bash\nset -eu\n" + body)
        path.chmod(0o755)

    def run_script(self, name, *args):
        return subprocess.run(
            ["bash", str(ROOT / "scripts" / name), *map(str, args)],
            env=self.environment,
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )

    def test_wait_retries_connection_resets_then_succeeds(self):
        self.stub("curl", '''
count=0
[[ ! -f "$READY_TEST_DIR/count" ]] || count=$(cat "$READY_TEST_DIR/count")
count=$((count + 1))
printf '%s' "$count" > "$READY_TEST_DIR/count"
printf '%s\\n' "$*" >> "$READY_TEST_DIR/curl.log"
if (( count < 3 )); then printf 'Connection reset by peer\\n' >&2; exit 56; fi
''')
        self.environment["BACKEND_READY_TIMEOUT_SECONDS"] = "3"
        result = self.run_script("wait-for-backend.sh")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((self.directory / "count").read_text(), "3")
        self.assertIn("Backend ready:", result.stdout)
        calls = (self.directory / "curl.log").read_text()
        self.assertIn("--connect-timeout 2", calls)
        self.assertIn("--max-time", calls)
        self.assertIn("--fail", calls)
        self.assertIn("/api/v1/readiness", calls)

    def test_wait_timeout_is_nonzero_and_reports_last_error(self):
        self.stub("curl", "printf 'HTTP 503 database unavailable\\n' >&2; exit 22\n")
        result = self.run_script("wait-for-backend.sh")
        self.assertEqual(result.returncode, 1)
        self.assertNotIn("Backend ready:", result.stdout)
        self.assertIn("within 1 seconds", result.stderr)
        self.assertIn("HTTP 503 database unavailable", result.stderr)

    def test_restore_reports_success_only_after_readiness(self):
        self.stub("curl", "exit 0\n")
        result = self.run_script("restore.sh", self.artifact)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertLess(result.stdout.index("Backend ready:"), result.stdout.index("Restore completed:"))
        self.assertIn("start backend", (self.directory / "docker.log").read_text())

    def test_restore_does_not_report_success_when_backend_remains_unready(self):
        self.stub("curl", "printf 'Connection refused\\n' >&2; exit 7\n")
        result = self.run_script("restore.sh", self.artifact)
        self.assertEqual(result.returncode, 1)
        self.assertNotIn("Restore completed:", result.stdout)
        self.assertIn("Backend did not become ready", result.stderr)

    def test_invalid_timeout_fails_before_request(self):
        self.stub("curl", "touch \"$READY_TEST_DIR/requested\"\n")
        for timeout in ("0", "-1", "abc", "601"):
            with self.subTest(timeout=timeout):
                self.environment["BACKEND_READY_TIMEOUT_SECONDS"] = timeout
                result = self.run_script("wait-for-backend.sh")
                self.assertEqual(result.returncode, 2)
        self.assertFalse((self.directory / "requested").exists())


if __name__ == "__main__":
    unittest.main()

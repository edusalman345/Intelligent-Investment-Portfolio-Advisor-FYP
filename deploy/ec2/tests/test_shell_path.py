"""Execute the real PATH assignments with harmless temporary sbin fixtures."""
from pathlib import Path
import os
import re
import shutil
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
BASH = shutil.which("bash")
if os.name == "nt":
    candidate = Path(os.environ.get("ProgramFiles", "C:/Program Files")) / "Git/bin/bash.exe"
    if candidate.is_file():
        BASH = str(candidate)


@unittest.skipUnless(BASH, "Bash is required for executable shell PATH regressions")
class ShellPathTests(unittest.TestCase):
    def execute_assignment(self, assignment: str, prerequisite: bool):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            for directory in ["node/bin", "usr/local/sbin", "usr/local/bin", "usr/sbin", "usr/bin", "sbin", "bin"]:
                (root / directory).mkdir(parents=True, exist_ok=True)
            for directory, names in [("usr/sbin", ["runuser", "nginx"]),
                                     ("usr/local/sbin", ["local-admin"]), ("sbin", ["root-admin"])]:
                for name in names:
                    tool = root / directory / name
                    tool.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
                    tool.chmod(0o755)
            # Map only standard directories to fixtures. Keep the original shell
            # expression and Node-directory selection, without invoking deployment.
            mapped = re.sub(r"/(?:usr/(?:local/)?s?bin|s?bin)(?=[:\"])",
                            lambda match: "$fixture" + match[0], assignment)
            script = 'set -eu\nfixture=$(cd "$1" && pwd)\nnode_bin="$fixture/node/bin/node"\n'
            if prerequisite:
                # The exact regression: runuser is found before Node PATH reset.
                script += 'export PATH="$fixture/usr/sbin:/usr/bin:/bin"\ncommand -v runuser >/dev/null\n'
            else:
                script += 'export PATH=/usr/bin:/bin\n'
            script += mapped + '\n'
            script += 'for tool in runuser nginx local-admin root-admin; do command -v "$tool" >/dev/null; done\n'
            return subprocess.run([BASH, "--noprofile", "--norc", "-c", script, "path-test", root.as_posix()],
                                  capture_output=True, text=True, check=False)

    def assignment(self, filename):
        lines = (ROOT / filename).read_text(encoding="utf-8").splitlines()
        assignments = [line for line in lines if line.startswith("export PATH=")]
        self.assertEqual(len(assignments), 1)
        return assignments[0]

    def test_bootstrap_retains_sbin_tools_after_successful_prerequisite_lookup(self):
        result = self.execute_assignment(self.assignment("bootstrap.sh"), prerequisite=True)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_original_bootstrap_assignment_reproduces_missing_runuser(self):
        original = 'export PATH="$(dirname "$node_bin"):/usr/local/bin:/usr/bin:/bin"'
        self.assertNotEqual(self.execute_assignment(original, prerequisite=True).returncode, 0)

    def test_standalone_rollback_restores_administrative_command_search(self):
        result = self.execute_assignment(self.assignment("rollback.sh"), prerequisite=False)
        self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == "__main__":
    unittest.main()

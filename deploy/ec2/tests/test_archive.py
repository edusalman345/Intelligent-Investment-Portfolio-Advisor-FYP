"""Archive security regressions; isolated temporary files only."""
import importlib.util
import gzip
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

MODULE = Path(__file__).resolve().parents[1] / "archive.py"
SPEC = importlib.util.spec_from_file_location("release_archive", MODULE)
release = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(release)


class ArchiveTests(unittest.TestCase):
    def test_unsafe_paths_rejected(self):
        for name in ["../secret", "/absolute", "./package.json", "apps//web/a.js", "C:/private", "apps\\web\\a.js", "apps/web/.env", "apps/web/node_modules/a.js", "Proposal.pdf", "apps/web/CON/a.js", "apps/web/a.js "]:
            with self.subTest(name=name), self.assertRaises(ValueError):
                release.clean_name(name)

    def test_allowlist_excludes_private_and_unrelated_files(self):
        for name in ["README.md", "docs/private.md", "services/analytics/src/app.py", ".aws/credentials", "apps/web/src/a.test.ts", "deploy/ec2/tests/test_archive.py"]:
            with self.subTest(name=name):
                self.assertFalse(release.allowed(name))

    def test_names_only_environment_template(self):
        release.safe_content("deploy/ec2/production.env.example", b"# Private configuration stays outside package\nGOOGLE_CLIENT_SECRET=\n")
        with self.assertRaises(ValueError):
            release.safe_content("deploy/ec2/production.env.example", b"GOOGLE_CLIENT_SECRET=placeholder\n")

    def test_private_key_content_rejected(self):
        with self.assertRaises(ValueError):
            release.safe_content("apps/web/src/a.ts", b"-----BEGIN " + b"PRIVATE KEY-----")

    def test_duplicate_alias_and_special_entries_rejected_before_extraction(self):
        for names, symlink in [(["package.json", "package.json"], False), (["package.json", "PACKAGE.json"], False), (["./package.json"], False), (["package.json"], True)]:
            with self.subTest(names=names, symlink=symlink), tempfile.TemporaryDirectory() as temp:
                archive = Path(temp) / "bad.tar.gz"
                destination = Path(temp) / "extract"
                with tarfile.open(archive, "w:gz") as handle:
                    for name in names:
                        member = tarfile.TarInfo(name)
                        if symlink:
                            member.type = tarfile.SYMTYPE
                            member.linkname = "/etc/passwd"
                            handle.addfile(member)
                        else:
                            member.size = 2
                            handle.addfile(member, io.BytesIO(b"{}"))
                with self.assertRaises(ValueError):
                    release.verify(archive, destination=destination)
                self.assertFalse(destination.exists())

    def test_checksum_failure_before_extraction(self):
        with tempfile.TemporaryDirectory() as temp:
            archive = Path(temp) / "release.tar.gz"
            checksum = Path(temp) / "release.tar.gz.sha256"
            archive.write_bytes(b"not an archive")
            checksum.write_text("0" * 64 + "  release.tar.gz\n")
            destination = Path(temp) / "extract"
            with self.assertRaises(ValueError):
                release.verify(archive, checksum, destination)
            self.assertFalse(destination.exists())

    def test_expansion_limit_checked_before_tar_parsing(self):
        with tempfile.TemporaryDirectory() as temp:
            archive = Path(temp) / "oversized.tar.gz"
            archive.write_bytes(gzip.compress(b"0" * 2048))
            with patch.object(release, "LIMIT", 1024), self.assertRaisesRegex(ValueError, "expanded archive limit"):
                release.verify(archive)

    def test_public_snapshot_schema_rejects_private_extra_fields(self):
        with self.assertRaises(ValueError):
            release.validate_market(json.dumps({"token": "synthetic-test-only"}).encode())

    def test_build_reproducible_verify_and_manifest_tamper(self):
        # Minimal source tree exercises the real builder rather than a parallel implementation.
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            for name in release.REQUIRED | {"apps/web/dist/assets/app.js"}:
                file = root / name
                file.parent.mkdir(parents=True, exist_ok=True)
                if name.endswith(".env.example"):
                    file.write_text("GOOGLE_CLIENT_SECRET=\n")
                elif name == "apps/web/dist/index.html":
                    file.write_text("IIPA - Intelligent Investment Portfolio Advisor")
                else:
                    file.write_text("// synthetic test fixture\n")
            output = root / ".tmp/release.tar.gz"
            with patch.object(release.subprocess, "check_output", side_effect=["a" * 40 + "\n", "1234567890\n"] * 2):
                release.build(root, output, False)
                first = output.read_bytes()
                release.build(root, output, False)
            self.assertEqual(first, output.read_bytes())
            destination = root / "extracted"
            manifest = release.verify(output, output.with_name(output.name + ".sha256"), destination)
            self.assertTrue((destination / "services/api/dist/server.js").is_file())
            self.assertEqual(manifest["format"], release.FORMAT)
            with self.assertRaises(ValueError):
                release.verify(output, destination=destination)
            # Alter one file while preserving the original manifest: checksum-less verification
            # must still reject altered content before any extraction.
            damaged = root / ".tmp/tampered.tar.gz"
            with tarfile.open(output, "r:gz") as source, tarfile.open(damaged, "w:gz") as target:
                for member in source:
                    data = source.extractfile(member).read()
                    if member.name == "package.json":
                        data = b"tampered"
                        member.size = len(data)
                    target.addfile(member, io.BytesIO(data))
            absent = root / "rejected"
            with self.assertRaises(ValueError):
                release.verify(damaged, destination=absent)
            self.assertFalse(absent.exists())


if __name__ == "__main__":
    unittest.main()

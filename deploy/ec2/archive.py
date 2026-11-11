"""Build/verify a deterministic, allowlisted IIPA release without private files.

The operator transfers this trusted helper alongside bootstrap.sh, not from an
unverified archive. SHA-256 proves transfer integrity, not publisher identity.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
from decimal import Decimal
import gzip
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import sys
import tarfile
import urllib.parse
import uuid

FORMAT = "iipa-release-v1"
MANIFEST = "release-manifest.json"
LIMIT = 100_000_000
REQUIRED = {
    "package.json", "package-lock.json", "tsconfig.base.json",
    "apps/web/package.json", "apps/web/dist/index.html", "apps/web/dist/favicon.svg",
    "services/api/package.json", "services/api/dist/server.js",
    "services/api/dist/app.js", "services/api/dist/config.js",
    "services/api/dist/db/migrate.js", "packages/contracts/package.json",
    "database/migrations/001_p1_foundation.sql",
    "database/migrations/002_subscription_plans.sql", "deploy/ec2/bootstrap.sh",
    "deploy/ec2/rollback.sh", "deploy/ec2/archive.py", "deploy/ec2/iipa-api.service",
    "deploy/ec2/nginx-http.conf.template", "deploy/ec2/nginx-https.conf.template",
    "deploy/ec2/production.env.example", "deploy/ec2/validate-env.py",
    "deploy/ec2/smoke.mjs", "deploy/ec2/export-market.mjs", "deploy/ec2/import-market.mjs",
}


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def clean_name(name: str) -> str:
    """Reject rather than normalize archive aliases, Windows paths or controls."""
    if not name or "\\" in name or ":" in name or any(ord(c) < 32 or ord(c) == 127 for c in name):
        raise ValueError("Unsafe release path")
    parts = name.split("/")
    if any(p in {"", ".", ".."} for p in parts) or PurePosixPath(name).is_absolute():
        raise ValueError("Unsafe release path")
    if any(p.lower() in {".git", "node_modules", ".tmp", "proposal.pdf"} for p in parts):
        raise ValueError("Excluded release path")
    if any(p.lower() == ".env" or p.lower().startswith(".env.") for p in parts):
        raise ValueError("Private environment path")
    if any(p.lower() in {"id_rsa", "id_ed25519", "credentials"} for p in parts):
        raise ValueError("Credential path")
    if any(p.endswith((".", " ")) or re.fullmatch(r"(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?", p, re.I) for p in parts):
        raise ValueError("Unsafe Windows path")
    if name.lower().endswith((".pem", ".p12", ".pfx", ".key", ".map", ".log")):
        raise ValueError("Excluded file type")
    return name


def allowed(name: str) -> bool:
    if name in {MANIFEST, "package.json", "package-lock.json", "tsconfig.base.json"}:
        return True
    if name in {f"{p}/{f}" for p in ["apps/web", "services/api", "packages/contracts"] for f in ["package.json", "tsconfig.json"]}:
        return True
    if name in {"apps/web/vite.config.ts", "apps/web/index.html"}:
        return True
    parts = PurePosixPath(name).parts
    if any(p in {"test", "tests", "__tests__"} for p in parts) or re.search(r"\.(test|spec)\.", name):
        return False
    if name.startswith(("apps/web/src/", "packages/contracts/src/", "services/api/src/")):
        return name.endswith((".ts", ".tsx", ".css", ".svg", ".json"))
    if name.startswith("apps/web/public/"):
        return name.endswith((".svg", ".png", ".ico", ".webmanifest", ".txt"))
    if name.startswith("apps/web/dist/"):
        return name.endswith((".html", ".js", ".css", ".svg", ".png", ".ico", ".woff", ".woff2", ".webmanifest", ".txt"))
    if name.startswith("services/api/dist/"):
        return name.endswith((".js", ".json"))
    if re.fullmatch(r"database/migrations/\d+_[a-z0-9_]+\.sql", name):
        return True
    if name.startswith("deploy/ec2/") and len(parts) == 3:
        return name.endswith((".sh", ".mjs", ".py", ".ps1", ".service", ".template", ".example", ".md")) or name == "deploy/ec2/market-data.json"
    return False


def safe_content(name: str, data: bytes) -> None:
    if name.endswith(".env.example"):
        for line in data.decode("utf-8").splitlines():
            if line.strip() and not line.lstrip().startswith("#") and not re.fullmatch(r"[A-Z][A-Z0-9_]*=", line):
                raise ValueError("Environment examples must contain variable names only")
    patterns = [rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----",
                rb"(?:AKIA|ASIA)[A-Z0-9]{16}", rb"GOCSPX-[A-Za-z0-9_-]{20,}"]
    if any(re.search(pattern, data) for pattern in patterns):
        raise ValueError("Potential credential content; values suppressed")
    if name == "deploy/ec2/market-data.json":
        validate_market(data)


def validate_market(data: bytes) -> None:
    """Only the existing public five-stock schema may enter the release."""
    obj = json.loads(data)
    def keys(value, expected):
        if not isinstance(value, dict) or set(value) != set(expected.split()):
            raise ValueError("Unexpected market archive fields")
    def timestamp(value):
        result = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if result.tzinfo is None or result > datetime.now(timezone.utc):
            raise ValueError("Invalid market timestamp")
        return result
    def positive(value):
        if not isinstance(value, str) or not re.fullmatch(r"\d{1,16}(\.\d{1,8})?", value) or Decimal(value) <= 0:
            raise ValueError("Invalid market price")
    def volume(value):
        if value is not None and (not isinstance(value, str) or not re.fullmatch(r"\d{1,24}(\.\d{1,4})?", value)):
            raise ValueError("Invalid market volume")
    keys(obj, "format source isDemo notice exportedAt assets")
    if obj["format"] != "iipa-public-market-archive-v1" or obj["source"] != "Alpha Vantage free daily data" or obj["isDemo"] is not False:
        raise ValueError("Actual recorded provider data required")
    if obj["notice"] != "Recorded real end-of-day data; import is not a fresh provider fetch.":
        raise ValueError("Historical data notice required")
    exported = timestamp(obj["exportedAt"])
    symbols = set()
    if not isinstance(obj["assets"], list) or len(obj["assets"]) != 5:
        raise ValueError("Five public assets required")
    for entry in obj["assets"]:
        keys(entry, "asset fetchedAt recordedAt quotes bars")
        a = entry["asset"]
        keys(a, "id symbol name exchange currency assetType")
        uuid.UUID(a["id"])
        if not isinstance(a["name"], str) or not 1 <= len(a["name"]) <= 255 or any(c in a["name"] for c in "<>\r\n"):
            raise ValueError("Invalid asset name")
        symbols.add(a["symbol"])
        if a["exchange"] not in {"NASDAQ", "US"} or a["currency"] != "USD" or a["assetType"] != "STOCK":
            raise ValueError("Unsupported public asset")
        if not timestamp(entry["fetchedAt"]) <= timestamp(entry["recordedAt"]) <= exported:
            raise ValueError("Invalid recording order")
        if len(entry["quotes"]) != 1 or len(entry["bars"]) != 100:
            raise ValueError("Expected public quote/history counts")
        for q in entry["quotes"]:
            keys(q, "price currency volume asOf")
            positive(q["price"]); timestamp(q["asOf"]); volume(q["volume"])
            if q["currency"] != "USD":
                raise ValueError("Unsupported quote currency")
        times = set()
        for b in entry["bars"]:
            keys(b, "time open high low close volume")
            timestamp(b["time"]); times.add(b["time"]); volume(b["volume"])
            for field in ["open", "high", "low", "close"]:
                positive(b[field])
            if Decimal(b["high"]) < max(Decimal(b[f]) for f in ["open", "low", "close"]) or Decimal(b["low"]) > min(Decimal(b[f]) for f in ["open", "high", "close"]):
                raise ValueError("Invalid public OHLC bounds")
        if len(times) != 100:
            raise ValueError("Duplicate public history")
    if symbols != {"AAPL", "MSFT", "NVDA", "TSLA", "AVGO"}:
        raise ValueError("Unexpected public symbols")


def required_files(files: dict[str, bytes]) -> None:
    if not REQUIRED.issubset(files):
        raise ValueError("Release is missing required application/deployment files")
    if not any(n.startswith("apps/web/dist/assets/") and n.endswith(".js") for n in files):
        raise ValueError("Compiled frontend assets required")
    for name in files:
        if name.startswith("services/api/src/") and name.endswith(".ts"):
            built = name.replace("services/api/src/", "services/api/dist/", 1)[:-3] + ".js"
            if built not in files:
                raise ValueError("API compiled output is incomplete")
    if b"IIPA - Intelligent Investment Portfolio Advisor" not in files["apps/web/dist/index.html"]:
        raise ValueError("Current IIPA branding required")


def private_values(root: Path) -> list[bytes]:
    values = []
    env = root / ".env"
    if not env.is_file():
        return values
    for line in env.read_text(encoding="utf-8-sig").splitlines():
        match = re.match(r"\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$", line)
        if match and re.search(r"SECRET|KEY|DATABASE_URL|CLIENT_ID", match[1]):
            value = match[2].strip("\"'")
            if len(value) >= 12:
                values.extend([value.encode(), urllib.parse.quote(value, safe="").encode()])
                if match[1] == "DATABASE_URL":
                    password = urllib.parse.urlsplit(value).password
                    if password and len(password) >= 8:
                        values.append(urllib.parse.unquote(password).encode())
    return values


def build(root: Path, output: Path, snapshot: bool) -> None:
    root = root.resolve()
    output = output.resolve()
    if not output.is_relative_to(root / ".tmp") or output.suffixes[-2:] != [".tar", ".gz"]:
        raise ValueError("Release output must be .tmp/*.tar.gz")
    files = {}
    secrets = private_values(root)
    for directory in ["apps/web", "services/api", "packages/contracts", "database/migrations", "deploy/ec2"]:
        for current, directories, names in os.walk(root / directory, followlinks=False):
            directories[:] = sorted(d for d in directories if d not in {"node_modules", ".git", ".tmp", "test", "tests", "__tests__", "__pycache__"})
            for linked in directories:
                candidate = Path(current) / linked
                if candidate.is_symlink() or (hasattr(candidate, "is_junction") and candidate.is_junction()):
                    raise ValueError("Release source links are forbidden")
            for basename in sorted(names):
                file = Path(current) / basename
                relative = file.relative_to(root).as_posix()
                if not allowed(relative):
                    continue
                if file.is_symlink():
                    raise ValueError("Release source links are forbidden")
                clean_name(relative)
                files[relative] = file.read_bytes()
    for name in ["package.json", "package-lock.json", "tsconfig.base.json"]:
        files[name] = (root / name).read_bytes()
    if snapshot:
        files["deploy/ec2/market-data.json"] = (root / ".tmp/deploy-public-market.json").read_bytes()
    else:
        files.pop("deploy/ec2/market-data.json", None)
    for name, data in files.items():
        safe_content(name, data)
        if any(value in data for value in secrets):
            raise ValueError("Private configured value detected; values suppressed")
    required_files(files)
    commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip()
    epoch = int(subprocess.check_output(["git", "show", "-s", "--format=%ct", "HEAD"], cwd=root, text=True).strip())
    entries = {name: {"sha256": digest(data), "size": len(data)} for name, data in sorted(files.items())}
    content_hash = digest(json.dumps(entries, sort_keys=True, separators=(",", ":")).encode())
    manifest = {"format": FORMAT, "baseCommit": commit, "releaseId": commit[:7] + "-" + content_hash[:16],
                "sourceEpoch": epoch, "files": entries}
    files[MANIFEST] = (json.dumps(manifest, sort_keys=True, indent=2) + "\n").encode()
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_name(output.name + ".partial")
    with temporary.open("wb") as stream, gzip.GzipFile(filename="", fileobj=stream, mode="wb", mtime=0) as compressed:
        with tarfile.open(fileobj=compressed, mode="w", format=tarfile.USTAR_FORMAT) as archive:
            for name, data in sorted(files.items()):
                member = tarfile.TarInfo(name)
                member.size = len(data); member.mtime = epoch
                member.mode = 0o755 if name.endswith(".sh") else 0o644
                archive.addfile(member, io.BytesIO(data))
    temporary.replace(output)
    checksum = output.with_name(output.name + ".sha256")
    checksum.write_text(digest(output.read_bytes()) + "  " + output.name + "\n", encoding="ascii")
    verify(output, checksum)


def verify(filename: Path, checksum: Path | None = None, destination: Path | None = None) -> dict:
    if filename.stat().st_size > LIMIT:
        raise ValueError("Release exceeds compressed size limit")
    if checksum:
        value = checksum.read_text(encoding="ascii").strip()
        match = re.fullmatch(r"([a-f0-9]{64})  ([^/\\\r\n]+)", value)
        if not match or match[2] != filename.name or match[1] != digest(filename.read_bytes()):
            raise ValueError("Release SHA-256 mismatch")
    files = {}
    seen = set()
    total = 0
    # Bound expansion before tarfile parses headers, including hostile PAX metadata.
    with gzip.open(filename, "rb") as compressed:
        expanded = compressed.read(LIMIT + 1)
    if len(expanded) > LIMIT:
        raise ValueError("Release exceeds expanded archive limit")
    with tarfile.open(fileobj=io.BytesIO(expanded), mode="r:") as archive:
        for member in archive:
            name = clean_name(member.name)
            key = name.casefold()
            if key in seen or not member.isfile() or not allowed(name) or member.size < 0 or member.size > LIMIT:
                raise ValueError("Duplicate, unsafe or unexpected archive member")
            seen.add(key)
            total += member.size
            if total > LIMIT or len(seen) > 10_000:
                raise ValueError("Release exceeds expanded size limit")
            data = archive.extractfile(member).read()
            safe_content(name, data)
            files[name] = data
    required_files(files)
    paths = {name.casefold() for name in files}
    if any(parent.as_posix().casefold() in paths for name in files for parent in PurePosixPath(name).parents if parent.as_posix() != "."):
        raise ValueError("Release file/directory collision")
    manifest = json.loads(files.pop(MANIFEST))
    if set(manifest) != {"format", "baseCommit", "releaseId", "sourceEpoch", "files"} or manifest["format"] != FORMAT:
        raise ValueError("Unsupported release manifest")
    entries = {name: {"sha256": digest(data), "size": len(data)} for name, data in sorted(files.items())}
    if entries != manifest["files"] or not re.fullmatch(r"[a-f0-9]{40}", manifest["baseCommit"]):
        raise ValueError("Release manifest integrity mismatch")
    content_hash = digest(json.dumps(entries, sort_keys=True, separators=(",", ":")).encode())
    if manifest["releaseId"] != manifest["baseCommit"][:7] + "-" + content_hash[:16]:
        raise ValueError("Release identity mismatch")
    if not isinstance(manifest["sourceEpoch"], int) or manifest["sourceEpoch"] < 0:
        raise ValueError("Invalid source timestamp")
    if destination:
        destination = destination.resolve()
        if destination.exists() and any(destination.iterdir()):
            raise ValueError("Extraction destination must be empty")
        # All members and hashes have passed before any extraction occurs.
        destination.mkdir(parents=True, exist_ok=True)
        for name, data in {**files, MANIFEST: (json.dumps(manifest, sort_keys=True, indent=2) + "\n").encode()}.items():
            target = destination / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            target.chmod(0o755 if name.endswith(".sh") else 0o644)
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    pack = commands.add_parser("build")
    pack.add_argument("--root", type=Path, required=True)
    pack.add_argument("--output", type=Path, required=True)
    pack.add_argument("--include-market-snapshot", action="store_true")
    check = commands.add_parser("verify")
    check.add_argument("archive", type=Path)
    check.add_argument("--sha256-file", type=Path)
    check.add_argument("--extract", type=Path)
    args = parser.parse_args()
    try:
        if args.command == "build":
            build(args.root, args.output, args.include_market_snapshot)
        else:
            verify(args.archive, args.sha256_file, args.extract)
        print("PASS: release allowlist, paths, completeness, manifest and SHA-256 validation.")
        return 0
    except Exception:
        # Do not serialize exceptions: local paths or private config may be embedded.
        print("FAIL: release validation failed; no credential values were printed.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

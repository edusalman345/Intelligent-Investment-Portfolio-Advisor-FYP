"""Reject credential filenames and validate the exact names-only env template.

Inspect the Git index so checks validate what would be committed, not an ignored
local environment file. Error messages identify files/lines without printing values.
"""
from pathlib import PurePosixPath
import re
import subprocess
import sys


def validate_template(text: str) -> list[int]:
    return [
        number
        for number, line in enumerate(text.splitlines(), 1)
        if line.strip() and not line.lstrip().startswith("#")
        and not re.fullmatch(r"[A-Z][A-Z0-9_]*=", line)
    ]


def forbidden_filename(path: str) -> bool:
    name = PurePosixPath(path).name
    if name == ".env.example":
        return False
    lower = name.lower()
    return (
        lower == ".env" or lower.startswith(".env.")
        or name in {"id_rsa", "id_ed25519"}
        or lower.endswith((".pem", ".p12", ".pfx"))
    )


def main() -> int:
    files = subprocess.check_output(["git", "ls-files", "-z"]).decode("utf-8").split("\0")
    failed = False
    for path in filter(None, files):
        if forbidden_filename(path):
            print(f"Rejected potential credential file: {path}", file=sys.stderr)
            failed = True
        elif PurePosixPath(path).name == ".env.example":
            content = subprocess.check_output(["git", "show", f":{path}"]).decode("utf-8")
            invalid = validate_template(content)
            if invalid:
                print(f"Rejected env template content at {path}, lines {invalid}.", file=sys.stderr)
                failed = True
    if not failed:
        print("Tracked credential filenames rejected; env templates contain names only.")
    return int(failed)


if __name__ == "__main__":
    raise SystemExit(main())

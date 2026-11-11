"""Validate private systemd configuration without printing values or exceptions."""
import re
import sys
from pathlib import Path


def validate(text: str, hostname: str) -> None:
    settings = {}
    for line in text.splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        match = re.fullmatch(r"([A-Z][A-Z0-9_]*)=([^\s\"'`\\]*)", line)
        if not match or match[1] in settings:
            raise ValueError("ENV_FORMAT_OR_DUPLICATE")
        settings[match[1]] = match[2]
    expected = {
        "NODE_ENV": "production", "HOST": "127.0.0.1", "PORT": "3001",
        "TRUST_PROXY_LOOPBACK": "1", "FRONTEND_ORIGIN": "https://" + hostname,
        "GOOGLE_CALLBACK_URL": "https://" + hostname + "/api/v1/auth/google/callback",
        "DATABASE_URL": "postgresql://iipa@localhost/iipa_demo?host=/var/run/postgresql",
        "MARKET_PROVIDER": "alpha-vantage", "MAIL_OUTPUT_DIR": "/var/lib/iipa/mail",
    }
    if any(settings.get(key) != value for key, value in expected.items()):
        raise ValueError("ENV_DEPLOYMENT_MISMATCH")
    if bool(settings.get("GOOGLE_CLIENT_ID")) != bool(settings.get("GOOGLE_CLIENT_SECRET")):
        raise ValueError("ENV_GOOGLE_PARTIAL_CONFIGURATION")
    for key, fallback, minimum, maximum in [("SESSION_HOURS", "24", 1, 168), ("QUOTE_MAX_AGE_HOURS", "72", 1, 720)]:
        value = settings.get(key, fallback)
        if not value.isdigit() or not minimum <= int(value) <= maximum:
            raise ValueError("ENV_NUMERIC_RANGE")


if __name__ == "__main__":
    try:
        if len(sys.argv) != 3:
            raise ValueError("ENV_ARGUMENTS")
        validate(Path(sys.argv[1]).read_text(encoding="utf-8"), sys.argv[2])
        print("PASS: private runtime configuration validated; values suppressed.")
    except Exception:
        print("Runtime configuration rejected; review privately using the runbook. Values suppressed.", file=sys.stderr)
        raise SystemExit(1) from None

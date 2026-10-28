# IFMS analytics foundation

The P1 FastAPI service provides `GET /health` and `GET /ready`, with the service
name and phase in each JSON response. Readiness means this health-only process
can serve requests. It does not attest to market data, database access, trained
models, or any future analytics capability.

This service needs Python 3.13 and uses an installable `src/` package. It has no
required environment variables, API credentials, datasets, or database connection.
FastAPI's `/docs` and `/openapi.json` describe the two health routes.

From `services/analytics`, create a project-local environment and install:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip==26.2.1
.\.venv\Scripts\python.exe -m pip install -e ".[dev]"
.\.venv\Scripts\python.exe -m uvicorn ifms_analytics.app:app --host 127.0.0.1 --port 8001 --reload
```

On Linux/macOS, replace `.\.venv\Scripts\python.exe` with `.venv/bin/python`.
Use port `8001` locally; stop the process with Ctrl+C. The development command
binds to loopback. Configure deployment binding explicitly if a future approved
deployment requires it.

Run validation from the same directory:

```powershell
.\.venv\Scripts\python.exe -m pytest
.\.venv\Scripts\python.exe -m ruff check .
.\.venv\Scripts\python.exe -m ruff format --check .
.\.venv\Scripts\python.exe -m pip check
.\.venv\Scripts\python.exe -m pip_audit --skip-editable --progress-spinner off
```

Direct runtime, development, and build dependencies are pinned in
`pyproject.toml`. Transitive dependencies are resolved by pip during installation.
The development extra also pins patched `certifi` and `filelock` releases so
existing environments do not retain the vulnerable versions found by the audit.
Add a reviewed lock strategy when deployment reproducibility is defined.

Financial and ML endpoints are deferred. Introducing those features requires a
new preflight for their actual dependencies, input validation, authorization,
datasets, and failure behavior.

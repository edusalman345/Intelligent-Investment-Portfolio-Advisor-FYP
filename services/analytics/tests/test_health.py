import asyncio

import httpx
import pytest

from ifms_analytics.app import create_app


def request(method, path, **kwargs):
    async def send():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=create_app()), base_url="http://test"
        ) as client:
            return await client.request(method, path, **kwargs)

    return asyncio.run(send())


@pytest.mark.parametrize(("path", "status"), [("/health", "ok"), ("/ready", "ready")])
def test_health_contract_without_external_configuration(monkeypatch, path, status):
    for name in (
        "DATABASE_URL",
        "OPENAI_API_KEY",
        "ALPHA_VANTAGE_API_KEY",
        "ANALYTICS_API_URL",
    ):
        monkeypatch.delenv(name, raising=False)

    response = request("GET", path)

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/json"
    assert response.headers["cache-control"] == "no-store"
    assert response.json() == {"status": status, "service": "ifms-analytics", "phase": "P1"}


@pytest.mark.parametrize("path", ["/health", "/ready"])
def test_health_endpoints_reject_mutating_requests(path):
    response = request("POST", path, json={"status": "override"})

    assert response.status_code == 405
    assert response.headers["allow"] == "GET"


def test_only_health_and_readiness_are_exposed_as_application_routes():
    schema = request("GET", "/openapi.json").json()
    financial_response = request("GET", "/predict")

    assert set(schema["paths"]) == {"/health", "/ready"}
    assert financial_response.status_code == 404

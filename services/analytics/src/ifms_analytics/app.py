"""Process health for the architectural analytics service foundation."""

from typing import Literal

from fastapi import FastAPI, Response
from pydantic import BaseModel


class ServiceStatus(BaseModel):
    status: Literal["ok", "ready"]
    service: Literal["ifms-analytics"] = "ifms-analytics"
    phase: Literal["P1"] = "P1"


def create_app() -> FastAPI:
    application = FastAPI(
        title="IFMS Analytics Foundation",
        description="P1 process health only. Analytics capabilities are deferred.",
        version="0.1.0",
    )

    @application.get("/health", response_model=ServiceStatus)
    def health(response: Response) -> ServiceStatus:
        response.headers["Cache-Control"] = "no-store"
        return ServiceStatus(status="ok")

    @application.get("/ready", response_model=ServiceStatus)
    def ready(response: Response) -> ServiceStatus:
        # The P1 foundation has no external dependencies to initialize or probe.
        response.headers["Cache-Control"] = "no-store"
        return ServiceStatus(status="ready")

    return application


app = create_app()

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import app


@pytest.mark.parametrize("origin", get_settings().cors_origins)
def test_draft_save_preflight_accepts_put_from_frontend(origin):
    with TestClient(app) as client:
        response = client.options("/student/tasks/2/draft", headers={
            "Origin": origin,
            "Access-Control-Request-Method": "PUT",
            "Access-Control-Request-Headers": "content-type",
        })
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == origin
    assert response.headers["access-control-allow-credentials"] == "true"
    assert "PUT" in response.headers["access-control-allow-methods"].split(", ")


def test_draft_save_preflight_rejects_untrusted_origin():
    with TestClient(app) as client:
        response = client.options("/student/tasks/2/draft", headers={
            "Origin": "https://untrusted.example",
            "Access-Control-Request-Method": "PUT",
            "Access-Control-Request-Headers": "content-type",
        })
    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers

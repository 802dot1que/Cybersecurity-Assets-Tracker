"""Nessus REST API client using stdlib urllib (no extra dependency)."""
import json
import ssl
import urllib.request
import urllib.error

from app.core.config import get_settings


def _request(method: str, path: str, body: dict | None = None) -> dict:
    s = get_settings()
    url = s.NESSUS_URL.rstrip("/") + path
    headers = {
        "X-ApiKeys": f"accessKey={s.NESSUS_ACCESS_KEY}; secretKey={s.NESSUS_SECRET_KEY}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    data = json.dumps(body).encode() if body else None

    ctx = ssl.create_default_context()
    if not s.NESSUS_VERIFY_SSL:
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE

    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
        return json.loads(resp.read())


def get_server_status() -> dict:
    s = get_settings()
    url = s.NESSUS_URL.rstrip("/") + "/server/status"
    headers = {
        "X-ApiKeys": f"accessKey={s.NESSUS_ACCESS_KEY}; secretKey={s.NESSUS_SECRET_KEY}",
        "Accept": "application/json",
    }
    ctx = ssl.create_default_context()
    if not s.NESSUS_VERIFY_SSL:
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=10) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        # Nessus returns 503 with JSON body while loading
        body = e.read()
        try:
            return json.loads(body)
        except Exception:
            raise


def get_server_properties() -> dict:
    return _request("GET", "/server/properties")


def list_scans() -> list[dict]:
    data = _request("GET", "/scans")
    return data.get("scans") or []


def get_scan_detail(scan_id: int) -> dict:
    return _request("GET", f"/scans/{scan_id}")


def get_host_detail(scan_id: int, host_id: int) -> dict:
    return _request("GET", f"/scans/{scan_id}/hosts/{host_id}")

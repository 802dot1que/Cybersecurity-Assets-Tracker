from datetime import datetime
from pydantic import BaseModel


class VulnerabilityOut(BaseModel):
    id: int
    asset_id: int | None
    plugin_id: int
    plugin_name: str
    plugin_family: str | None
    severity: str
    severity_id: int
    cvss_score: float | None
    cvss_v3_score: float | None
    cve_id: str | None
    description: str | None
    solution: str | None
    port: int | None
    protocol: str | None
    service: str | None
    nessus_hostname: str | None
    nessus_ip: str | None
    source_scan_id: int
    first_seen: datetime
    last_seen: datetime

    model_config = {"from_attributes": True}


class SyncLogOut(BaseModel):
    id: int
    started_at: datetime
    finished_at: datetime | None
    status: str
    scan_id: int | None
    scans_processed: int
    assets_matched: int
    vulns_created: int
    vulns_updated: int
    error: str | None

    model_config = {"from_attributes": True}


class NessusScanOut(BaseModel):
    id: int
    name: str
    status: str
    folder_id: int | None
    last_modification_date: int | None
    creation_date: int | None
    type: str | None


class NessusStatusOut(BaseModel):
    connected: bool
    status: str | None
    code: str | int | None
    error: str | None


class VulnPage(BaseModel):
    items: list[VulnerabilityOut]
    total: int
    page: int
    page_size: int
    total_pages: int

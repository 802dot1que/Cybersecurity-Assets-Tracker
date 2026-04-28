from __future__ import annotations
from datetime import date, datetime
from typing import Any
from pydantic import BaseModel, Field


class FieldValue(BaseModel):
    """Serializer for an overridable field — exposes system + override + effective."""
    system: Any = None
    override: Any = None
    effective: Any = None
    overridden: bool = False
    overridden_by: int | None = None
    overridden_at: datetime | None = None


class AssetIPOut(BaseModel):
    id: int
    ip: str
    is_override: bool = False
    source: str | None = None
    first_seen: datetime | None = None
    last_seen: datetime | None = None


class ControlOut(BaseModel):
    code: str
    name: str
    applicable: bool
    system_status: str | None = None
    override_status: str | None = None
    effective_status: str
    last_check_in: datetime | None = None
    source: str | None = None


class CriticalityOut(BaseModel):
    level: str | None = None
    score: int | None = None
    source: str | None = None
    details: dict = Field(default_factory=dict)


class ConflictOut(BaseModel):
    id: int
    field: str
    value_a: str | None = None
    value_b: str | None = None
    source_a: str | None = None
    source_b: str | None = None
    created_at: datetime


class AssetOut(BaseModel):
    id: int
    uuid: str
    hostname: FieldValue
    mac: FieldValue
    asset_type: FieldValue
    os: FieldValue
    os_version: FieldValue
    os_eos: FieldValue
    asset_status: FieldValue
    environment: FieldValue
    location: FieldValue
    function: FieldValue
    custodian: FieldValue
    user_name: FieldValue
    os_license_state: FieldValue
    edr_license_state: FieldValue
    av_license_state: FieldValue
    ips: list[AssetIPOut]
    first_seen: datetime | None
    last_seen: datetime | None
    confidence_score: float
    controls: list[ControlOut] = []
    criticality: CriticalityOut | None = None
    conflict_count: int = 0
    conflicts: list[ConflictOut] = []


class AssetListItem(BaseModel):
    id: int
    uuid: str
    hostname: str | None = None
    mac: str | None = None
    asset_type: str | None = None
    os: str | None = None
    os_version: str | None = None
    os_eos: date | None = None
    asset_status: str | None = None
    environment: str | None = None
    location: str | None = None
    function: str | None = None
    custodian: str | None = None
    user_name: str | None = None
    ips: list[str] = []
    last_seen: datetime | None = None
    criticality_level: str | None = None
    confidence_score: float = 0.0
    conflict_count: int = 0


class AssetPage(BaseModel):
    items: list[AssetListItem]
    total: int
    page: int
    page_size: int
    total_pages: int


class OverridePayload(BaseModel):
    value: Any | None = None


class ControlUpdatePayload(BaseModel):
    override_status: str | None = None  # Installed|Missing|Unknown|null to clear
    last_check_in: datetime | None = None
    source: str | None = None


class ManualCriticalityPayload(BaseModel):
    level: str
    score: int = Field(ge=0, le=100)


class AddIPPayload(BaseModel):
    ip: str

class EditIPPayload(BaseModel):
    ip: str


class CreateAssetPayload(BaseModel):
    hostname: str | None = None
    mac: str | None = None
    asset_type: str | None = None
    os: str | None = None
    os_version: str | None = None
    asset_status: str | None = None
    environment: str | None = None
    location: str | None = None
    function: str | None = None
    custodian: str | None = None
    user_name: str | None = None
    ips: list[str] = Field(default_factory=list)


class BulkDeletePayload(BaseModel):
    ids: list[int]

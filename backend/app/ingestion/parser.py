"""Excel parsing + column auto-suggestion."""
from __future__ import annotations
from io import BytesIO
from typing import Any

import pandas as pd
from rapidfuzz import fuzz, process

from app.ingestion.normalize import CANONICAL_FIELDS, FIELD_NORMALIZERS, split_ips

# Known aliases per canonical field — drives auto-mapping suggestions.
FIELD_ALIASES: dict[str, list[str]] = {
    "hostname":   ["hostname", "host name", "device name", "computer name", "dns name", "name"],
    "mac":        ["mac", "mac address", "hardware address", "physical address"],
    "ips":        ["ip", "ip address", "ipv4", "ip addresses", "addresses"],
    "asset_type": ["type", "asset type", "device type", "category", "class"],
    "os":         ["os", "operating system", "platform"],
    "os_version": ["os version", "version", "build"],
    "os_eos":     ["eos", "end of support", "os eos", "eol", "end of life"],
    "first_seen": ["first seen", "created", "discovered"],
    "last_seen":  ["last seen", "last check-in", "last active"],
}


def read_excel(content: bytes, sheet: str | int | None = 0) -> pd.DataFrame:
    df = pd.read_excel(BytesIO(content), sheet_name=sheet, dtype=object)
    df.columns = [str(c).strip() for c in df.columns]
    return df


def suggest_mapping(columns: list[str]) -> dict[str, str | None]:
    """Suggest canonical_field -> excel_column."""
    out: dict[str, str | None] = {}
    lower_cols = {c.lower(): c for c in columns}
    for field, aliases in FIELD_ALIASES.items():
        best: tuple[str, float] | None = None
        for alias in aliases:
            match = process.extractOne(
                alias, list(lower_cols.keys()), scorer=fuzz.token_set_ratio
            )
            if match and (best is None or match[1] > best[1]):
                best = (lower_cols[match[0]], match[1])
        out[field] = best[0] if best and best[1] >= 80 else None
    return out


def normalize_row(raw: dict[str, Any], mapping: dict[str, str]) -> dict[str, Any]:
    """Apply mapping + normalizers to one raw row."""
    normalized: dict[str, Any] = {}
    for field in CANONICAL_FIELDS:
        src = mapping.get(field)
        if not src:
            continue
        val = raw.get(src)
        if field == "ips":
            normalized["ips"] = split_ips(val)
        else:
            fn = FIELD_NORMALIZERS.get(field)
            normalized[field] = fn(val) if fn else val
    return normalized

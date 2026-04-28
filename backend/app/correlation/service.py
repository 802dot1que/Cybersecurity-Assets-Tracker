"""Asset correlation: MAC exact → hostname+IP exact → FQDN .darf.com match.

Strict matching only — no fuzzy. Duplicates are only flagged when:
  1. MAC matches exactly, OR
  2. Hostname matches exactly AND at least one IP overlaps, OR
  3. One hostname is an FQDN ending in .darf.com and the base matches the other.
"""
from __future__ import annotations
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.assets.models import Asset, AssetIP

_DARF_SUFFIX = ".darf.com"


class AmbiguousMatch(Exception):
    def __init__(self, candidates):
        self.candidates = candidates


def _norm(host: str) -> str:
    """Lowercase + strip whitespace."""
    return host.strip().lower()


def _strip_darf(host: str) -> str:
    """Strip .darf.com suffix to get base hostname."""
    return host[: -len(_DARF_SUFFIX)] if host.endswith(_DARF_SUFFIX) else host


def _fqdn_base_match(a: str, b: str) -> bool:
    """True if one is a .darf.com FQDN and its base equals the other (normalized).

    hq-sls-lr1y.darf.com  ==  hq-sls-lr1y  → True
    hq-sls-lr1y.darf.com  ==  hq-sls-lr1v  → False
    neither is a .darf.com FQDN             → False
    """
    a_is_fqdn = a.endswith(_DARF_SUFFIX)
    b_is_fqdn = b.endswith(_DARF_SUFFIX)
    if a_is_fqdn and not b_is_fqdn:
        return _strip_darf(a) == b
    if b_is_fqdn and not a_is_fqdn:
        return _strip_darf(b) == a
    # Both are FQDNs → require exact match (handled upstream by hostname exact path)
    return False


def _asset_ips(asset: Asset) -> set[str]:
    return {i.ip for i in asset.ips}


def correlate(db: Session, normalized: dict[str, Any]) -> tuple[Asset, float] | None:
    mac  = normalized.get("mac")
    host = normalized.get("hostname")
    ips  = set(normalized.get("ips") or [])

    # 1) MAC exact — strongest signal, no IP required.
    if mac:
        a = db.scalar(select(Asset).where(Asset.system_mac == mac))
        if a is None:
            a = db.scalar(select(Asset).where(Asset.override_mac == mac))
        if a is not None:
            return a, 1.0

    # 2) Hostname exact + at least one IP overlap.
    if host and ips:
        host_norm = _norm(host)
        candidates = db.scalars(
            select(Asset).where(
                (Asset.system_hostname == host_norm) | (Asset.override_hostname == host_norm)
            )
        ).all()
        for c in candidates:
            if _asset_ips(c) & ips:
                return c, 0.95

    # 3) FQDN / base hostname match (.darf.com).
    #    One side must end with .darf.com; bases must match exactly.
    if host:
        host_norm = _norm(host)
        all_assets = db.scalars(select(Asset).where(Asset.system_hostname.is_not(None))).all()
        for c in all_assets:
            existing = c.effective("hostname")
            if not existing:
                continue
            existing_norm = _norm(existing)
            if _fqdn_base_match(host_norm, existing_norm):
                return c, 0.90

    return None

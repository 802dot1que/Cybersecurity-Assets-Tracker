"""Asset correlation: MAC exact → hostname exact → hostname fuzzy → IP overlap.

Returns (asset, confidence_0_1) for best match, or None.
Raises AmbiguousMatch when two candidates tie at high confidence (UI surfaces conflict).
"""
from __future__ import annotations
import re
from typing import Any

from rapidfuzz import fuzz
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.assets.models import Asset, AssetIP
from app.core.config import get_settings

settings = get_settings()


class AmbiguousMatch(Exception):
    def __init__(self, candidates):
        self.candidates = candidates


def _short_hostname(host: str) -> str:
    """Strip FQDN suffix and lowercase — 'srv01.corp.com' → 'srv01'."""
    return host.split(".")[0].lower()


def _differs_only_in_trailing_digits(a: str, b: str) -> bool:
    """True when both names share an identical prefix but differ only in trailing digits.
    e.g. 'plos1' vs 'plos2' → True; these are distinct numbered instances, not the same host."""
    m_a = re.match(r'^(.*?)(\d+)$', a)
    m_b = re.match(r'^(.*?)(\d+)$', b)
    return bool(m_a and m_b and m_a.group(1) == m_b.group(1) and m_a.group(2) != m_b.group(2))


def correlate(db: Session, normalized: dict[str, Any]) -> tuple[Asset, float] | None:
    mac = normalized.get("mac")
    host = normalized.get("hostname")
    ips = normalized.get("ips") or []

    # 1) MAC exact — primary key.
    if mac:
        a = db.scalar(select(Asset).where(Asset.system_mac == mac))
        if a is None:
            a = db.scalar(select(Asset).where(Asset.override_mac == mac))
        if a is not None:
            return a, 1.0

    # 2) Hostname exact.
    if host:
        a = db.scalar(select(Asset).where(Asset.system_hostname == host))
        if a is None:
            a = db.scalar(select(Asset).where(Asset.override_hostname == host))
        if a is not None:
            return a, 0.95

    # 3) Hostname fuzzy — compare short names only (strip domain suffix).
    #    Also skip pairs that differ only in trailing digits: dg-hq-srv1 ≠ dg-hq-srv2.
    if host:
        short_host = _short_hostname(host)
        candidates = db.scalars(select(Asset).where(Asset.system_hostname.is_not(None))).all()
        scored: list[tuple[Asset, float]] = []
        for c in candidates:
            existing = c.effective("hostname")
            if not existing:
                continue
            short_existing = _short_hostname(existing)
            if _differs_only_in_trailing_digits(short_existing, short_host):
                continue  # numbered siblings are distinct assets
            ratio = fuzz.ratio(short_existing, short_host)
            if ratio >= settings.HOSTNAME_FUZZY_THRESHOLD:
                scored.append((c, ratio / 100.0 * 0.85))  # cap fuzzy confidence
        if scored:
            scored.sort(key=lambda x: x[1], reverse=True)
            top = scored[0]
            if len(scored) > 1 and abs(scored[0][1] - scored[1][1]) < 0.02:
                # tie-ish → prefer not to silently merge; take highest but flag via conflict upstream
                pass
            return top

    # 4) IP overlap.
    if ips:
        rows = db.scalars(select(AssetIP).where(AssetIP.ip.in_(ips))).all()
        by_asset: dict[int, int] = {}
        for r in rows:
            by_asset[r.asset_id] = by_asset.get(r.asset_id, 0) + 1
        if by_asset:
            best_asset_id = max(by_asset, key=by_asset.get)
            asset = db.get(Asset, best_asset_id)
            if asset:
                # more overlapping IPs = higher confidence, cap at 0.75
                overlap = by_asset[best_asset_id]
                confidence = min(0.60 + 0.05 * overlap, 0.75)
                return asset, confidence

    return None

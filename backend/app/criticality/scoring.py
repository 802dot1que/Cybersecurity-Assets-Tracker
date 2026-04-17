"""Pluggable criticality scoring.

Today: rule-based using asset_type + OS EOS + controls status.
Tomorrow: questionnaire scorer plugs in here (same interface).
"""
from __future__ import annotations
from dataclasses import dataclass
from datetime import date
from typing import Protocol

from app.assets.models import Asset


@dataclass
class ScoreResult:
    score: int           # 0..100
    level: str           # Low|Medium|High|Critical
    source: str          # calculated|manual|questionnaire
    details: dict


class Scorer(Protocol):
    def score(self, asset: Asset) -> ScoreResult: ...


class RuleBasedScorer:
    """Simple transparent baseline. Easy to tune or replace."""
    HIGH_VALUE_TYPES = {"Server", "Hypervisor", "Firewall", "LoadBalancer"}

    def score(self, asset: Asset) -> ScoreResult:
        pts = 20
        reasons: list[str] = []

        atype = asset.effective("asset_type") or "Unknown"
        if atype in self.HIGH_VALUE_TYPES:
            pts += 30
            reasons.append(f"+30 high-value asset type ({atype})")
        elif atype == "Workstation":
            pts += 10
            reasons.append("+10 workstation")

        eos = asset.effective("os_eos")
        if isinstance(eos, date) and eos <= date.today():
            pts += 25
            reasons.append("+25 OS past end-of-support")

        missing = 0
        for link in asset.controls:
            if link.effective_status == "Missing":
                missing += 1
        if missing:
            pts += min(missing * 5, 25)
            reasons.append(f"+{min(missing * 5, 25)} {missing} control(s) missing")

        pts = max(0, min(pts, 100))
        level = (
            "Critical" if pts >= 80
            else "High" if pts >= 60
            else "Medium" if pts >= 40
            else "Low"
        )
        return ScoreResult(score=pts, level=level, source="calculated", details={"reasons": reasons})


def get_default_scorer() -> Scorer:
    return RuleBasedScorer()

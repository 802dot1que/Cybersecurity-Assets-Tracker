"""Pluggable criticality scoring.

Two scorers:
  RuleBasedScorer   – automatic, uses asset_type + OS EOS + environment + controls.
  QuestionnaireScorer – manual CIA-triad questionnaire answers stored in details.
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
    """Transparent rule-based baseline. Weights:
      +20 baseline
      +30 high-value asset type (Server/Hypervisor/Firewall/LoadBalancer)
      +10 workstation
      +20 production environment
      +25 OS past end-of-support
      +5 per missing applicable control (max +25)
    Max possible: 120 → capped at 100.
    """
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

        env = asset.effective("environment") or ""
        if env == "Production":
            pts += 20
            reasons.append("+20 production environment")

        eos = asset.effective("os_eos")
        if isinstance(eos, date) and eos <= date.today():
            pts += 25
            reasons.append("+25 OS past end-of-support")

        missing = sum(1 for link in asset.controls if link.effective_status == "Missing")
        if missing:
            add = min(missing * 5, 25)
            pts += add
            reasons.append(f"+{add} {missing} control(s) missing")

        pts = max(0, min(pts, 100))
        level = _level(pts)
        return ScoreResult(score=pts, level=level, source="calculated", details={"reasons": reasons})


class QuestionnaireScorer:
    """Scores from CIA-triad questionnaire answers.

    Expected answers dict keys (all int 1–3 unless noted):
      confidentiality  – 1 Low / 2 Medium / 3 High
      integrity        – 1 Low / 2 Medium / 3 High
      availability     – 1 Low / 2 Medium / 3 High
      is_production    – bool
      business_impact  – "Critical" | "High" | "Medium" | "Low"

    Scoring:
      max(C, I, A) * 10           → 10–30
      is_production: +20
      business_impact: Critical+30, High+20, Medium+10, Low+0
      baseline: +10
    Max: 10 + 30 + 20 + 30 = 90 (plus baseline 10 = 100)
    """

    BUSINESS_WEIGHTS = {"Critical": 30, "High": 20, "Medium": 10, "Low": 0}

    def score_from_answers(self, answers: dict) -> ScoreResult:
        pts = 10
        reasons: list[str] = ["+10 baseline"]

        c = int(answers.get("confidentiality", 1))
        i = int(answers.get("integrity", 1))
        a = int(answers.get("availability", 1))
        cia_max = max(c, i, a)
        cia_pts = cia_max * 10
        pts += cia_pts
        reasons.append(f"+{cia_pts} CIA triad (C={c} I={i} A={a}, max={cia_max})")

        if answers.get("is_production"):
            pts += 20
            reasons.append("+20 production system")

        biz = answers.get("business_impact", "Low")
        biz_pts = self.BUSINESS_WEIGHTS.get(biz, 0)
        if biz_pts:
            pts += biz_pts
            reasons.append(f"+{biz_pts} business impact ({biz})")

        pts = max(0, min(pts, 100))
        return ScoreResult(
            score=pts, level=_level(pts), source="questionnaire",
            details={"reasons": reasons, "answers": answers},
        )

    def score(self, asset: Asset) -> ScoreResult:
        answers = (asset.criticality.details or {}).get("answers", {}) if asset.criticality else {}
        return self.score_from_answers(answers)


def _level(pts: int) -> str:
    if pts >= 80:
        return "Critical"
    if pts >= 60:
        return "High"
    if pts >= 40:
        return "Medium"
    return "Low"


def get_default_scorer() -> Scorer:
    return RuleBasedScorer()


def get_questionnaire_scorer() -> QuestionnaireScorer:
    return QuestionnaireScorer()

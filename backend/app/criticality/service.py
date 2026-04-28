from sqlalchemy.orm import Session

from app.assets.models import Asset, AssetCriticality
from app.criticality.scoring import get_default_scorer, get_questionnaire_scorer


def recompute(db: Session, asset: Asset) -> AssetCriticality | None:
    # Decommissioned assets have no criticality score
    if asset.effective("asset_status") == "Decommissioned":
        if asset.criticality is not None:
            db.delete(asset.criticality)
        return None

    result = get_default_scorer().score(asset)
    row = asset.criticality
    if row is None:
        row = AssetCriticality(asset_id=asset.id)
        db.add(row)
    if row.source == "manual":
        return row
    row.level = result.level
    row.score = result.score
    row.source = result.source
    row.details = result.details
    return row


def set_manual(
    db: Session, asset: Asset, *, level: str, score: int, user_id: int
) -> AssetCriticality:
    row = asset.criticality
    if row is None:
        row = AssetCriticality(asset_id=asset.id)
        db.add(row)
    row.level = level
    row.score = score
    row.source = "manual"
    row.updated_by = user_id
    return row


def score_from_questionnaire(
    db: Session, asset: Asset, *, answers: dict, user_id: int
) -> AssetCriticality:
    """Compute and persist criticality from CIA questionnaire answers."""
    result = get_questionnaire_scorer().score_from_answers(answers)
    row = asset.criticality
    if row is None:
        row = AssetCriticality(asset_id=asset.id)
        db.add(row)
    row.level = result.level
    row.score = result.score
    row.source = "questionnaire"
    row.details = result.details
    row.updated_by = user_id
    return row

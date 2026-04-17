from sqlalchemy.orm import Session

from app.assets.models import Asset, AssetCriticality
from app.criticality.scoring import get_default_scorer


def recompute(db: Session, asset: Asset) -> AssetCriticality:
    result = get_default_scorer().score(asset)
    row = asset.criticality
    if row is None:
        row = AssetCriticality(asset_id=asset.id)
        db.add(row)
    if row.source == "manual":
        # Don't overwrite manual overrides.
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

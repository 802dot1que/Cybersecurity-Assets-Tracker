"""Pulls data from Nessus, correlates with assets, upserts vulnerabilities."""
import uuid as _uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session
from sqlalchemy import select, and_

from app.nessus import client as nessus
from app.nessus.models import Vulnerability, NessusSyncLog
from app.assets.models import Asset, AssetIP

SEVERITY_MAP = {0: "info", 1: "low", 2: "medium", 3: "high", 4: "critical"}


def _find_asset(db: Session, ip: str | None, hostname: str | None) -> Asset | None:
    if ip:
        row = db.execute(
            select(AssetIP).where(AssetIP.ip == ip)
        ).scalars().first()
        if row:
            return db.get(Asset, row.asset_id)

    if hostname:
        hn = hostname.lower().split(".")[0]
        row = db.execute(
            select(Asset).where(Asset.system_hostname == hn)
        ).scalars().first()
        if row:
            return row

    return None


def _create_asset_from_nessus(
    db: Session, host_ip: str | None, host_name: str | None,
    info: dict, now: datetime
) -> Asset:
    os_raw = info.get("operating-system")
    mac_raw = (info.get("mac-address") or "").split("\n")[0].strip() or None

    asset = Asset(
        uuid=str(_uuid.uuid4()),
        system_hostname=host_name or host_ip,
        system_asset_type="Unknown",
        system_os=os_raw,
        system_mac=mac_raw,
        first_seen=now,
        last_seen=now,
    )
    db.add(asset)
    db.flush()
    if host_ip:
        db.add(AssetIP(asset_id=asset.id, ip=host_ip, source="nessus", first_seen=now, last_seen=now))
    return asset


def _upsert_vuln(
    db: Session,
    scan_id: int,
    host_id: int,
    host_ip: str | None,
    host_name: str | None,
    asset: Asset | None,
    plugin: dict,
) -> tuple[bool, bool]:
    """Return (created, updated)."""
    plugin_id = plugin.get("plugin_id") or 0
    severity_id = plugin.get("severity", 0)

    existing = db.execute(
        select(Vulnerability).where(
            and_(
                Vulnerability.source_scan_id == scan_id,
                Vulnerability.source_host_id == host_id,
                Vulnerability.plugin_id == plugin_id,
            )
        )
    ).scalars().first()

    now = datetime.now(timezone.utc).replace(tzinfo=None)

    if existing:
        existing.last_seen = now
        existing.severity_id = severity_id
        existing.severity = SEVERITY_MAP.get(severity_id, "info")
        existing.asset_id = asset.id if asset else None
        return False, True

    vuln = Vulnerability(
        asset_id=asset.id if asset else None,
        plugin_id=plugin_id,
        plugin_name=plugin.get("plugin_name") or "",
        plugin_family=plugin.get("plugin_family"),
        severity=SEVERITY_MAP.get(severity_id, "info"),
        severity_id=severity_id,
        cvss_score=None,
        cvss_v3_score=None,
        cve_id=None,
        description=None,
        solution=None,
        see_also=None,
        port=plugin.get("port"),
        protocol=plugin.get("protocol"),
        service=plugin.get("svc_name"),
        source_scan_id=scan_id,
        source_host_id=host_id,
        nessus_hostname=host_name,
        nessus_ip=host_ip,
        first_seen=now,
        last_seen=now,
    )
    db.add(vuln)
    return True, False


def sync_scan(db: Session, log: NessusSyncLog, scan_id: int) -> None:
    detail = nessus.get_scan_detail(scan_id)
    hosts = detail.get("hosts") or []

    for host in hosts:
        host_id = host.get("host_id") or host.get("id")

        # Fetch host detail first — "info" dict has the real IP, FQDN, OS, MAC
        host_detail = nessus.get_host_detail(scan_id, host_id)
        info = host_detail.get("info") or {}

        # For agent scans host["hostname"] is the short name, not the IP
        host_ip = info.get("host-ip") or host.get("hostname")
        host_name = info.get("host-fqdn") or info.get("netbios-name") or host.get("hostname")

        now = datetime.now(timezone.utc).replace(tzinfo=None)
        asset = _find_asset(db, host_ip, host_name)

        if asset:
            log.assets_matched += 1
            asset.last_seen = now
        else:
            asset = _create_asset_from_nessus(db, host_ip, host_name, info, now)
            log.assets_matched += 1

        vulnerabilities = host_detail.get("vulnerabilities") or []
        for plugin in vulnerabilities:
            created, updated = _upsert_vuln(
                db, scan_id, host_id, host_ip, host_name, asset, plugin
            )
            if created:
                log.vulns_created += 1
            elif updated:
                log.vulns_updated += 1

    db.flush()


def run_full_sync(db: Session, scan_id: int | None = None) -> NessusSyncLog:
    log = NessusSyncLog(started_at=datetime.now(timezone.utc).replace(tzinfo=None))
    db.add(log)
    db.flush()

    try:
        if scan_id is not None:
            log.scan_id = scan_id
            sync_scan(db, log, scan_id)
            log.scans_processed = 1
        else:
            scans = nessus.list_scans()
            completed = [s for s in scans if s.get("status") in ("completed", "imported")]
            for s in completed:
                sync_scan(db, log, s["id"])
                log.scans_processed += 1

        log.status = "completed"
    except Exception as exc:
        log.status = "failed"
        log.error = str(exc)
        raise
    finally:
        log.finished_at = datetime.now(timezone.utc).replace(tzinfo=None)
        db.commit()

    return log

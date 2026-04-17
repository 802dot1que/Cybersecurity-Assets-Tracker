"""Value normalization — hostname casing, MAC formatting, IPv4 validation, date parsing.

IPv6 is explicitly dropped per spec.
"""
from __future__ import annotations
import re
from datetime import datetime, date

_MAC_CLEAN = re.compile(r"[^0-9A-Fa-f]")
_IPV4 = re.compile(r"^(\d{1,3}\.){3}\d{1,3}$")


def norm_hostname(v) -> str | None:
    if v in (None, "", "nan"):
        return None
    s = str(v).strip().lower()
    # strip common domain suffix noise? keep as-is for now; user can override.
    return s or None


def norm_mac(v) -> str | None:
    if v in (None, "", "nan"):
        return None
    hex_only = _MAC_CLEAN.sub("", str(v)).upper()
    if len(hex_only) != 12:
        return None
    return ":".join(hex_only[i:i + 2] for i in range(0, 12, 2))


def norm_ipv4(v) -> str | None:
    if v in (None, "", "nan"):
        return None
    s = str(v).strip()
    if ":" in s:  # drop IPv6
        return None
    if not _IPV4.match(s):
        return None
    parts = [int(p) for p in s.split(".")]
    if any(p < 0 or p > 255 for p in parts):
        return None
    return s


def split_ips(v) -> list[str]:
    """Accept 'a,b;c d' style multi-IP cells, return deduped IPv4 list."""
    if v in (None, "",):
        return []
    raw = re.split(r"[,;\s]+", str(v))
    out: list[str] = []
    for r in raw:
        ip = norm_ipv4(r)
        if ip and ip not in out:
            out.append(ip)
    return out


def norm_asset_type(v) -> str | None:
    if v in (None, "", "nan"):
        return None
    s = str(v).strip().lower().replace(" ", "").replace("-", "").replace("_", "")
    aliases = {
        "server": "Server",
        "workstation": "Workstation",
        "pc": "Workstation",
        "desktop": "Workstation",
        "laptop": "Workstation",
        "ipphone": "IPPhone",
        "phone": "IPPhone",
        "router": "Router",
        "switch": "Switch",
        "printer": "Printer",
        "ipcamera": "IPCamera",
        "ipcam": "IPCamera",
        "camera": "IPCamera",
        "firewall": "Firewall",
        "fw": "Firewall",
        "hypervisor": "Hypervisor",
        "esxi": "Hypervisor",
        "url": "URL",
        "loadbalancer": "LoadBalancer",
        "lb": "LoadBalancer",
    }
    return aliases.get(s, "Unknown")


def norm_date(v) -> date | None:
    if v in (None, "", "nan"):
        return None
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    s = str(v).strip()
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y", "%Y/%m/%d", "%b %Y", "%B %Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


FIELD_NORMALIZERS = {
    "hostname": norm_hostname,
    "mac": norm_mac,
    "asset_type": norm_asset_type,
    "os": lambda v: str(v).strip() if v not in (None, "", "nan") else None,
    "os_version": lambda v: str(v).strip() if v not in (None, "", "nan") else None,
    "os_eos": norm_date,
    "first_seen": norm_date,
    "last_seen": norm_date,
}

# Canonical destination fields we care to ingest.
CANONICAL_FIELDS = [
    "hostname", "mac", "ips",
    "asset_type", "os", "os_version", "os_eos",
    "first_seen", "last_seen",
]

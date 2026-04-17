"""Asset-type constants + control applicability matrix.

Keeps business rules in one place. If you add a new asset type or control,
edit it here + seed `control_types.applies_to_asset_types`.
"""

# Asset type catalog. Extend freely.
ASSET_TYPES: list[str] = [
    "Server",
    "Workstation",
    "IPPhone",
    "Router",
    "Switch",
    "Printer",
    "IPCamera",
    "Firewall",
    "Hypervisor",
    "URL",
    "LoadBalancer",
    "Database",
    "Unknown",
]

# Groups used to express applicability concisely.
NETWORK_GEAR = {"Router", "Switch", "IPPhone", "IPCamera", "Printer"}
ENDPOINT_LIKE = {"Server", "Workstation", "Hypervisor"}
APPLIANCE = {"Firewall", "LoadBalancer"}
DATABASE = {"Database"}

# The canonical applicability matrix. True = the control is expected on this asset type.
# Used to:
#   - hide inapplicable controls in the UI
#   - exclude them from "missing controls" coverage metrics
#
# Rules from spec:
#   - PAM excluded on Workstations.
#   - Only SIEM + PAM apply to Routers/Switches/IPPhones/IPCameras/Printers.
#   - Database: all endpoint controls apply plus PAM (no Workstation exclusion needed).
CONTROL_APPLICABILITY: dict[str, set[str]] = {
    "EDR":   ENDPOINT_LIKE | DATABASE,
    "AV":    ENDPOINT_LIKE | DATABASE,
    "PATCH": ENDPOINT_LIKE | DATABASE,
    "DLP":   ENDPOINT_LIKE | DATABASE,
    "VA":    ENDPOINT_LIKE | DATABASE,
    "SIEM":  ENDPOINT_LIKE | NETWORK_GEAR | APPLIANCE | DATABASE,
    "PAM":   (ENDPOINT_LIKE - {"Workstation"}) | NETWORK_GEAR | APPLIANCE | DATABASE,
}


def control_applies(control_code: str, asset_type: str) -> bool:
    allowed = CONTROL_APPLICABILITY.get(control_code)
    if allowed is None:
        # Unknown control code — default open (admins can restrict via DB later).
        return True
    return asset_type in allowed


CONTROL_STATUS = ("Installed", "Missing", "Unknown")
CRITICALITY_LEVELS = ("Low", "Medium", "High", "Critical")

ASSET_STATUS_VALUES = ("Operational", "Decommissioned", "In Store")
ENVIRONMENT_VALUES = ("Production", "Staging", "UAT", "DEV", "User")

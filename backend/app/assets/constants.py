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
    "Unknown",
]

# Groups used to express applicability concisely.
NETWORK_GEAR = {"Router", "Switch", "IPPhone", "IPCamera", "Printer"}
ENDPOINT_LIKE = {"Server", "Workstation", "Hypervisor"}
APPLIANCE = {"Firewall", "LoadBalancer"}

# The canonical applicability matrix. True = the control is expected on this asset type.
# Used to:
#   - hide inapplicable controls in the UI
#   - exclude them from "missing controls" coverage metrics
#
# Rules from spec:
#   - PAM excluded on Workstations.
#   - Only SIEM + PAM apply to Routers/Switches/IPPhones/IPCameras/Printers.
CONTROL_APPLICABILITY: dict[str, set[str]] = {
    "EDR":   ENDPOINT_LIKE,
    "AV":    ENDPOINT_LIKE,
    "PATCH": ENDPOINT_LIKE,
    "DLP":   ENDPOINT_LIKE,
    "VA":    ENDPOINT_LIKE,
    "SIEM":  ENDPOINT_LIKE | NETWORK_GEAR | APPLIANCE,
    "PAM":   (ENDPOINT_LIKE - {"Workstation"}) | NETWORK_GEAR | APPLIANCE,
}


def control_applies(control_code: str, asset_type: str) -> bool:
    allowed = CONTROL_APPLICABILITY.get(control_code)
    if allowed is None:
        # Unknown control code — default open (admins can restrict via DB later).
        return True
    return asset_type in allowed


CONTROL_STATUS = ("Installed", "Missing", "Unknown")
CRITICALITY_LEVELS = ("Low", "Medium", "High", "Critical")

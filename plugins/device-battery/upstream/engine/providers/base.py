"""Common types shared by the battery providers."""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import List, Optional

log = logging.getLogger("halo_battery")


@dataclass
class DeviceStatus:
    key: str                     # stable device identifier (one tray icon per key)
    name: str                    # human-readable name
    level: Optional[int] = None  # 0..100, None = unknown
    charging: bool = False
    online: bool = True          # False = receiver present, but the device is asleep/off
    source: str = ""             # razer / wlmouse / logitech / steelseries / bluetooth / xinput
    approx: str = ""             # set when the device only reports coarse levels,
                                 # e.g. "about 55% (medium)"; shown instead of "NN%"
    kind: str = ""               # headset / mouse / keyboard / gamepad when known
                                 # (picks the pictogram); "" = guess from the source
    via: str = ""                # "bluetooth": a controller connected over Bluetooth
    wake_on_input: bool = False  # True: a greyed reading that new input can refresh (a
                                 # sleeping receiver mouse wakes on movement). The
                                 # tray's input wake fires only for these - an icon
                                 # greyed because its device is off must not re-poll
                                 # the app on every keystroke (review, #202).
    # Added by MyFinder. Protocol fixtures keep their original fields; these
    # describe evidence and must not be inferred merely from a non-empty value.
    cached: bool = False
    source_quality: str = "device_reply"
    measured_at_utc: Optional[str] = None
    queried_at_utc: Optional[str] = None
    connection_known: Optional[bool] = None  # None: a reply proves online; silence proves neither sleep nor off
    charging_known: Optional[bool] = None
    physical_id: str = ""        # local-only grouping evidence; never exported raw
    legacy_key: str = ""         # exact former key, not a name/PID based migration
    unit_id: str = ""            # optional proven cross-provider slot/unit identity
    refresh_scope: str = ""      # device only when this reader queries one unit
    dpi: Optional[dict] = None   # independently timestamped public DPI evidence
    dpi_target: Optional[dict] = None  # internal exact identity; never public JSON
    model_source: str = "builtin"  # definition provenance; source stays the provider
    pack_version: Optional[int] = None
    verification_level: str = ""   # pack row's evidence level, defaults to C
    model_reference: str = ""      # pack's issue/evidence reference, not a command
    level_unavailable: bool = False  # explicit reply invalidates any old percentage
    unconfirmed: bool = False    # the reported battery field still needs hardware validation


class Provider:
    """A provider knows how to find its devices and read their battery level."""
    name = "base"

    def poll(self) -> List[DeviceStatus]:
        raise NotImplementedError

    def diagnostics(self) -> List[str]:
        return []


def hexdump(data, limit: int = 32) -> str:
    if data is None:
        return "None"
    return " ".join(f"{b:02x}" for b in list(data)[:limit])

"""Lingbao M1 Pro battery candidate from this repository's issues #171/#95.

Contributor frames are grade C, pending maintainer hardware validation.
Only one descriptor-proven Feature 0F/33 is fetched; no device commands.
Receiver replies do not prove RF freshness, mouse connectivity or sample time.
"""
try:
    import hid
except ImportError:  # pragma: no cover
    hid = None

from . import hidlist
from .base import DeviceStatus, Provider

VID = 0x088D
PIDS = {0x052F: "Lingbao M1 Pro"}
PRODUCT = "Wireless-Receiver"
REPORT_ID = 0x0F
REPORT_BYTES = 33


def _valid_reply(reply):
    return (isinstance(reply, (bytes, bytearray, list, tuple))
            and len(reply) == REPORT_BYTES
            and all(type(n) is int and 0 <= n <= 255 for n in reply)
            and reply[0] == REPORT_ID
            and list(reply[7:11]) == [0x4D, 0x35, 0x33, 0x36]
            and list(reply[13:15]) == [0x4C, 0x58])


def parse_reply(reply):
    # Flag 1 carries a charging placeholder, not a newly measured percentage.
    # Neither header echoes nor byte 21 have an established state contract.
    if not _valid_reply(reply) or reply[19] != 0 or not 1 <= reply[18] <= 100:
        return None
    return reply[18], False, ""


class LingbaoProvider(Provider):
    name = "lingbao"

    def __init__(self):
        self._diag = []

    def _pick(self, infos):
        # Count before product, MI and proof gates: a second vendor collection
        # must not be discarded just to make the remaining one eligible.
        candidates = [info for info in infos
                      if (info.get("vendor_id"), info.get("product_id"),
                          info.get("usage_page"), info.get("usage")) == (VID, 0x052F, 0xFF00, 1)]
        if len(candidates) != 1:
            self._diag.append("collection missing or ambiguous; not opened")
            return None
        info = candidates[0]
        if (any(type(info.get(field)) is not int for field in (
                "vendor_id", "product_id", "usage_page", "usage", "interface_number"))
                or info.get("interface_number") != 1 or info.get("product_string") != PRODUCT):
            self._diag.append("identity/interface unverified; not opened")
        elif not isinstance(info.get("path"), (bytes, str)) or not info["path"].strip():
            self._diag.append("collection path unproven; not opened")
        else:
            maximum, sizes = info.get("feature_report_length"), info.get("feature_report_sizes")
            if (type(maximum) is int and maximum == REPORT_BYTES
                    and isinstance(sizes, dict) and sizes == {"15": REPORT_BYTES}
                    and type(sizes["15"]) is int):
                return info
            self._diag.append("Feature 0F/33 unproven; not opened")
        return None

    def poll(self):
        self._diag = []
        if hid is None:
            self._diag.append("HID backend unavailable")
            return []
        try:
            inventory = hidlist.enumerate(VID)
        except Exception:
            self._diag.append("enumeration failed")
            return []
        groups = {}
        for info in inventory:
            if info.get("vendor_id") != VID or info.get("product_id") != 0x052F:
                continue
            physical = info.get("physical_id")
            if (not isinstance(physical, str) or not physical.strip()
                    or physical.casefold().startswith("collection:")):
                self._diag.append("physical parent unproven; not opened")
                continue
            groups.setdefault(physical, []).append(info)
        result = []
        for physical, infos in groups.items():
            info = self._pick(infos)
            if info is None:
                continue
            dev, reading = None, None
            try:
                dev = hid.device()
                dev.open_path(info["path"])
                reply = dev.get_feature_report(REPORT_ID, REPORT_BYTES)
                reading = parse_reply(reply)
                if reading is None:
                    self._diag.append("charging placeholder; no new reading"
                                      if _valid_reply(reply) and reply[19] == 1
                                      else "invalid battery reply; no new reading")
            except Exception:
                self._diag.append("battery I/O failed")
            finally:
                if dev is not None:
                    try:
                        dev.close()
                    except Exception:
                        self._diag.append("HID handle close failed")
            if reading is not None:
                result.append(DeviceStatus(
                    key=f"{self.name}:{physical}", name=PIDS[info["product_id"]],
                    level=reading[0], source=self.name, kind="mouse", physical_id=physical,
                    connection_known=False, charging_known=False, verification_level="C"))
        return result

    def diagnostics(self):
        return list(self._diag)

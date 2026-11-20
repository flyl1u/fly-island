"""Grade-C ROG OMNI mouse battery candidate, pending hardware validation.

Protocol facts only: seerge/g-helper 0bda6b55317f (GPL-3.0), documented in
docs/rog-omni-ghelper.md section 2.2. Independent implementation; no pairing
table, Booster, keyboard, initialization, settings or DPI commands.
"""
import re

try:
    import hid
except ImportError:  # pragma: no cover
    hid = None

from . import hidlist
from .base import DeviceStatus, Provider

VID = 0x0B05
PIDS = {0x1ACE: "ROG OMNI 接收器（鼠标）"}
REPORT_ID = 0x03
REPORT_BYTES = 64
READ_TIMEOUT_MS = 300
MAX_READS = 4
ECHO = (0x03, 0x12, 0x07)


def make_request():
    return [0x03, 0x12, 0x07] + [0] * 61


def _frame(reply):
    return (isinstance(reply, (bytes, bytearray, list, tuple))
            and len(reply) == REPORT_BYTES
            and all(type(n) is int and 0 <= n <= 255 for n in reply))


def parse_reply(reply):
    if (not _frame(reply) or tuple(reply[:3]) != ECHO
            or not 1 <= reply[5] <= 100):
        return None
    return reply[5], reply[10] > 0, ""


def _collection(info):
    if (any(type(info.get(field)) is not int for field in (
            "interface_number", "usage_page", "usage"))
            or (info["interface_number"], info["usage_page"], info["usage"]) != (2, 0xFF01, 1)):
        return False
    path = info.get("path")
    if not isinstance(path, (bytes, str)) or not path:
        return False
    try:
        text = path.decode("utf-8") if isinstance(path, bytes) else path
    except UnicodeError:
        return False
    # The boundary excludes Col030 and arbitrary suffixes. No other collection
    # or a token in the instance/serial segment can substitute for this route.
    parts = text.split("#")
    return (len(parts) >= 3 and "\0" not in text
            and re.search(r"&mi_02&col03(?:&|$)", parts[1], re.I) is not None)


def _reports(info):
    for direction in ("input", "output"):
        maximum = info.get(direction + "_report_length")
        sizes = info.get(direction + "_report_sizes")
        if (type(maximum) is not int or not REPORT_BYTES <= maximum <= 4096
                or info.get(direction + "_report_proof") not in ("caps", "descriptor")
                or not isinstance(sizes, dict) or not sizes
                or any(not isinstance(key, str) or not key.isascii() or not key.isdecimal()
                       or len(key) > 3 or str(int(key)) != key or not 0 <= int(key) <= 255
                       or type(size) is not int or not 2 <= size <= maximum
                       for key, size in sizes.items())
                or max(sizes.values()) != maximum
                or sizes.get("3") != REPORT_BYTES):
            return False
    return True


class AsusOmniProvider(Provider):
    name = "asus_omni"

    def __init__(self):
        self._diag = []

    def _pick(self, infos):
        identities = [info for info in infos
                      if all(type(info.get(field)) is int for field in ("vendor_id", "product_id"))
                      and (info["vendor_id"], info["product_id"]) == (VID, 0x1ACE)]
        if not identities:
            self._diag.append("OMNI identity mismatch; not opened")
            return None
        # Count routes before report proof: an incomplete second route must
        # not be discarded merely to make the first one eligible for a write.
        candidates = [info for info in identities if _collection(info)]
        if not candidates:
            self._diag.append("OMNI collection mismatch; not opened")
        elif len(candidates) != 1:
            self._diag.append("OMNI collection ambiguous; not opened")
        elif not _reports(candidates[0]):
            self._diag.append("OMNI report 03/64 unproven; not opened")
        else:
            return candidates[0]
        return None

    def _query(self, dev):
        request = make_request()
        try:
            written = dev.write(request)
            if type(written) is not int or written != REPORT_BYTES:
                self._diag.append("OMNI battery query write failed; no retry")
                return None
        except Exception:
            self._diag.append("OMNI battery query write failed; no retry")
            return None
        # No drain, resend or other command. Each read has the same bounded
        # timeout; the engine's existing child/round budgets remain unchanged.
        for _ in range(MAX_READS):
            try:
                raw = dev.read(REPORT_BYTES, READ_TIMEOUT_MS)
            except Exception:
                self._diag.append("OMNI input read failed")
                return None
            if raw is None or isinstance(raw, (bytes, bytearray, list, tuple)) and not raw:
                break
            if not _frame(raw):
                continue
            if not any(raw):
                self._diag.append("OMNI empty reply or asleep; no new reading")
                return None
            if raw[0] != REPORT_ID:
                continue
            if tuple(raw[1:3]) == (0xFF, 0xAA):
                self._diag.append("OMNI device error FF AA")
                return None
            if not any(raw[1:4]):
                self._diag.append("OMNI empty reply or asleep; no new reading")
                return None
            if tuple(raw[:3]) != ECHO:
                continue
            if raw[5] == 0:
                self._diag.append("OMNI zero battery; no new reading")
                return None
            if raw[5] > 100:
                self._diag.append("OMNI battery out of range")
                return None
            return parse_reply(raw)
        self._diag.append("OMNI no echo within read limit")
        return None

    def poll(self):
        self._diag = []
        if hid is None:
            self._diag.append("OMNI HID backend unavailable")
            return []
        try:
            inventory = hidlist.enumerate(VID)
        except Exception:
            self._diag.append("OMNI enumeration failed")
            return []
        groups = {}
        for info in inventory:
            if (any(type(info.get(field)) is not int for field in ("vendor_id", "product_id"))
                    or (info["vendor_id"], info["product_id"]) != (VID, 0x1ACE)):
                self._diag.append("OMNI identity mismatch; not opened")
                continue
            physical = info.get("physical_id")
            if (not isinstance(physical, str) or not physical.strip()
                    or physical.casefold().startswith("collection:")):
                self._diag.append("OMNI USB parent unproven; not opened")
                continue
            groups.setdefault(physical, []).append(info)
        result = []
        for physical, infos in groups.items():
            info = self._pick(infos)
            if info is None:
                continue
            dev = None
            try:
                dev = hid.device()
                dev.open_path(info["path"])
            except Exception:
                self._diag.append("OMNI open failed")
            else:
                reading = self._query(dev)
                if reading is not None:
                    result.append(DeviceStatus(
                        key=f"{self.name}:{physical}", name=PIDS[0x1ACE], level=reading[0],
                        charging=reading[1], source=self.name, kind="mouse", physical_id=physical,
                        connection_known=True, charging_known=True, verification_level="C"))
            finally:
                if dev is not None:
                    try:
                        dev.close()
                    except Exception:
                        self._diag.append("OMNI HID handle close failed")
        return result

    def diagnostics(self):
        return list(self._diag)

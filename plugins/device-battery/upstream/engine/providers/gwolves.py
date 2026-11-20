"""G-Wolves wireless mice on the shared 8K receiver (33E4:3854), on a model's own
receiver, or on the cable.

Source: G-Wolves' own web driver, mouse.xyz. Its device list (Config/env-models.json)
puts eleven mice on the receiver 33E4:3854, all with "IsNewProtocol": "1" and
"WiredDeviceID": "2" (the WARG among them). For these, the web driver reads the
battery with the same feature report exchange that the WLmouse provider uses (the
same firmware family: the model folders are "JM_..."):

    request   feature report 0, 64 bytes: 00 00 02 02 00 83 00 ...
    reply     feature report 0:           a1 00 02 02 00 83 <charging> <battery %>

The web driver reads the pair as [charging, battery %], shows "device not active"
when the status byte is not a1 (the mouse sleeps), and shows 99 % instead of 100 %
while charging. The request and the reply parser are the ones in wlmouse.py.

Mice with a receiver of their own. The same list gives the other models their own
receiver and cable ids (MODELS below). The web driver reads them with one of two
exchanges, chosen only by the model's "IsNewProtocol":
  * "1": the exchange above (getBatPer; byte 2 becomes the model's WiredDeviceID, which
    is 2 for every model, so the request does not change);
  * "0": getOldBattery, on the same collection:
        request   feature report 0, 64 bytes: 00 02 8f <01 over a receiver, 00 on the
                  cable> 00 ...   (setReportOld sets byte 3 to 1 when not wired)
        reply     feature report 0:           a1 02 8f .. <charging> <battery %>
    with the same meaning: [charging, battery %], "device not active" when the status
    byte is not a1. HSK Pro ACE (#105) is such a model: receiver 5803, cable 5804.
A model's receiver and cable share one icon.

Which collection. The web driver sends the request to the collection that has a
64-byte feature report without a report id (WebHID's sendFeatureReport(0, ...)).
hidapi does not list report sizes, so this provider asks Windows for them
(HidP_GetCaps, FeatureReportByteLength = 65: the id byte plus 64 bytes), without
opening the collection for reading or writing. Only a collection with exactly that
feature report gets the request; if Windows gives no sizes, nothing is sent.
"""
from __future__ import annotations

import ctypes
import sys
import time
from typing import Dict, List, Optional, Tuple

try:
    import hid
except ImportError:              # pragma: no cover
    hid = None

from . import hidlist
from .base import DeviceStatus, Provider, hexdump, log
from .wlmouse import QUERY, parse_feature

GWOLVES_VID = 0x33E4
RECEIVER = 0x3854

# the mouse on its cable: its own pid (mouse.xyz "PIDWired"), and its name
WIRED = {
    0x5418: "G-Wolves HTS Plus",
    0x5419: "G-Wolves HTS Plus",
    0x5219: "G-Wolves HTS Plus Pro",
    0x4718: "G-Wolves Lycan",
    0x4719: "G-Wolves Lycan",
    0x5618: "G-Wolves HTXU",
    0x5619: "G-Wolves HTXU",
    0x3619: "G-Wolves Fenrir Pro",
    0x3519: "G-Wolves Fenrir Asym",
    0x2719: "G-Wolves HTX Mini",
    0x4219: "G-Wolves WARG",
}
DEFAULT_NAME = "G-Wolves mouse"     # the receiver is shared, so it does not tell the model

NEW, OLD = "new", "old"
# The other models of mouse.xyz's Config/env-models.json, each with a receiver of its own
# (PIDWireless, PIDWireless4K8K, _1KDongle, _4KDongle, _8KDongle) and its cable
# (PIDWired): pid -> (name, the model's receiver id = its icon, exchange, on the cable).
# The list spells one model "Fenir Max"; its name here is "Fenrir Max".
MODELS: Dict[int, Tuple[str, int, str, bool]] = {
    0x3808: ("G-Wolves HTM Plus", 0x3817, NEW, True),
    0x3817: ("G-Wolves HTM Plus", 0x3817, NEW, False),
    0x6808: ("G-Wolves HSK Pro 2.0", 0x6817, NEW, True),
    0x6817: ("G-Wolves HSK Pro 2.0", 0x6817, NEW, False),
    0x5608: ("G-Wolves HTXU", 0x5617, NEW, True),
    0x5617: ("G-Wolves HTXU", 0x5617, NEW, False),
    0x3608: ("G-Wolves Fenrir Pro", 0x3617, NEW, True),
    0x3617: ("G-Wolves Fenrir Pro", 0x3617, NEW, False),
    0x3908: ("G-Wolves VUK", 0x3917, OLD, True),
    0x3917: ("G-Wolves VUK", 0x3917, OLD, False),
    0x7904: ("G-Wolves HT-S2", 0x7913, OLD, True),
    0x7913: ("G-Wolves HT-S2", 0x7913, OLD, False),
    0x3708: ("G-Wolves Fenrir Max", 0x3717, OLD, True),
    0x3717: ("G-Wolves Fenrir Max", 0x3717, OLD, False),
    0x5308: ("G-Wolves HTS Ultra", 0x5317, OLD, True),
    0x5317: ("G-Wolves HTS Ultra", 0x5317, OLD, False),
    0x7704: ("G-Wolves HTR", 0x7713, OLD, True),
    0x7713: ("G-Wolves HTR", 0x7713, OLD, False),
    0x3508: ("G-Wolves Fenrir", 0x3517, OLD, True),
    0x3517: ("G-Wolves Fenrir", 0x3517, OLD, False),
    0x7908: ("G-Wolves HT-S2 Pro", 0x7917, OLD, True),
    0x7917: ("G-Wolves HT-S2 Pro", 0x7917, OLD, False),
    0x5808: ("G-Wolves HSK Pro", 0x5817, OLD, True),
    0x5817: ("G-Wolves HSK Pro", 0x5817, OLD, False),
    0x5807: ("G-Wolves HSK Pro", 0x5817, OLD, False),
    0x2708: ("G-Wolves HTX Mini", 0x2717, OLD, True),
    0x2717: ("G-Wolves HTX Mini", 0x2717, OLD, False),
    0x5408: ("G-Wolves HTS Plus", 0x5417, OLD, True),
    0x5417: ("G-Wolves HTS Plus", 0x5417, OLD, False),
    0x5407: ("G-Wolves HTS Plus", 0x5417, OLD, False),
    0x5708: ("G-Wolves HTX", 0x5717, OLD, True),
    0x5717: ("G-Wolves HTX", 0x5717, OLD, False),
    0x5707: ("G-Wolves HTX", 0x5717, OLD, False),
    0x5908: ("G-Wolves HSK Plus", 0x5917, OLD, True),
    0x5917: ("G-Wolves HSK Plus", 0x5917, OLD, False),
    0x5907: ("G-Wolves HSK Plus", 0x5917, OLD, False),
    0x7204: ("G-Wolves HSK Lite", 0x7203, OLD, True),
    0x7203: ("G-Wolves HSK Lite", 0x7203, OLD, False),
    0x7708: ("G-Wolves HTR Pro", 0x7717, OLD, True),
    0x7717: ("G-Wolves HTR Pro", 0x7717, OLD, False),
    0x5804: ("G-Wolves HSK Pro ACE", 0x5803, OLD, True),
    0x5803: ("G-Wolves HSK Pro ACE", 0x5803, OLD, False),
    0x5404: ("G-Wolves HTS Plus ACE", 0x5403, OLD, True),
    0x5403: ("G-Wolves HTS Plus ACE", 0x5403, OLD, False),
    0x5704: ("G-Wolves HTX ACE", 0x5703, OLD, True),
    0x5703: ("G-Wolves HTX ACE", 0x5703, OLD, False),
    0x5904: ("G-Wolves HSK Plus ACE", 0x5903, OLD, True),
    0x5903: ("G-Wolves HSK Plus ACE", 0x5903, OLD, False),
}

REPLY_TRIES = 15                    # get the reply up to 15 times, 50 ms apart
ASLEEP_KEEP = 300                   # s, as in the WLmouse provider

Reading = Tuple[int, bool]

FEATURE_LENGTH = 65                 # report id byte + the 64 bytes the web driver sends


def old_request(wired: bool) -> List[int]:
    """getOldBattery's 64 bytes (without the report id)."""
    return [0x00, 0x02, 0x8F, 0x00 if wired else 0x01] + [0x00] * 60


def parse_old(resp) -> Tuple[Optional[int], Optional[bool]]:
    """A getOldBattery reply -> (battery %, charging), or (None, None). The web driver
    accepts the reply with or without a leading report id byte, and so does this."""
    r = list(resp or [])
    for off in (1, 0):
        if len(r) > off + 5 and r[off] == 0xA1 and r[off + 1] == 0x02 and r[off + 2] == 0x8F:
            charge, batt = r[off + 4], r[off + 5]
            if batt <= 100:
                return batt, bool(charge)
    return None, None


class _HIDP_CAPS(ctypes.Structure):
    _fields_ = [("Usage", ctypes.c_ushort), ("UsagePage", ctypes.c_ushort),
                ("InputReportByteLength", ctypes.c_ushort),
                ("OutputReportByteLength", ctypes.c_ushort),
                ("FeatureReportByteLength", ctypes.c_ushort),
                ("Reserved", ctypes.c_ushort * 17),
                ("NumberLinkCollectionNodes", ctypes.c_ushort),
                ("NumberInputButtonCaps", ctypes.c_ushort),
                ("NumberInputValueCaps", ctypes.c_ushort),
                ("NumberInputDataIndices", ctypes.c_ushort),
                ("NumberOutputButtonCaps", ctypes.c_ushort),
                ("NumberOutputValueCaps", ctypes.c_ushort),
                ("NumberOutputDataIndices", ctypes.c_ushort),
                ("NumberFeatureButtonCaps", ctypes.c_ushort),
                ("NumberFeatureValueCaps", ctypes.c_ushort),
                ("NumberFeatureDataIndices", ctypes.c_ushort)]


def feature_length(path) -> Optional[int]:
    """FeatureReportByteLength of one HID collection, or None when Windows does not
    give it. The handle is opened with no access rights (query only), so this does
    not send anything to the device."""
    if sys.platform != "win32":
        return None
    p = path.decode("utf-8", "ignore") if isinstance(path, (bytes, bytearray)) else str(path)
    k32, hidd = ctypes.windll.kernel32, ctypes.windll.hid
    k32.CreateFileW.restype = ctypes.c_void_p
    handle = k32.CreateFileW(p, 0, 3, None, 3, 0, None)     # no access, share r/w, open existing
    if handle in (None, ctypes.c_void_p(-1).value):
        return None
    try:
        pp = ctypes.c_void_p()
        if not hidd.HidD_GetPreparsedData(ctypes.c_void_p(handle), ctypes.byref(pp)):
            return None
        try:
            caps = _HIDP_CAPS()
            if hidd.HidP_GetCaps(pp, ctypes.byref(caps)) != 0x00110000:    # HIDP_STATUS_SUCCESS
                return None
            return caps.FeatureReportByteLength
        finally:
            hidd.HidD_FreePreparsedData(pp)
    finally:
        k32.CloseHandle(ctypes.c_void_p(handle))


class GWolvesProvider(Provider):
    name = "gwolves"

    def __init__(self):
        self._diag: List[str] = []
        self._path: Dict[int, bytes] = {}          # pid -> collection that answered
        self._name: Optional[str] = None           # model, once seen on the cable
        self._last: Optional[Tuple[int, bool, float]] = None
        self._model_last: Dict[int, Tuple[int, bool, float]] = {}   # model -> last reading

    def _read(self, path: bytes, pid: Optional[int] = None) -> Tuple[Optional[Reading], bool]:
        """-> (reading or None, the collection accepted the request)."""
        model = MODELS.get(pid) if pid is not None else None
        old = model is not None and model[2] == OLD
        if old:
            request, parse, what = old_request(model[3]), parse_old, "0x8f"
        else:
            request, parse, what = QUERY + [0x00] * (64 - len(QUERY)), parse_feature, "0x83"
        dev = hid.device()
        try:
            dev.open_path(path)
        except (OSError, IOError) as e:
            self._diag.append(f"    open: {e}")
            return None, False
        try:
            try:
                n = dev.send_feature_report([0x00] + request)
            except (OSError, ValueError) as e:
                self._diag.append(f"    send: {e}")
                return None, False
            if n is not None and n < 0:
                self._diag.append("    send: refused (no 64-byte feature report here)")
                return None, False
            for _ in range(REPLY_TRIES):
                time.sleep(0.05)
                try:
                    resp = dev.get_feature_report(0, 65)
                except (OSError, ValueError):
                    resp = None
                batt, chg = parse(resp)
                if batt is not None:
                    self._diag.append(f"    reply: {hexdump(resp, 12)}")
                    return (batt, bool(chg)), True
            self._diag.append(f"    no a1 reply to request {what} (mouse asleep or off)")
            return None, True
        finally:
            try:
                dev.close()
            except Exception:
                pass

    def _read_pid(self, pid: int, ifaces: List[dict]) -> Optional[Reading]:
        path = self._path.get(pid)
        if path is None or all(d["path"] != path for d in ifaces):
            path = None
            for d in ifaces:
                n = feature_length(d["path"])
                self._diag.append(f"  iface={d.get('interface_number')} usage="
                                  f"{d.get('usage_page', 0):04x}:{d.get('usage', 0):04x} "
                                  f"feature length={n}")
                if n == FEATURE_LENGTH:
                    path = d["path"]
                    break
            if path is None:
                self._diag.append("  no collection with a 64-byte feature report: nothing sent")
                return None
            self._path[pid] = path
        res, _ = self._read(path, pid)
        return res

    def poll(self) -> List[DeviceStatus]:
        self._diag = []
        if hid is None:
            return []
        try:
            infos = hidlist.enumerate(GWOLVES_VID)
        except Exception as e:  # pragma: no cover
            log.warning("hid.enumerate(gwolves): %s", e)
            return []
        groups: Dict[int, List[dict]] = {}
        models: Dict[int, Dict[int, List[dict]]] = {}      # model -> pid -> collections
        for d in infos:
            pid = d["product_id"]
            if pid == RECEIVER or pid in WIRED:
                groups.setdefault(pid, []).append(d)
            elif pid in MODELS:
                models.setdefault(MODELS[pid][1], {}).setdefault(pid, []).append(d)
        out = [self._poll_model(m, pids) for m, pids in sorted(models.items())]
        out = [st for st in out if st is not None]
        if not groups:
            return out

        readings: List[Reading] = []
        # the mouse on the cable first: it names the model, and it is charging
        for pid in sorted(groups, key=lambda p: p == RECEIVER):
            if pid in WIRED:
                self._name = WIRED[pid]
            self._diag.append(f"[G-Wolves] pid={pid:04x} "
                              f"'{(groups[pid][0].get('product_string') or '').strip()}'")
            res = self._read_pid(pid, groups[pid])
            if res is not None:
                readings.append(res)
                if res[1]:
                    break                  # on the cable: the receiver has nothing to add
        name = self._name or DEFAULT_NAME
        key = "gwolves"
        if readings:
            batt, chg = readings[0]                        # the cable's reading, if it answered
            self._last = (batt, chg, time.time())
            return out + [DeviceStatus(key, name, batt, chg, True, "gwolves", kind="mouse")]
        # the receiver cannot tell a sleeping mouse from a switched-off one: keep the last
        # value greyed out for a while, as the WLmouse provider does
        if self._last and time.time() - self._last[2] < ASLEEP_KEEP:
            return out + [DeviceStatus(key, name, self._last[0], self._last[1], False, "gwolves",
                                       kind="mouse")]
        return out

    def _poll_model(self, model: int, pids: Dict[int, List[dict]]) -> Optional[DeviceStatus]:
        """A model with its own receiver: the cable first (it is charging), one icon."""
        name = MODELS[model][0]
        key = f"gwolves:{model:04x}"
        reading = None
        for pid in sorted(pids, key=lambda p: not MODELS[p][3]):
            self._diag.append(f"[G-Wolves] pid={pid:04x} '{name}' "
                              f"({'cable' if MODELS[pid][3] else 'receiver'}, "
                              f"{MODELS[pid][2]} exchange)")
            reading = self._read_pid(pid, pids[pid])
            if reading is not None:
                break
        if reading is not None:
            self._model_last[model] = (reading[0], reading[1], time.time())
            return DeviceStatus(key, name, reading[0], reading[1], True, "gwolves", kind="mouse")
        last = self._model_last.get(model)
        if last and time.time() - last[2] < ASLEEP_KEEP:
            return DeviceStatus(key, name, last[0], last[1], False, "gwolves", kind="mouse")
        return None

    def diagnostics(self) -> List[str]:
        return list(self._diag)

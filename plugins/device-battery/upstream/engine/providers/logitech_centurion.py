"""Logitech G PRO X 2 LIGHTSPEED headset (046D:0AF7) over its receiver, without G HUB.

This headset does not use HID++ on the receiver's ff43 collection (logitech.py). Sources,
which agree on everything below except where noted:
  * pwr-Solaar/Solaar at e7304c4: lib/logitech_receiver/base.py (framing),
    device.py (centurion_bridge_request), centurion.py (battery), and
    docs/devices/PRO X 2 LIGHTSPEED 0AF7.text, a dump of a real headset: receiver
    features 0 Root, 1 FeatureSet, 2 0x0100, 3 CentPP bridge, 4 0x010A; headset
    feature 4 = 0x0104 battery.
  * Sapd/HeadsetControl at 25dadae: lib/devices/logitech_gpro_x2_lightspeed.hpp and
    lib/devices/protocols/logitech_centurion_protocol.hpp ("Centurion").

  * the vendor collection usage page 0xFFA0 / usage 0x0001 (interface 3), 64-byte
    output and input reports with report id 0x51.
  * a frame: 51 <len> <flags> <payload...>, len = payload length + 1; the payload of a
    received frame is frame[3 : 2 + len].
  * a direct request to the receiver: payload <feature index> <function | sw id> <params>,
    sw id 1, and len counts only these bytes, as in Solaar (HeadsetControl frames a
    zero-padded 64-byte buffer, len 0x41). The reply echoes the first two bytes; its
    data is payload[2:]. An error reply is ff <feature index> <function> <code>.
  * feature discovery on the receiver: Root (index 0) function 0 with the id 0x0001
    gives the FeatureSet index; FeatureSet function 0 gives the count and function 0x10
    <n> the id of feature n (data[1:3]). The CenturionBridge (0x0003) is how the
    headset is reached.
  * a bridge request: payload <bridge index> 0x11 <size hi> <size lo> <sub-message>,
    sub-message 00 <feature index> <function | sw id> <params>. The receiver first
    acknowledges (bridge index, 0x11); the headset's answer is (bridge index, 0x10),
    then 2 size bytes, 00, the feature index (0xFF = rejected), the echoed function byte,
    and the data.
  * the same discovery through the bridge gives the headset's own features. The battery
    is CenturionBatterySoc (0x0104), function 0: data[0] = percent, data[2] = charging
    state: 0 discharging, 1 charging, 2 charging over USB, 3 charge complete (Solaar;
    HeadsetControl names only 1 and 2). 1-3 mean the headset is on the cable.
  * firmware without 0x0104: HeadsetControl's fixed request 51 08 00 03 1a 00 03 00 04 0a.
    Up to 4 replies: 51 03 ... is an acknowledgement, 51 05 with byte 6 = 00 means the
    headset is off, and the battery reply is 51 0b ... with byte 8 = 04: byte 10 percent,
    byte 12 = 02 charging.

Every request reads: discovery lists features and the battery request reads the level.
No function that changes a setting is sent. A level above 100 is refused.
"""
from __future__ import annotations

import time
from typing import Dict, List, Optional, Tuple

try:
    import hid
except ImportError:              # pragma: no cover
    hid = None

from . import hidlist
from .base import DeviceStatus, Provider, hexdump, log

LOGITECH_VID = 0x046D
PIDS = {0x0AF7: "Logitech G PRO X 2 LIGHTSPEED"}
USAGE_PAGE, USAGE = 0xFFA0, 0x0001

REPORT_ID = 0x51
FRAME_SIZE = 64
SOFTWARE_ID = 0x01
BRIDGE_SEND = 0x10               # function of a bridge send and of its message event

FEATURE_ROOT = 0x0000
FEATURE_SET = 0x0001
FEATURE_BRIDGE = 0x0003
FEATURE_BATTERY = 0x0104

LEGACY_REQUEST = [0x51, 0x08, 0x00, 0x03, 0x1A, 0x00, 0x03, 0x00, 0x04, 0x0A]
LEGACY_READS = 4

WINDOW = 1.5                     # s to wait for one answer (HeadsetControl allows 5 s per read)
READ_TIMEOUT_MS = 100


class Offline(Exception):
    """The headset is off or out of range: the receiver answers, the headset does not."""


def frame(payload: List[int], flags: int = 0) -> List[int]:
    out = [0] * FRAME_SIZE
    out[0], out[1], out[2] = REPORT_ID, len(payload) + 1, flags
    for i, b in enumerate(payload[:FRAME_SIZE - 3]):
        out[3 + i] = b
    return out


def direct_frame(feature_index: int, function: int, params=()) -> List[int]:
    return frame([feature_index, (function & 0xF0) | SOFTWARE_ID] + list(params))


def bridge_frame(bridge_index: int, sub_index: int, function: int, params=()) -> List[int]:
    sub = [0x00, sub_index, (function & 0xF0) | SOFTWARE_ID] + list(params)
    return frame([bridge_index, BRIDGE_SEND | SOFTWARE_ID, (len(sub) >> 8) & 0x0F,
                  len(sub) & 0xFF] + sub)


def payload_of(r) -> Optional[List[int]]:
    if not r or len(r) < 4 or r[0] != REPORT_ID:
        return None
    n = r[1]
    if n <= 1 or n + 2 > len(r):
        return None
    return list(r[3:2 + n])


def parse_battery(data) -> Optional[Tuple[int, bool]]:
    if not data or data[0] > 100:
        return None
    return data[0], len(data) >= 3 and data[2] in (1, 2, 3)


def parse_legacy(r) -> Optional[Tuple[int, bool]]:
    if len(r) >= 13 and r[0] == REPORT_ID and r[1] == 0x0B and r[8] == 0x04 and r[10] <= 100:
        return r[10], r[12] == 0x02
    return None


class LogitechCenturionProvider(Provider):
    name = "logitech_centurion"

    def __init__(self):
        self._diag: List[str] = []
        # path -> (bridge index, {headset feature id: index}) once discovery succeeded
        self._features: Dict[bytes, Tuple[int, Dict[int, int]]] = {}

    # ---- transport ---------------------------------------------------------
    def _write(self, dev, data: List[int]) -> None:
        dev.write(data)

    def _replies(self, dev):
        """Frames that arrive within the window."""
        end = time.time() + WINDOW
        while time.time() < end:
            r = list(dev.read(FRAME_SIZE, READ_TIMEOUT_MS) or [])
            if r:
                yield r

    def _direct(self, dev, feature_index: int, function: int, params=()) -> List[int]:
        fn_sw = (function & 0xF0) | SOFTWARE_ID
        self._write(dev, direct_frame(feature_index, function, params))
        for r in self._replies(dev):
            p = payload_of(r)
            if not p or len(p) < 2:
                continue
            if p[0] == 0xFF and len(p) >= 3 and p[1] == feature_index and p[2] == fn_sw:
                raise ValueError(f"receiver feature {feature_index:#04x}: error "
                                 f"{p[3] if len(p) > 3 else 0:#04x}")
            if p[0] == feature_index and p[1] == fn_sw:
                return p[2:]
        raise TimeoutError(f"no reply from receiver feature {feature_index:#04x}")

    def _bridge(self, dev, bridge: int, sub_index: int, function: int, params=()) -> List[int]:
        fn_sw = (function & 0xF0) | SOFTWARE_ID
        self._write(dev, bridge_frame(bridge, sub_index, function, params))
        acked = False
        for r in self._replies(dev):
            p = payload_of(r)
            if not p or len(p) < 2 or p[0] != bridge or (p[1] >> 4) != (BRIDGE_SEND >> 4):
                continue
            if (p[1] & 0x0F) == SOFTWARE_ID:
                acked = True                  # the receiver took the message
                continue
            if (p[1] & 0x0F) != 0 or len(p) < 7 or p[4] != 0x00:
                continue
            if p[5] == 0xFF and p[6] == sub_index:
                raise ValueError(f"headset rejected feature {sub_index:#04x}")
            if p[5] == sub_index and p[6] == fn_sw:
                return p[7:]
        if acked:
            raise Offline("the receiver acknowledged, the headset did not answer")
        raise TimeoutError("no acknowledgement from the receiver")

    # ---- discovery -----------------------------------------------------------
    def _discover(self, dev) -> Tuple[int, Dict[int, int]]:
        ids = [FEATURE_SET >> 8, FEATURE_SET & 0xFF]
        fs = self._direct(dev, FEATURE_ROOT, 0x00, ids)
        if not fs or fs[0] == 0:
            raise ValueError("receiver: no FeatureSet")
        count = self._direct(dev, fs[0], 0x00)[0]
        bridge = None
        for n in range(count):
            d = self._direct(dev, fs[0], 0x10, [n])
            if len(d) >= 3 and (d[1] << 8 | d[2]) == FEATURE_BRIDGE:
                bridge = n
                break
        if bridge is None:
            raise ValueError("receiver: no Centurion bridge")
        sfs = self._bridge(dev, bridge, FEATURE_ROOT, 0x00, ids)
        if not sfs or sfs[0] == 0:
            raise ValueError("headset: no FeatureSet")
        sub_count = self._bridge(dev, bridge, sfs[0], 0x00)[0]
        features: Dict[int, int] = {}
        for n in range(sub_count):
            d = self._bridge(dev, bridge, sfs[0], 0x10, [n])
            if len(d) >= 3:
                features[d[1] << 8 | d[2]] = n
        self._diag.append(f"  bridge index {bridge}, headset features: "
                          + ", ".join(f"{f:04x}@{i}" for f, i in sorted(features.items())))
        return bridge, features

    def _legacy(self, dev) -> Optional[Tuple[int, bool]]:
        self._write(dev, LEGACY_REQUEST + [0] * (FRAME_SIZE - len(LEGACY_REQUEST)))
        seen = 0
        for r in self._replies(dev):
            if r[0] != REPORT_ID:
                continue
            seen += 1
            if len(r) >= 7 and r[1] == 0x05 and r[6] == 0x00:
                raise Offline("power report: headset off")
            res = parse_legacy(r)
            if res is not None:
                return res
            if seen >= LEGACY_READS:
                break
        return None

    def _read(self, path: bytes) -> Optional[Tuple[int, bool]]:
        dev = hid.device()
        try:
            dev.open_path(path)
        except (OSError, IOError) as e:
            self._diag.append(f"  open: {e}")
            return None
        try:
            known = self._features.get(path)
            if known is None:
                known = self._discover(dev)
                self._features[path] = known
            bridge, features = known
            index = features.get(FEATURE_BATTERY)
            if index is None:
                self._diag.append("  no battery feature 0104: the fixed legacy request")
                return self._legacy(dev)
            data = self._bridge(dev, bridge, index, 0x00)
            self._diag.append(f"  battery 0104@{index}: {hexdump(data, 4)}")
            return parse_battery(data)
        finally:
            try:
                dev.close()
            except Exception:
                pass

    # ---- poll ------------------------------------------------------------------
    def poll(self) -> List[DeviceStatus]:
        self._diag = []
        if hid is None:
            return []
        try:
            infos = hidlist.enumerate(LOGITECH_VID)
        except Exception as e:  # pragma: no cover
            log.warning("hid.enumerate(logitech centurion): %s", e)
            return []
        out: List[DeviceStatus] = []
        for d in infos:
            name = PIDS.get(d["product_id"])
            if name is None or (d.get("usage_page"), d.get("usage")) != (USAGE_PAGE, USAGE):
                continue
            key = f"logitech-centurion:{d['product_id']:04x}"
            self._diag.append(f"[Logitech] pid={d['product_id']:04x} '{name}' "
                              f"iface={d.get('interface_number')} {USAGE_PAGE:04x}:{USAGE:04x}")
            try:
                res = self._read(d["path"])
            except Offline as e:
                self._diag.append(f"  {e}")
                res = None
            except (TimeoutError, ValueError, OSError, IOError, IndexError) as e:
                self._diag.append(f"  {e}")
                self._features.pop(d["path"], None)       # discover again next time
                res = None
            # a switched-off headset leaves the tray (README: The icon)
            if res is not None:
                level, charging = res
                out.append(DeviceStatus(key, name, level, charging, True, "logitech",
                                        kind="headset"))
        return out

    def diagnostics(self) -> List[str]:
        return list(self._diag)

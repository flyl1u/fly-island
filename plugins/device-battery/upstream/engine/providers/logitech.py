"""Logitech wireless mice, keyboards and headsets over HID++ 2.0. Works alongside G HUB.

HID++ is Logitech's own protocol. Logitech documents it and Solaar implements it.

Where the app finds a device:
  * Receivers (Lightspeed, Unifying, Bolt, Nano): the vendor collections ff00:0001
    ("short" reports, 7 bytes) and ff00:0002 ("long" reports, 20 bytes). The devices
    paired to the receiver are in slots 1..6.
  * A mouse or keyboard on its USB cable: the same two collections, slot 0xFF.
  * Headsets: only a long collection, slot 0xFF. It is ff43:0202 for most models;
    the G535 puts it on its consumer collection 000c:0001 (HeadsetControl).

How the app talks to a device:
  * request:  11 <slot> <feature index> <function << 4 | swid> <params...>
  * the root feature (index 0): function 0 finds the index of a feature,
    function 1 is a "ping" (is a device in this slot?)
  * error reply:  10 <slot> 8f <feature index> <function|swid> <error code> ...
                  11 <slot> ff <feature index> <function|swid> <error code> ...
    error code 0x08: the slot is empty
    error code 0x09 / 0x04: a device is paired, but it is off or out of range
    error code 0x01: the device speaks the older HID++ 1.0 (read through registers, below)
  * a paired device that is asleep does not answer at all

Features the app reads (the first battery feature that the device has):
  * 0x1004 unified battery, fn 1: <percent> <level flags> <status> ...
  * 0x1000 battery status,  fn 0: <percent> <next level> <status>
      status for both: 0 discharging, 1 charging, 2 almost full, 3 full,
      4 slow charging (Solaar's BatteryStatus)
  * 0x1001 battery voltage, fn 0: <mV hi> <mV lo> <flags>, flags bit 7 = charging
  * 0x1F20 ADC measurement (headsets), fn 0: <mV hi> <mV lo> <flags>,
      flags bit 0 = headset connected, bit 1 = charging. An error reply means the
      headset is connected but inactive.
  * 0x0005 device name (fn 0 length, fn 1 characters, fn 2 device type)
  * 0x0003 device information, fn 0: <entities> <unit id: 4 bytes> ...

Devices without a feature table are read through the old HID++ 1.0 registers
instead, with a short report 10 <slot> 81 <register>:
  * 0x0D charge:  <percent> .. <status: 30 discharging, 50 recharging, 90 full>
  * 0x07 status:  <level 7 full / 5 good / 3 low / 1 critical> <charging byte>
    (the byte's 0x21 flag = recharging, the 0x22 flag = full on the charger)
Registers are only ever read, and only when no 2.0 feature answered.
"""
from __future__ import annotations

import hashlib
import json
import re
import time
from datetime import datetime, timezone
from typing import Dict, List, Optional, Set, Tuple

import hid

from . import hidlist
from .base import DeviceStatus, Provider, hexdump, log

LOGITECH_VID = 0x046D
# our "software id" marks the replies to our own requests. It changes with each
# request (0x0A..0x0F), so a late reply to an earlier request never matches.
SWIDS = (0x0A, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F)
TIMEOUT = 0.6
PING_TIMEOUT = 2.0       # a dozing radio takes up to ~0.5 s to answer the first request
ASLEEP_KEEP = 300        # how long a silent device keeps its (greyed-out) icon, s

F_ROOT, F_INFO, F_NAME = 0x0000, 0x0003, 0x0005
F_UNIFIED, F_STATUS, F_VOLTAGE, F_ADC = 0x1004, 0x1000, 0x1001, 0x1F20
BATTERY_FEATURES = (F_UNIFIED, F_STATUS, F_VOLTAGE, F_ADC)
F_DPI = 0x2201
GPW_DPI_MODELS = {(0xC547, "PRO X Wireless")} | {
    (pid, "G Pro Wireless Gaming Mouse")
    for pid in (0xC539, 0xC53A, 0xC53D, 0xC53F, 0xC541, 0xC545, 0xC547, 0xC54D)
}
QUICK_DPI = (400, 800, 1600, 3200)

# HID++ 1.0 battery registers, for devices without a feature table (Solaar's
# hidpp10): read with a short report, tried in this order when nothing else
# answered. Never written.
REG_BATTERY_CHARGE, REG_BATTERY_STATUS = 0x0D, 0x07
# register 0x07's level byte -> (approximate percent, word); Solaar's table
STATUS_LEVELS = {7: (90, "full"), 5: (50, "good"), 3: (20, "low"), 1: (5, "critical")}

# HID++ error codes (Solaar: lib/logitech_receiver/hidpp10_constants.py, class ErrorCode)
ERR_OLD_PROTOCOL = 0x01      # "invalid sub id": a HID++ 1.0 device answered
ERR_CONNECT_FAIL = 0x04
ERR_EMPTY_SLOT = 0x08        # "unknown device"
ERR_UNREACHABLE = 0x09       # "resource error": paired, but switched off

# receiver product ids, from Solaar (base_usb.py): Bolt, Unifying, Nano, Lightspeed.
# A product string with "receiver" in it also counts, for receivers not in this list.
RECEIVERS = {
    0xC548,                                                  # Bolt
    0xC52B, 0xC532,                                          # Unifying
    0xC52F, 0xC518, 0xC51A, 0xC51B, 0xC521, 0xC525, 0xC526,  # Nano
    0xC52E, 0xC531, 0xC534, 0xC535, 0xC537,
    0xC539, 0xC53A, 0xC53D, 0xC53F, 0xC541, 0xC545, 0xC547,  # Lightspeed
    0xC54D,
}

# headsets with HID++ battery (feature 0x1F20), from HeadsetControl's device list.
# The value is the name to show when the headset does not report one.
HEADSETS = {
    0x0A66: "Logitech G533",
    0x0AC4: "Logitech G535",
    0x0A5C: "Logitech G633",
    0x0A89: "Logitech G635",
    0x0A5B: "Logitech G933",
    0x0A87: "Logitech G935",
    0x0AB5: "Logitech G733",
    0x0AFE: "Logitech G733",
    0x0B1F: "Logitech G733",
    0x0AA7: "Logitech G PRO",
    0x0AAA: "Logitech G PRO X",
    0x0ABA: "Logitech G PRO X",
    0x0AFB: "Logitech G PRO X 2",
    0x0AFC: "Logitech G PRO X 2",
}
# headsets whose long collection is not ff43:0202 (usage page, usage)
HEADSET_COLLECTION = {0x0AC4: (0x000C, 0x0001)}

# 0x0005 device type -> DeviceStatus.kind
KINDS = {0: "keyboard", 2: "keyboard", 3: "mouse", 4: "mouse", 5: "mouse"}

# Li-ion discharge curve used by Solaar, mV -> %
VOLTAGE_CURVE = ((4186, 100), (4067, 90), (3989, 80), (3922, 70), (3859, 60), (3811, 50),
                 (3778, 40), (3751, 30), (3717, 20), (3671, 10), (3646, 5), (3579, 2), (3500, 0))

# battery status values that mean "on the charger" (0x1004 and 0x1000)
ON_CHARGER = (1, 2, 3, 4)

# 0x1004 without a percentage: the level flags give an approximate level (Solaar)
APPROX_LEVELS = {8: (90, "full"), 4: (50, "good"), 2: (20, "low"), 1: (5, "critical")}


def voltage_to_percent(mv: int) -> int:
    if mv >= VOLTAGE_CURVE[0][0]:
        return 100
    for (hi_mv, hi_p), (lo_mv, lo_p) in zip(VOLTAGE_CURVE, VOLTAGE_CURVE[1:]):
        if mv >= lo_mv:
            return round(lo_p + (mv - lo_mv) * (hi_p - lo_p) / (hi_mv - lo_mv))
    return 0


def parse_battery(feature: int, p) -> Tuple[Optional[int], bool, str]:
    """(level, on the charger, approximate text) from the params of a battery reply.
    A full battery that is still on the charger counts as charging.
    Level None: no valid reading (for 0x1F20 also: the headset is off).
    The text is set only when the device gives an approximate level, not a percentage."""
    if feature == F_UNIFIED:
        charging = p[2] in ON_CHARGER
        if 0 < p[0] <= 100:
            return p[0], charging, ""
        if p[0] == 0 and p[1] in APPROX_LEVELS:
            level, word = APPROX_LEVELS[p[1]]
            return level, charging, f"about {level}% ({word})"
        return None, False, ""
    if feature == F_STATUS:
        return (p[0] if 0 < p[0] <= 100 else None), p[2] in ON_CHARGER, ""
    if feature in (F_VOLTAGE, F_ADC):
        mv = (p[0] << 8) | p[1]
        if feature == F_ADC and not p[2] & 0x01:      # headset not connected
            return None, False, ""
        if mv < 2500:                                 # not a real battery voltage
            return None, False, ""
        charging = bool(p[2] & 0x80) if feature == F_VOLTAGE else bool(p[2] & 0x02)
        return voltage_to_percent(mv), charging, "estimated from voltage"
    return None, False, ""


def parse_register_battery(reg: int, p) -> Tuple[Optional[int], bool, str]:
    """(level, charging, approximate text) from a HID++ 1.0 battery register.

    Mirrored from Solaar (hidpp10.parse_battery_status). Register 0x07 carries
    a discrete level (7 full ... 1 critical) beside a charging byte; register
    0x0D a percentage and a status whose top nibble is 30 discharging, 50
    recharging, 90 full. Nothing is claimed when the bytes do not fit.
    """
    if reg == REG_BATTERY_CHARGE:
        charge = p[0]
        if not 0 < charge <= 100:
            return None, False, ""
        return charge, p[2] & 0xF0 in (0x50, 0x90), ""
    if reg == REG_BATTERY_STATUS:
        status_byte, charging_byte = p[0], p[1]
        charging = charging_byte & 0x21 == 0x21 or charging_byte & 0x22 == 0x22
        if status_byte in STATUS_LEVELS:
            level, word = STATUS_LEVELS[status_byte]
            return level, charging, f"about {level}% ({word})"
        return None, charging, ""     # a charging notification without a level
    return None, False, ""


class _Channel:
    """The HID++ collections of one receiver, cabled device or headset dongle."""

    def __init__(self, short_path: Optional[bytes], long_path: bytes):
        self.devs = []
        self.error = False       # the last request got an error reply (not a timeout)
        self.error_code = 0      # the error code of that reply
        self._swid = 0
        self.last_reply_length = 0
        self.long = hid.device()
        self.long.open_path(long_path)
        self.long.set_nonblocking(True)
        self.devs.append(self.long)
        if short_path:           # a receiver sends its error replies as short reports
            try:
                s = hid.device()
                s.open_path(short_path)
                s.set_nonblocking(True)
                self.devs.append(s)
            except (OSError, IOError):
                pass

    def close(self):
        for d in self.devs:
            try:
                d.close()
            except Exception:
                pass

    def request(self, idx: int, feat: int, func: int, params=(),
                timeout: float = TIMEOUT) -> Optional[List[int]]:
        """Params of the reply, or None on an error reply (self.error set) or timeout."""
        self.error, self.error_code = False, 0
        self.last_reply_length = 0
        self._swid = (self._swid + 1) % len(SWIDS)
        fn = (func << 4) | SWIDS[self._swid]
        req = [0x11, idx, feat, fn] + list(params)
        self.long.write(req + [0] * (20 - len(req)))
        end = time.time() + timeout
        while time.time() < end:
            for d in self.devs:
                r = d.read(64)
                if not r or len(r) < 4 or r[1] != idx:
                    continue
                # an error reply names the feature and the function it answers;
                # G HUB uses the same receiver, so both must match our request
                if r[2] in (0x8F, 0xFF) and len(r) >= 6 and r[3] == feat and r[4] == fn:
                    self.error, self.error_code = True, r[5]
                    return None
                if r[2] == feat and r[3] == fn:
                    self.last_reply_length = len(r) - 4
                    return list(r[4:]) + [0] * 16
            time.sleep(0.005)
        return None

    def read_register(self, idx: int, reg: int, timeout: float = TIMEOUT) -> Optional[List[int]]:
        """The data of a HID++ 1.0 register read, or None when none arrives.

        The request is a short report, 10 <idx> 81 <reg>, on the short
        collection - the shape Solaar sends to protocol 1.0 devices; the reply
        may be short or long. An error reply (10 <idx> 8f 81 <reg> <code>, or
        its HID++ 2.0 form with FF in place of 8F) leaves self.error set and is
        recognised at once (review by @ahmedkhursheed23: a 2.0 device without a
        battery feature answers every register read with the 2.0 error, and
        without this it cost the full timeout per register). Registers are only
        ever read.
        """
        if len(self.devs) < 2:        # register reads go on the short collection
            return None
        self.error, self.error_code = False, 0
        self.devs[1].write([0x10, idx, 0x81, reg, 0, 0, 0])
        end = time.time() + timeout
        while time.time() < end:
            for d in self.devs:
                r = d.read(64)
                if not r or len(r) < 4 or r[1] != idx:
                    continue
                if r[2] in (0x8F, 0xFF) and len(r) >= 6 and r[3] == 0x81 and r[4] == reg:
                    self.error, self.error_code = True, r[5]
                    return None
                if r[2] == 0x81 and r[3] == reg:
                    return list(r[4:]) + [0] * 16
            time.sleep(0.005)
        return None

    def feature_index(self, idx: int, feature_id: int) -> int:
        """Index of a feature on the device; 0 if the device does not have it."""
        r = self.request(idx, 0, 0, [feature_id >> 8, feature_id & 0xFF])
        return r[0] if r else 0

    def identity(self, idx: int) -> Tuple[str, str, str]:
        """(name, kind, unit id) of the device at idx; parts it cannot read are empty."""
        name = kind = unit = ""
        fi = self.feature_index(idx, F_NAME)
        if fi:
            r = self.request(idx, fi, 0)
            length = r[0] if r else 0
            raw = b""
            while len(raw) < length:
                r = self.request(idx, fi, 1, [len(raw)])
                if not r:
                    break
                raw += bytes(r[:16])
            name = raw[:length].decode("utf-8", "replace").strip()
            r = self.request(idx, fi, 2)
            kind = KINDS.get(r[0], "") if r else ""
        fi = self.feature_index(idx, F_INFO)
        if fi:
            r = self.request(idx, fi, 0)
            if r and any(r[1:5]):
                unit = bytes(r[1:5]).hex().upper()
        return name, kind, unit


def _instance(d) -> str:
    r"""The receiver's device instance, taken from the HID path.

    Two receivers can share a product id - every Unifying receiver is 0xC52B - so the
    product id alone cannot tell them apart. The instance segment of the path can:
    `\\?\HID#VID_046D&PID_C52B&MI_02#7&1234abcd&0&0000#{...}`. Not the serial number:
    hidapi reports an empty one for the collections Windows re-parents, which would make
    two receivers look identical again.

    The last `&`-separated part of that segment is the *collection* number, and it has to
    go. One interface hands out `...&0&0000` for its first collection and `...&0&0001` for
    the next, which is exactly how a receiver's two HID++ collections differ (`Col01` ends
    in `&0000`, `Col02` in `&0001`). Keeping it split one receiver into two groups: the
    group holding only the long collection was polled without the short one, so the empty
    slots' error replies could not be read, every slot burnt its full timeout, and each was
    then pinged with the short timeout for the rest of the session. What remains after
    dropping the collection number comes from the interface itself, so two receivers still
    get different keys.
    """
    p = d.get("path") or b""
    s = p.decode("ascii", "ignore") if isinstance(p, (bytes, bytearray)) else str(p)
    parts = s.split("#")
    inst = parts[2].lower() if len(parts) > 2 else ""
    return inst.rsplit("&", 1)[0]


def _dpi_now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _gpw_identity(pid, name, kind, unit, slot=1, require_identity=True):
    # One model/transport gate for discovery and writes. Cable targets still
    # require the live HID++ unit ID and the exact writable collections below.
    if type(pid) is not int or not 0 < pid <= 65535 or not isinstance(name, str) or type(slot) is not int:
        return False
    allowed = (slot in range(1, 7) and (pid, name) in GPW_DPI_MODELS
               or slot == 0xFF and name == "G Pro Wireless Gaming Mouse"
               and pid not in RECEIVERS and pid not in HEADSETS)
    return (allowed and (not require_identity or kind == "mouse" and
            isinstance(unit, str) and re.fullmatch(r"[0-9A-Fa-f]{8}", unit) is not None
            and int(unit, 16) != 0))


def _target_token(target):
    identity = {key: target.get(key) for key in ("pid", "instance", "slot", "unit", "name", "sensor")}
    for key in ("long_path", "short_path"):
        path = target.get(key)
        identity[key] = (bytes(path).hex() if isinstance(path, (bytes, bytearray)) else path)
    return hashlib.sha256(json.dumps(identity, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()


def _dpi_view(target=None, current=None, supported=(), error=None, can_set=False):
    choices = sorted({value for value in QUICK_DPI if value in supported}
                     | ({current} if current in supported else set()))[:8]
    return {"supported": bool(supported), "canSet": bool(can_set and target and current in supported),
            "current": current, "stages": choices, "stageSource": "quick", "checkedAtUtc": _dpi_now(),
            "targetToken": _target_token(target or {}), "error": error}


def _dpi_reply(ch, slot, feature, function, params=(), minimum=1):
    reply = ch.request(slot, feature, function, params)
    if reply is None:
        raise ValueError("dpi_read_failed")
    actual = getattr(ch, "last_reply_length", len(reply))
    if actual < minimum:
        raise ValueError("dpi_invalid_reply")
    return reply[:actual]


def parse_dpi_list(reply):
    """Decode 0x2201 supported values, not stored profile presets.

    Protocol facts independently checked against Solaar settings_templates.py
    at e7304c4c451cc9bb4f206a914844525e67856a28: fn 0x10, sensor prefix,
    0xE000|step range descriptors; fn 0x20 current/default; fn 0x30 volatile set.
    Only the bounded, terminated first-page format observed on this GPW is used.
    """
    if not reply or reply[0] != 0:
        raise ValueError("dpi_invalid_supported_list")
    values, offset = [], 1
    while offset + 1 < len(reply):
        word = (reply[offset] << 8) | reply[offset + 1]
        offset += 2
        if word == 0:
            if values:
                return tuple(values)
            break
        if word & 0xE000 == 0xE000:
            if not values or offset + 1 >= len(reply):
                break
            step = word & 0x1FFF
            last = (reply[offset] << 8) | reply[offset + 1]
            offset += 2
            if not step or last <= values[-1] or (last - values[-1]) % step:
                break
            count = (last - values[-1]) // step
            if len(values) + count > 4096:
                break
            first = values[-1]
            values.extend(first + step * index for index in range(1, count + 1))
        elif values and word <= values[-1]:
            break
        else:
            values.append(word)
    raise ValueError("dpi_invalid_supported_list")


def _dpi_current(ch, slot, feature):
    reply = _dpi_reply(ch, slot, feature, 2, [0], minimum=5)
    if reply[0] != 0:
        raise ValueError("dpi_invalid_reply")
    current = (reply[1] << 8) | reply[2]
    default = (reply[3] << 8) | reply[4]
    value = current or default
    if value <= 0:
        raise ValueError("dpi_current_unknown")
    return value


def _dpi_state(ch, slot, target):
    feature = ch.feature_index(slot, F_DPI)
    if not feature:
        raise ValueError("dpi_not_supported")
    sensors = _dpi_reply(ch, slot, feature, 0)
    if sensors[0] != 1:
        raise ValueError("dpi_sensor_not_supported")
    supported = parse_dpi_list(_dpi_reply(ch, slot, feature, 1, [0], minimum=3))
    current = _dpi_current(ch, slot, feature)
    if current not in supported:
        raise ValueError("dpi_current_unsupported")
    return _dpi_view(target, current, supported, can_set=True), feature, supported


def _fresh_unit(ch, slot):
    feature = ch.feature_index(slot, F_INFO)
    if not feature:
        return ""
    reply = _dpi_reply(ch, slot, feature, 0, minimum=5)
    return bytes(reply[1:5]).hex().upper() if any(reply[1:5]) else ""


def _capture_gpw_dpi(ch, pid, slot, instance, paths, name, kind, unit, identity_live):
    if not identity_live or not _gpw_identity(pid, name, kind, unit, slot) or not instance or not paths or 2 not in paths:
        return _dpi_view(error="dpi_identity_unconfirmed"), None
    target = {"provider": "logitech", "pid": pid, "instance": instance, "slot": slot,
              "unit": unit, "name": name, "sensor": 0,
              "long_path": paths[2], "short_path": paths.get(1)}
    try:
        view, _feature, _supported = _dpi_state(ch, slot, target)
        return view, target
    except (OSError, IOError, ValueError, TypeError, IndexError) as error:
        code = str(error) if isinstance(error, ValueError) and str(error).startswith("dpi_") else "dpi_read_failed"
        return _dpi_view(target, error=code), None


def set_device_dpi(inventory, target, value, expected_dpi, target_token):
    """Single volatile 0x2201 write to a freshly revalidated exact GPW target.

    No onboard mode/profile/flash command, retry or uncertain rollback is sent.
    The server must provide the selected physical receiver's scoped inventory.
    """
    view = _dpi_view(error="dpi_invalid_target")
    def result(error, success=False, unknown=False, confirmed=None):
        answer = dict(view)
        answer["error"] = error
        if error:
            answer["canSet"] = False
        if unknown:
            answer.update(current=None, canSet=False)
        return {"dpi": answer, "success": success, "outcomeUnknown": unknown,
                "error": error, "confirmedDpi": None if unknown else confirmed}
    if (not isinstance(target, dict) or type(target.get("pid")) is not int or type(target.get("slot")) is not int
            or type(target.get("sensor")) is not int or target["sensor"] != 0
            or not isinstance(target.get("instance"), str) or not target["instance"]
            or not isinstance(target.get("long_path"), (bytes, str)) or not target["long_path"]
            or target.get("short_path") is not None and not isinstance(target["short_path"], (bytes, str))
            or not _gpw_identity(target["pid"], target.get("name"), "mouse", target.get("unit"), target["slot"])):
        return result("dpi_invalid_target")
    if not isinstance(target_token, str) or target_token != _target_token(target):
        return result("dpi_stale_target")
    if type(value) is not int or type(expected_dpi) is not int or not 0 < value <= 65535 or not 0 < expected_dpi <= 65535:
        return result("dpi_invalid_value")
    if not isinstance(inventory, (list, tuple)):
        return result("dpi_invalid_target")
    filtered = [entry for entry in inventory if isinstance(entry, dict) and "product_id" in entry
                and "path" in entry and entry.get("vendor_id", LOGITECH_VID) == LOGITECH_VID]
    paths = LogitechProvider._collections(filtered).get((target["pid"], target["instance"]))
    if not paths or paths.get(2) != target.get("long_path") or paths.get(1) != target.get("short_path"):
        return result("dpi_receiver_changed")
    channel, attempted = None, False
    try:
        channel = _Channel(paths.get(1), paths[2])
        slot = target["slot"]
        if channel.request(slot, F_ROOT, 1, timeout=PING_TIMEOUT) is None:
            return result("dpi_device_unavailable")
        name, kind, unit = channel.identity(slot)
        if not _gpw_identity(target["pid"], name, kind, unit, slot) or name != target["name"] or unit != target["unit"]:
            return result("dpi_target_changed")
        view, feature, supported = _dpi_state(channel, slot, target)
        if value not in supported:
            return result("dpi_unsupported_value", confirmed=view["current"])
        if view["current"] != expected_dpi:
            return result("dpi_current_changed", confirmed=view["current"])
        # The unit and current value are checked again immediately before the
        # write, after capability queries which may have taken time.
        if _fresh_unit(channel, slot) != target["unit"]:
            return result("dpi_target_changed")
        current = _dpi_current(channel, slot, feature)
        if current != expected_dpi:
            view = _dpi_view(target, current, supported, can_set=current in supported)
            return result("dpi_current_changed", confirmed=current)
        if value == current:
            return result(None, success=True, confirmed=current)
        attempted = True
        acknowledged = channel.request(slot, feature, 3, [0, value >> 8, value & 0xFF]) is not None
        try:
            confirmed = _dpi_current(channel, slot, feature)
            if _fresh_unit(channel, slot) != target["unit"]:
                return result("dpi_target_changed", unknown=True)
        except (OSError, IOError, ValueError):
            return result("dpi_readback_unconfirmed", unknown=True)
        view = _dpi_view(target, confirmed, supported, can_set=confirmed in supported)
        if confirmed == value:
            return result(None, success=True, confirmed=confirmed)
        return result("dpi_readback_mismatch", unknown=not acknowledged, confirmed=confirmed)
    except (OSError, IOError, ValueError, TypeError, KeyError):
        return result("dpi_readback_unconfirmed" if attempted else "dpi_read_failed", unknown=attempted)
    finally:
        if channel is not None:
            channel.close()


class LogitechProvider(Provider):
    name = "logitech"

    def __init__(self):
        self._diag: List[str] = []
        # a slot is (product id, receiver instance, device index)
        self._ids: Dict[Tuple[int, str, int], Tuple[str, str, str]] = {}   # slot -> identity
        self._asleep: Set[Tuple[int, str, int]] = set()   # paired slots that stopped answering
        self._last: Dict[str, Tuple[DeviceStatus, float]] = {}
        self._slot_key: Dict[Tuple[int, str, int], str] = {}   # slot -> last icon key

    def _ping(self, ch: _Channel, slot: Tuple[int, str, int]) -> bool:
        """True if a device in this slot answers. Also records why a slot did not answer."""
        idx = slot[2]
        # A paired device that is asleep does not answer at all. That costs the full
        # ping timeout. Thus a slot that went silent gets the short timeout until it
        # answers again.
        timeout = TIMEOUT if slot in self._asleep else PING_TIMEOUT
        if ch.request(idx, F_ROOT, 1, timeout=timeout) is not None:
            self._asleep.discard(slot)
            return True
        name = self._ids.get(slot, ("",))[0] or "paired device"
        if not ch.error:
            self._asleep.add(slot)
            self._diag.append(f"  idx={idx} '{name}': no answer (asleep)")
            return False
        self._asleep.discard(slot)
        if ch.error_code == ERR_EMPTY_SLOT:
            # nothing paired here: forget the old name, a new device can take the slot
            self._ids.pop(slot, None)
        elif ch.error_code in (ERR_UNREACHABLE, ERR_CONNECT_FAIL):
            self._diag.append(f"  idx={idx} '{name}': switched off or out of range")
        elif ch.error_code == ERR_OLD_PROTOCOL:
            self._diag.append(f"  idx={idx}: HID++ 1.0 device")
        else:
            self._diag.append(f"  idx={idx}: error {ch.error_code:02x}")
        return False

    def _read(self, ch: _Channel, pid: int, idx: int,
              instance: str = "", multi: bool = False, paths=None) -> Optional[DeviceStatus]:
        slot = (pid, instance, idx)
        if not self._ping(ch, slot):
            if ch.error and ch.error_code == ERR_OLD_PROTOCOL:
                # HID++ 1.0: no feature table, but the old battery registers
                st = self._register_battery(ch, slot, pid, idx, instance, multi)
                if st is None:
                    self._diag.append(f"  idx={idx}: no battery register answered")
                return st
            return None
        identity_live = slot not in self._ids
        if slot in self._ids:
            name, kind, unit = self._ids[slot]
            if _gpw_identity(pid, name, kind, unit, idx, require_identity=False):
                # DPI controls never rely on the battery reader's cached unit.
                try:
                    fresh = ch.identity(idx)
                    if all(fresh):
                        name, kind, unit = fresh
                        self._ids[slot] = fresh
                        identity_live = True
                except (OSError, IOError, ValueError):
                    pass
        else:
            name, kind, unit = ch.identity(idx)
            # keep it only when the read worked; a device that just woke up can miss
            # a request, and a half-read identity would stick until the app restarts
            if name or unit:
                self._ids[slot] = (name, kind, unit)
        if pid in HEADSETS:
            name, kind = name or HEADSETS[pid], "headset"
        name = name or "Logitech device"
        for feature in BATTERY_FEATURES:
            fi = ch.feature_index(idx, feature)
            if not fi:
                continue
            r = ch.request(idx, fi, 1 if feature == F_UNIFIED else 0)
            if r is None:
                if feature == F_ADC and ch.error:
                    self._diag.append(f"  idx={idx} '{name}': headset connected but inactive")
                continue
            level, chg, approx = parse_battery(feature, r)
            self._diag.append(f"  idx={idx} '{name}' unit={unit or '?'} feature {feature:04x}: "
                              f"{hexdump(r, 4)} -> {approx or f'{level}%'}{' (charging)' if chg else ''}")
            if level is not None:
                battery_time = _dpi_now()
                # The unit id is stable across receiver and cable and tells identical
                # devices apart; without one, fall back to the receiver slot. Two
                # receivers of the same kind hand out the same unit ids, so the
                # receiver's instance joins the key only when there is more than one - a
                # single receiver keeps the plain key, and its devices keep their icons
                # between the receiver and the cable.
                prefix = instance + ":" if multi else ""
                key = f"logitech:{prefix}{unit}" if unit else f"logitech:{prefix}{pid:04x}:{idx}"
                # the key of a slot can change (the unit id was read later, or another
                # device took the slot): drop the old icon now, not after ASLEEP_KEEP
                old = self._slot_key.get(slot)
                if old and old != key:
                    self._last.pop(old, None)
                self._slot_key[slot] = key
                dpi, target = None, None
                if _gpw_identity(pid, name, kind, unit, idx, require_identity=False):
                    dpi, target = _capture_gpw_dpi(ch, pid, idx, instance, paths, name, kind, unit, identity_live)
                return DeviceStatus(key, name, level, chg, True, "logitech", approx=approx,
                                    kind=kind, dpi=dpi, dpi_target=target,
                                    measured_at_utc=battery_time if dpi is not None else None,
                                    queried_at_utc=battery_time if dpi is not None else None)
        # nothing from the 2.0 features: an older device may answer its
        # registers instead (it has no feature table at all)
        st = self._register_battery(ch, slot, pid, idx, instance, multi)
        if st is not None:
            return st
        self._diag.append(f"  idx={idx} '{name}': no battery reading")
        return None

    def _register_battery(self, ch: _Channel, slot, pid: int, idx: int,
                          instance: str, multi: bool) -> Optional[DeviceStatus]:
        """Battery of a HID++ 1.0 device, from the old registers (Solaar's way).

        A device without a feature table reports through registers instead; the
        charge register (0x0D) is tried first, then the status one (0x07) - the
        order Solaar uses for a register the device's descriptor does not name.
        Registers are only ever read.
        """
        for reg in (REG_BATTERY_CHARGE, REG_BATTERY_STATUS):
            r = ch.read_register(idx, reg)
            if r is None:
                continue
            level, chg, approx = parse_register_battery(reg, r)
            if level is None:
                continue
            name = self._ids.get(slot, ("",))[0] or "Logitech device"
            self._diag.append(f"  idx={idx} '{name}': register {reg:02x}: "
                              f"{approx or f'{level}%'}{' (charging)' if chg else ''}")
            prefix = instance + ":" if multi else ""
            key = f"logitech:{prefix}{pid:04x}:{idx}"
            old = self._slot_key.get(slot)
            if old and old != key:
                self._last.pop(old, None)
            self._slot_key[slot] = key
            return DeviceStatus(key, name, level, chg, True, "logitech",
                                approx=approx, kind="")
        return None

    @staticmethod
    def _collections(infos: List[dict]) -> Dict[Tuple[int, str], Dict[int, bytes]]:
        """The HID++ collections of each device: (pid, instance) -> {1: short, 2: long path}.
        Keyed by the receiver's instance too: the product id alone merges two receivers of
        the same kind (any two Unifying receivers are 0xC52B). A headset has only a long path."""
        groups: Dict[Tuple[int, str], Dict[int, bytes]] = {}
        headset: Dict[Tuple[int, str], bytes] = {}
        for d in infos:
            pid, page, usage = d["product_id"], d.get("usage_page"), d.get("usage")
            key = (pid, _instance(d))
            if page == 0xFF00 and usage in (1, 2):
                groups.setdefault(key, {})[usage] = d["path"]
            elif pid in HEADSETS and (page, usage) == HEADSET_COLLECTION.get(pid, (0xFF43, 0x0202)):
                # only the headsets in the list: other devices never got a request on
                # these collections, and must not get one now
                headset[key] = d["path"]
        # the ff00 collections win; the headset collection is used only without them
        for key, path in headset.items():
            if 2 not in groups.get(key, {}):
                groups.setdefault(key, {})[2] = path
        return groups

    def poll(self) -> List[DeviceStatus]:
        self._diag = []
        try:
            infos = hidlist.enumerate(LOGITECH_VID)
        except Exception as e:  # pragma: no cover
            log.warning("hid.enumerate(logitech): %s", e)
            infos = []

        groups = self._collections(infos)
        repeats = {pid for pid, _i in groups
                   if sum(1 for p, _j in groups if p == pid) > 1}   # more than one receiver
        found: Dict[str, DeviceStatus] = {}
        for (pid, inst), paths in groups.items():
            if 2 not in paths:
                continue
            product = next((d.get("product_string") or "" for d in infos if d["product_id"] == pid), "")
            receiver = pid in RECEIVERS or "receiver" in product.lower()
            tag = f" instance {inst}" if pid in repeats else ""
            self._diag.append(f"[Logitech] pid={pid:04x} '{product}'{tag}"
                              f"{' (headset)' if pid in HEADSETS else ''}")
            try:
                ch = _Channel(paths.get(1), paths[2])
            except (OSError, IOError) as e:
                self._diag.append(f"  open: {e}")
                continue
            try:
                for idx in (range(1, 7) if receiver else (0xFF,)):
                    st = self._read(ch, pid, idx, inst, pid in repeats, paths)
                    # the same device on the cable and through the receiver: charging wins
                    if st and (st.key not in found or st.charging):
                        found[st.key] = st
            except (OSError, IOError, ValueError) as e:
                self._diag.append(f"  error: {e}")
            finally:
                ch.close()

        now = time.time()
        out = list(found.values())
        for st in out:
            self._last[st.key] = (st, now)
        # asleep or switched off: keep the last value greyed out for a while
        for key, (st, t) in list(self._last.items()):
            if key in found:
                continue
            if now - t < ASLEEP_KEEP and groups:
                out.append(DeviceStatus(key, st.name, st.level, st.charging, False, "logitech",
                                        approx=st.approx, kind=st.kind))
            else:
                del self._last[key]
        return out

    def diagnostics(self) -> List[str]:
        return list(self._diag)

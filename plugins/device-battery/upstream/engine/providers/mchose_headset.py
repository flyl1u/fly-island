"""MCHOSE V9 PRO / V9 Turbo+, exact identities and FF90:0001 (level C).

Protocol facts: research/p2-protocols.md section 4, sources S8-S10 (MIT
projects and upstream hardware reports); S14 is corroboration only, no code
copied. Output/input reports include ID 55 and are exactly 64 bytes. Only
the battery query 55 65 01 is sent. V9 PRO first reads receiver firmware
through Feature AA/64; versions below 0008 cannot read battery in M HUB.
Unknown versions retain the original battery query. Cache either result per
receiver until removal, so polling does not repeatedly send Feature AA.
No EQ, configuration or firmware-update commands are sent.
Turbo+ 3837:600A: 用户实机抓包，#61 confirms 80% discharge twice. Its
charging/off states remain untested; 3837:6008 is lighting, never a target.

00/03 mean external power, including fully charged while plugged in. Their
percentage is frozen and must not be displayed. 1A explicitly means off;
silence is not evidence of power-off. Topology supplies the HID caps and
physical grouping; unknown lengths fail closed before opening for I/O.
"""
from __future__ import annotations

import math
import time

try:
    import hid
except ImportError:              # pragma: no cover
    hid = None

from topology import physical_groups
from . import hidlist
from .base import DeviceStatus, Provider, hexdump, log

PIDS = {
    (0x291D, 0x385D): "MCHOSE V9 PRO",
    (0x3837, 0x600A): "MCHOSE V9 Turbo+",
}
USAGE_PAGE, USAGE = 0xFF90, 0x0001
REPORT_LEN = 64
READ_TIMEOUT_MS = 1000
MAX_READS = 32
PRO_ID = (0x291D, 0x385D)
FIRMWARE_COLLECTION = (0xFF22, 0x0001)
FIRMWARE_REQUEST = [0xAA, 0x01, 0x01] + [0] * 61
FIRMWARE_READ_DELAY_SECONDS = 0.3


def make_request():
    return [0x55, 0x65, 0x01] + [0] * 61


def parse_reply(reply):
    """Return (level, external power, online), or reject malformed evidence."""
    if len(reply) != REPORT_LEN or list(reply[:2]) != [0x55, 0x65]:
        return None
    level, state = reply[2:4]
    if state == 0x02 and 0 <= level <= 100:
        return level, False, True
    if state in (0x00, 0x03):
        return None, True, True
    if state == 0x1A:
        return None, False, False
    return None


def parse_receiver_firmware(reply):
    """M HUB BLK's decimal concatenation of four version bytes, not hex/BCD."""
    if (len(reply) != REPORT_LEN
            or any(type(value) is not int or not 0 <= value <= 255 for value in reply)
            or list(reply[:2]) != [0xAA, 0x01]
            or list(reply) == FIRMWARE_REQUEST):
        return None
    return int("".join(str(value) for value in reply[2:6]), 10)


class MchoseHeadsetProvider(Provider):
    name = "mchose_headset"

    def __init__(self):
        self._diag = []
        self._firmware_versions = {}  # (physical, battery path) -> version, or None when unknown
        self._seen = set()

    def _pick(self, infos):
        for info in infos:
            if ((info.get("vendor_id"), info.get("product_id")) not in PIDS
                    or (info.get("usage_page"), info.get("usage")) != (USAGE_PAGE, USAGE)):
                continue
            lengths = (info.get("input_report_length"), info.get("output_report_length"))
            if lengths != (REPORT_LEN, REPORT_LEN):
                self._diag.append(f"  input/output lengths {lengths}; require 64/64: nothing sent")
                continue
            return info
        self._diag.append("  no eligible V9 PRO/Turbo+ ff90:0001 collection: nothing sent")
        return None

    def _pick_firmware(self, infos):
        # M HUB addresses Feature AA. #305 supplies the FF22 feature-only
        # sibling; its maximum alone does not prove report AA exists.
        candidates = [info for info in infos
                      if (info.get("vendor_id"), info.get("product_id")) == PRO_ID
                      and (info.get("usage_page"), info.get("usage")) == FIRMWARE_COLLECTION]
        if len(candidates) == 1:
            info = candidates[0]
            if (info.get("path") and type(info.get("feature_report_length")) is int
                    and info["feature_report_length"] == REPORT_LEN
                    and info.get("feature_report_sizes") == {"170": REPORT_LEN}
                    and type(info["feature_report_sizes"]["170"]) is int):
                return info
        self._diag.append("  缺少唯一且描述符证明的 FF22:0001 Feature AA/64")
        return None

    def _read_receiver_firmware(self, path):
        dev = None
        try:
            dev = hid.device()
            dev.open_path(path)
            # audio.blk.readFirmwareVersion, RECEIVER=1. This selects a read
            # target; it is distinct from BLK's OTA control/data reports.
            if dev.send_feature_report(FIRMWARE_REQUEST) != REPORT_LEN:
                self._diag.append("  接收器固件版本读取失败：查询写入失败或不完整")
                return None
            time.sleep(FIRMWARE_READ_DELAY_SECONDS)
            version = parse_receiver_firmware(dev.get_feature_report(0xAA, REPORT_LEN))
            if version is None:
                self._diag.append("  接收器固件版本回复无效")
            return version
        except (OSError, ValueError, TypeError):
            self._diag.append("  接收器固件版本读取失败")
        finally:
            try:
                if dev is not None:
                    dev.close()
            except Exception:
                pass
        return None

    def _query(self, path):
        dev = hid.device()
        try:
            dev.open_path(path)
            if dev.write(make_request()) != REPORT_LEN:
                self._diag.append("  battery query write failed or short; no retry")
                return None
            deadline = time.monotonic() + READ_TIMEOUT_MS / 1000
            for _ in range(MAX_READS):
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    break
                reply = dev.read(REPORT_LEN, max(1, math.ceil(remaining * 1000)))
                if not reply:
                    break
                if list(reply[:2]) != [0x55, 0x65]:
                    self._diag.append(f"  skipped non-battery frame: {hexdump(reply, 4)}")
                    continue
                if len(reply) != REPORT_LEN:
                    self._diag.append(f"  rejected battery frame length {len(reply)} (expected 64)")
                    continue
                parsed = parse_reply(reply)
                if parsed is None:
                    self._diag.append(f"  rejected battery state=0x{reply[3]:02x} level={reply[2]}")
                    continue
                self._diag.append(f"  battery reply: {hexdump(reply, 4)}")
                return parsed
            self._diag.append("  no valid battery reply within deadline/read limit; connection unknown")
        except (OSError, ValueError) as error:
            self._diag.append(f"  battery I/O: {error}")
        finally:
            try:
                dev.close()
            except Exception:
                pass
        return None

    def poll(self):
        self._diag = []
        self._seen = set()
        if hid is None:
            return []
        infos = []
        for vid in sorted({vid for vid, _ in PIDS}):
            try:
                infos.extend(hidlist.enumerate(vid))
            except Exception as error:  # pragma: no cover
                log.warning("hid.enumerate(mchose_headset, %04x): %s", vid, error)
        matched = [info for info in infos
                   if (info.get("vendor_id"), info.get("product_id")) in PIDS]
        out = []
        for physical, group in physical_groups(matched).items():
            # Keep cached results while the receiver path is still present,
            # even if descriptor capabilities are temporarily unavailable.
            self._seen.update((physical, item.get("path")) for item in group
                              if (item.get("vendor_id"), item.get("product_id")) == PRO_ID)
            info = self._pick(group)
            if info is None:
                continue
            if (info["vendor_id"], info["product_id"]) == PRO_ID:
                key = (physical, info["path"])
                if key not in self._firmware_versions:
                    firmware_info = self._pick_firmware(group)
                    self._firmware_versions[key] = (self._read_receiver_firmware(firmware_info["path"])
                                                    if firmware_info is not None else None)
                version = self._firmware_versions[key]
                if version is None:
                    self._diag.append("  接收器固件版本未知，按原方式查询")
                elif version < 8:
                    self._diag.append("  接收器固件低于 0008，官方驱动也不支持电量")
                    continue
            reading = self._query(info["path"])
            if reading is None:
                continue
            level, charging, online = reading
            out.append(DeviceStatus(
                f"mchose_headset:{physical}", PIDS[info["vendor_id"], info["product_id"]],
                level, charging, online, self.name, kind="headset",
                connection_known=True, charging_known=online, physical_id=physical,
                level_unavailable=level is None))
        for key in [key for key in self._firmware_versions if key not in self._seen]:
            del self._firmware_versions[key]
        return out

    def diagnostics(self):
        return list(self._diag)

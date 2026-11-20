"""Receive-only FA60/FA65 web and exact legacy FA65 IN10 battery prefixes.

Shared IDs and model bytes do not prove a brand. Use neutral names, an exact
per-PID collection/model allow-list and descriptor-proven input lengths.
No requests, initialization, charging interpretation or zero readings.
Keep handles open between polls, drain queued inputs and retain silent history
until the receiver disappears, following the passive Rapoo lifecycle.
"""
from __future__ import annotations

from dataclasses import replace
from datetime import datetime, timezone
import time

import hid

from battery_hid import report_proof_summary
from . import hidlist
from .base import DeviceStatus, Provider

VID = 0x1D57
PIDS = {
    0xFA60: "2.4G 无线鼠标（1D57:FA60）",
    0xFA65: "2.4G 无线鼠标（1D57:FA65）",
}
COLLECTIONS = {0xFA60: (0x000A, 0x0000), 0xFA65: (0xFF00, 0x0001)}
# INPHIC web page bundle k=JSON.parse, byte 2501; FA60 8E: #490 user samples.
# See upstream-protocols.md; the added model has a narrower prefix below.
MODELS = {
    0xFA60: frozenset((0x07, 0x76, 0x77, 0x78, 0x79, 0x8E, 0xE8)),
    0xFA65: frozenset((0x71, 0x76, 0x77, 0x78, 0x79, 0x90)),
}
INPUT_ID = 0x03
READ_WINDOW_MS = 1500
MAX_READS = 32
DRAIN_TIMEOUT_MS = 1
MAX_DRAIN = 256


def parse_battery(raw, pid):
    """Hidapi bytes include the report ID; five bytes are only a prefix.

    State byte 3 has conflicting meanings across shared receivers. Never
    synthesize a percentage or charging state from it. Zero is not displayed.
    """
    if (len(raw) < 5 or raw[0] != INPUT_ID or raw[1] not in MODELS.get(pid, ())
            or raw[2] not in (0x40, 0x41) or not 1 <= raw[4] <= 100):
        return None
    # Only the 40/01 prefix was reported for SC650; other models retain their
    # existing 40/41 and state rules. This is not evidence of charging state.
    if raw[1] == 0x8E and (raw[2], raw[3]) != (0x40, 0x01):
        return None
    return raw[4]


def parse_legacy_battery(raw):
    """Native IN10 prefix, after the caller checks the proven report length.

    Native states 2/3 display synthetic full/charging UI, not byte-4 readings.
    This route accepts only model 93/event 40; web model/event rules are separate.
    """
    if (len(raw) < 5 or raw[0] != INPUT_ID or raw[1] != 0x93 or raw[2] != 0x40
            or raw[3] in (2, 3) or not 1 <= raw[4] <= 100):
        return None
    return raw[4]


def parse_unnumbered_8e_battery(raw):
    """Exact SC650 frame on the descriptor-proven unnumbered FA60 route."""
    if (len(raw) != 5 or raw[0] != INPUT_ID or raw[1] != 0x8E
            or (raw[2], raw[3]) != (0x40, 0x01) or not 1 <= raw[4] <= 100):
        return None
    return raw[4]


def legacy_release(info):
    release = info.get("release_number")
    return type(release) is int and 0 <= release <= 0xFFFF and release & 0xFF == 0x16


def collection_identity(info):
    return tuple(info.get(key) for key in (
        "path", "vendor_id", "product_id", "physical_id", "usage_page", "usage", "release_number"))


class Fa6xPassiveProvider(Provider):
    name = "fa6x_passive"

    def __init__(self):
        self._diag = []
        self._last = {}
        self._paths = {}
        self._handles = {}

    def _pick(self, infos):
        companions = [d for d in infos
                      if (d.get("vendor_id"), d.get("product_id"), d.get("usage_page"), d.get("usage"))
                      == (VID, 0xFA65, 0xFF00, 1)]
        states = [d for d in infos
                  if (d.get("vendor_id"), d.get("product_id"), d.get("usage_page"), d.get("usage"))
                  == (VID, 0xFA65, 0x000A, 0)]
        # A proven release-16 marker on either side blocks web fallback even
        # if its peer or proof is missing; a bare state collection does not.
        if any(legacy_release(d) for d in companions + states):
            info = self._pick_legacy(companions, states)
            if info is None:
                return None
        else:
            candidates = [d for d in infos
                          if d.get("vendor_id") == VID and d.get("product_id") in PIDS
                          and (d.get("usage_page"), d.get("usage")) == COLLECTIONS[d["product_id"]]]
            if len(candidates) != 1 or not candidates[0].get("path"):
                self._diag.append("missing or ambiguous passive input collection; not opened")
                return None
            info = candidates[0]
        maximum, sizes = info.get("input_report_length"), info.get("input_report_sizes")
        if (info.get("fa6x_variant") != "legacy_in10"
                and info.get("product_id") == 0xFA60
                and (info.get("usage_page"), info.get("usage")) == (0x000A, 0)
                and isinstance(sizes, dict) and "0" in sizes):
            # #490 has no Report ID: the firmware fills the leading slot with
            # 03. A mixed 0/3 map must not fall through to the numbered route.
            if (type(maximum) is not int or maximum != 5 or sizes != {"0": 5}
                    or type(sizes["0"]) is not int
                    or info.get("input_report_proof") != "descriptor"):
                self._diag.append("unnumbered FA60 frame proof incomplete; not opened")
                return None
            return dict(info, fa6x_variant="unnumbered_8e")
        if (type(maximum) is not int or not 5 <= maximum <= 4096
                or not isinstance(sizes, dict) or not sizes
                or any(type(n) is not int or not 2 <= n <= maximum for n in sizes.values())
                or max(sizes.values()) != maximum
                or type(sizes.get("3")) is not int or not 5 <= sizes["3"] <= maximum):
            self._diag.append("input report 03 length unproven"
                              + report_proof_summary(info, "input", include_declared=True)
                              + "; not opened")
            return None
        return info

    def _pick_legacy(self, companions, states):
        if len(companions) != 1:
            self._diag.append("legacy FA65 companion missing or ambiguous; not opened")
            return None
        if len(states) != 1:
            self._diag.append("legacy FA65 state collection missing or ambiguous; not opened")
            return None
        companion, state = companions[0], states[0]
        physical = state.get("physical_id")
        if (not isinstance(physical, str) or not physical or physical.startswith("collection:")
                or companion.get("physical_id") != physical):
            self._diag.append("legacy FA65 physical parent unproven; not opened")
            return None
        if not all(legacy_release(d) for d in (companion, state)):
            self._diag.append("legacy FA65 release unproven; not opened")
            return None
        if not all(isinstance(d.get("path"), (bytes, str)) and d["path"]
                   and (b"\0" if isinstance(d["path"], bytes) else "\0") not in d["path"]
                   for d in (companion, state)) or state["path"] == companion["path"]:
            self._diag.append("legacy FA65 collection path unproven; not opened")
            return None
        # The communication collection is metadata only. Never open/read it.
        return dict(state, fa6x_variant="legacy_in10", fa6x_companion=collection_identity(companion))

    def _receive(self, dev, info, newly_opened):
        """Brief first listen; thereafter drain only, keeping the latest value."""
        unnumbered = info.get("fa6x_variant") == "unnumbered_8e"
        expected_length = 5 if unnumbered else info["input_report_sizes"]["3"]
        deadline = time.monotonic() + READ_WINDOW_MS / 1000
        newest = None
        for index in range(MAX_DRAIN):
            remaining_ms = min(READ_WINDOW_MS, int((deadline - time.monotonic()) * 1000))
            if remaining_ms <= 0:
                break
            waiting = newly_opened and newest is None
            if waiting and index >= MAX_READS:
                break
            raw = dev.read(info["input_report_length"], remaining_ms if waiting else DRAIN_TIMEOUT_MS)
            if not raw:
                break
            if len(raw) != expected_length:
                continue
            if unnumbered:
                parsed = parse_unnumbered_8e_battery(raw)
            else:
                parsed = (parse_legacy_battery(raw) if info.get("fa6x_variant") == "legacy_in10"
                          else parse_battery(raw, info["product_id"]))
            if parsed is not None:
                newest = parsed
        if newest is None:
            self._diag.append("no battery notification; no new measurement")
        return newest

    def _release(self, physical):
        entry = self._handles.pop(physical, None)
        if entry is not None:
            dev = entry[1]
            try:
                dev.close()
            except OSError:
                self._diag.append("HID handle close failed")

    def close(self):
        for physical in list(self._handles):
            self._release(physical)

    def __del__(self):
        try:
            self.close()
        except Exception:
            pass

    @staticmethod
    def _historical(status):
        return replace(status, online=False, cached=True, wake_on_input=True,
                       connection_known=False, charging_known=False)

    def poll(self):
        self._diag = []
        try:
            inventory = hidlist.enumerate(VID)
        except OSError:
            self._diag.append("enumeration failed; retaining history")
            return [self._historical(s) for s in self._last.values()]
        groups, present_paths = {}, set()
        for info in inventory:
            if info.get("vendor_id") != VID or info.get("product_id") not in PIDS:
                continue
            present_paths.add(info.get("path"))
            physical = info.get("physical_id", "")
            if not physical or physical.startswith("collection:"):
                self._diag.append("USB parent unproven; collection uniqueness unknown; not opened")
                continue
            groups.setdefault(physical, []).append(info)
        result, found = [], set()
        for physical, infos in groups.items():
            self._paths[physical] = {d.get("path") for d in infos if d.get("path")}
            reading = None
            info = self._pick(infos)
            if info is None:
                self._release(physical)
            else:
                identity = (info.get("fa6x_variant", "web"), collection_identity(info),
                            info.get("fa6x_companion"), info["input_report_length"],
                            frozenset(info["input_report_sizes"].items()))
                entry = self._handles.get(physical)
                if entry is not None and entry[0] != identity:
                    self._release(physical)
                    entry = None
                try:
                    if entry is None:
                        dev = hid.device()
                        try:
                            dev.open_path(info["path"])
                        except (OSError, ValueError):
                            try:
                                dev.close()
                            except OSError:
                                pass
                            raise
                        self._handles[physical] = (identity, dev)
                    else:
                        dev = entry[1]
                    reading = self._receive(dev, info, newly_opened=entry is None)
                except (OSError, ValueError):
                    self._diag.append("input read failed; no new measurement")
                    self._release(physical)
            if reading is not None:
                received = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
                status = DeviceStatus(
                    f"{self.name}:{physical}", PIDS[info["product_id"]],
                    reading, False, True, self.name, kind="mouse",
                    physical_id=physical, connection_known=True,
                    charging_known=False, verification_level="C",
                    measured_at_utc=received, queried_at_utc=received)
                self._last[physical] = status
                found.add(physical)
                result.append(status)
        # Silence, descriptor loss and temporary parent-resolution failure do
        # not expire history. Absence of both the parent and its paths does.
        for physical in list(self._paths):
            if physical in found:
                continue
            if physical in groups or self._paths[physical] & present_paths:
                if physical in self._last:
                    result.append(self._historical(self._last[physical]))
            else:
                self._last.pop(physical, None)
                del self._paths[physical]
        for physical in [p for p in self._handles if p not in groups]:
            self._release(physical)
        return result

    def diagnostics(self):
        return list(self._diag)

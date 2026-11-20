"""Razer devices (headsets, mice, keyboards with a wireless receiver).

Protocol: a 90-byte feature report (report id 0), the same one Synapse and
OpenRazer use.

    [0]  status         (0x00 in a request; 0x02 = OK, 0x01 = busy, 0x03 = failure,
                         0x04 = timeout / device not responding, 0x05 = not supported)
    [1]  transaction id (0x1f for most mice, 0x3f for headsets, 0xff for older ones)
    [2..3] remaining packets
    [4]  protocol type
    [5]  data size
    [6]  command class  (0x07 = power)
    [7]  command id     (0x80 = battery level, 0x84 = charging)
    [8..87] arguments   (arg[1] = value)
    [88] crc = XOR of bytes 2..87
    [89] reserved
"""
from __future__ import annotations

import time
from dataclasses import replace
from typing import Dict, List, Optional, Tuple

import hid

from . import blackshark, blackshark2020, hidlist
from .base import DeviceStatus, Provider, hexdump, log

from .razer_profiles import RAZER_VID, KNOWN, KEYBOARD_INTERFACE
from .profiles import builtins, profiles

TRANSACTION_IDS = (0x1F, 0x3F, 0xFF, 0x9F, 0x08)

# Devices that are not in KNOWN are only polled when their name suggests a
# battery: some wired Razer devices (e.g. the Huntsman V2 keyboard) answer the
# battery command too, with a meaningless value.
WIRELESS_WORDS = ("hyperspeed", "wireless", "receiver", "dongle", "dock",
                  "blackshark", "barracuda", "nari")


def maybe_wireless(pid: int, name: str) -> bool:
    n = name.lower()
    return pid in KNOWN or pid in blackshark.PA_PIDS or any(w in n for w in WIRELESS_WORDS)

STATUS_OK = 0x02
STATUS_BUSY = 0x01
STATUS_TIMEOUT = 0x04     # receiver present, device not responding (off / asleep)
STATUS_NOT_SUPPORTED = 0x05
# Not a Razer status byte (those fit in a byte): every packet read back belonged to
# another command, i.e. to another app that talks to the same collection. RGB software
# sending lighting frames (class 0x0f) does this many times a second, and each of its
# requests overwrites the device's reply buffer (issue #108: 13 reads in a row carried
# "0f:03", OpenRazer's set_custom_frame, with a new transaction id each time).
STATUS_FOREIGN = 0x100
# how many times one request is sent while only foreign packets come back
SENDS = 3

# How long a device that stopped answering keeps its last value, greyed out (the
# translucent icon the README describes for a sleeping mouse), before the icon goes
# away. Same value as the WLmouse provider uses.
ASLEEP_KEEP = 300


def build_request(transaction_id: int, cmd_class: int, cmd_id: int, size: int = 0x02) -> bytes:
    msg = bytearray(90)
    msg[1] = transaction_id
    msg[5] = size
    msg[6] = cmd_class
    msg[7] = cmd_id
    crc = 0
    for b in msg[2:88]:
        crc ^= b
    msg[88] = crc
    return bytes(msg)


def normalize_reply(resp) -> Optional[List[int]]:
    """hidapi on Windows returns the reply with the report id as the first byte."""
    if not resp:
        return None
    data = list(resp)
    if len(data) >= 91:
        data = data[1:91]
    if len(data) < 90:
        return None
    return data


def parse_reply(data: List[int], cmd_class: int, cmd_id: int) -> Tuple[int, Optional[int]]:
    """-> (status, arg1). arg1 is None if the reply is not for our command."""
    status = data[0]
    if data[6] != cmd_class or data[7] != cmd_id:
        return status, None
    return status, data[9]


class _Cand:
    """Cached working HID interface and transaction id for a PID."""

    def __init__(self, path: bytes, tid: int):
        self.path = path
        self.tid = tid


class RazerProvider(Provider):
    name = "razer"

    def __init__(self, device_pack=None):
        self._cache: Dict[Tuple[int, str], _Cand] = {}
        self._foreign: Dict[Tuple[int, str], int] = {}
        self._rediscovery: Dict[Tuple[int, str], Tuple[bytes, int]] = {}
        self._dead: Dict[bytes, float] = {}   # interfaces known not to respond
        self._diag: List[str] = []
        self._failing: Dict[str, str] = {}    # key -> reason of the ongoing failure
        self._last: Dict[str, Tuple[int, bool, float]] = {}   # last good level per device
        self.configure_pack(device_pack)

    def configure_pack(self, device_pack):
        from device_pack import EMPTY_PACK
        self.device_pack = device_pack or EMPTY_PACK
        self._pack_entries = {e.match.product_id: e for e in self.device_pack.entries
                              if e.provider == self.name}
        self._profiles = {(p.name, p.revision): p for p in profiles() if p.provider == self.name}
        self._known = {d.product_id: (d.name, dict(self._profiles[d.profile, d.profile_rev].parameters)["transaction_id"])
                       for d in builtins() if d.provider == self.name}
        for pid, entry in self._pack_entries.items():
            self._known[pid] = (entry.name, dict(self._profiles[entry.profile, entry.profile_rev].parameters)["transaction_id"])
        self._known = {pid: row for pid, row in self._known.items()
                       if not self.device_pack.is_disabled(self.name, RAZER_VID, pid)}
        self._cache.clear()
        self._foreign.clear()
        self._rediscovery.clear()
        self._dead.clear()
        self._last.clear()
        self._failing.clear()
        self._read_errors = set()
        self._public_errors = set()

    def failure_code(self) -> str:
        """One bounded, identity-free cause for the existing reader-health UI.

        Prefer evidence from a reply over failures opening unrelated collections.
        This reports an observation, not a diagnosis of Synapse or device sleep.
        Legacy diagnostics include raw OS errors and must remain local.
        """
        priorities = {"no_reply": 0, "no_usable_interface": 1,
                      "interfaces_cooling_down": 2, "enumerate_failed": 3,
                      "open_failed": 4, "send_failed": 5, "get_failed": 6,
                      "short_reply": 7, "busy_timeout": 9, "device_timeout_04": 10,
                      "foreign_reply": 11}
        if not self._public_errors:
            return ""
        cause = max(self._public_errors, key=lambda c: (priorities.get(c, 8), c))
        return "razer_" + cause

    # ---- low level -------------------------------------------------------
    def _send(self, dev, req: bytes, tid: int) -> bool:
        try:
            dev.send_feature_report(b"\x00" + req)
        except (OSError, ValueError) as e:
            self._diag.append(f"    send tid={tid:02x}: {e}")
            self._read_errors.add("send_failed")
            return False
        return True

    def _query(self, dev, tid: int, cmd_class: int, cmd_id: int) -> Tuple[Optional[int], Optional[int]]:
        req = build_request(tid, cmd_class, cmd_id)
        if not self._send(dev, req, tid):
            return None, None
        sends, foreign = 1, 0
        # The device does not reply instantly: poll for up to ~1 s while status is "busy".
        deadline = time.time() + 1.0
        time.sleep(0.06)
        while True:
            try:
                resp = dev.get_feature_report(0x00, 91)
            except (OSError, ValueError) as e:
                self._diag.append(f"    get tid={tid:02x}: {e}")
                self._read_errors.add("get_failed")
                return None, None
            data = normalize_reply(resp)
            if data is None:
                self._diag.append(f"    short reply: {hexdump(resp)}")
                self._read_errors.add("short_reply")
                return None, None
            status, value = parse_reply(data, cmd_class, cmd_id)
            self._diag.append(
                f"    tid={tid:02x} cmd={cmd_class:02x}:{cmd_id:02x} -> status={status:02x} "
                f"tid'={data[1]:02x} raw={hexdump(data, 12)}")
            # Keep reading while the device is busy, and also while the packet in hand is
            # not the answer to this command. The status byte alone cannot tell the two
            # apart: Razer Synapse polls the same collection (LED state is class 0x0f) and
            # its replies carry status 0x02 exactly like ours. Giving up on the first reply
            # is how a DeathAdder V2 Pro answered a class 0x07:0x80 battery request with
            # "status=02 tid'=1f cmd=0f:03" and got written off as "off or asleep" - see
            # issue #3. Whether the real reply is behind that packet in the queue is not
            # verified on that hardware; reading on is strictly better than stopping.
            # (only a success status can hide somebody else's packet: 04 asleep and 05
            # not supported are final answers and come back right away)
            is_foreign = status == STATUS_OK and value is None
            if time.time() < deadline and (status == STATUS_BUSY or is_foreign):
                if is_foreign:
                    foreign += 1
                    # The other app's request may have replaced ours before the device
                    # read it, and then our answer never comes: ask again, a few times.
                    if foreign % 4 == 0 and sends < SENDS:
                        if not self._send(dev, req, tid):
                            return None, None
                        sends += 1
                        self._diag.append(f"    sent tid={tid:02x} again ({sends} of {SENDS})")
                time.sleep(0.08)
                continue
            if is_foreign:
                # a success status on somebody else's packet is not an answer to ours
                self._diag.append("    reply command did not match; cause unconfirmed")
                return STATUS_FOREIGN, None
            return status, value

    def _read(self, path: bytes, tid: int) -> Tuple[Optional[int], Optional[int], Optional[bool]]:
        """-> (status, level%, charging)"""
        dev = hid.device()
        try:
            dev.open_path(path)
        except (OSError, IOError) as e:
            self._diag.append(f"    open: {e}")
            self._read_errors.add("open_failed")
            return None, None, None
        try:
            status, raw = self._query(dev, tid, 0x07, 0x80)
            if status != STATUS_OK or raw is None:
                if status is not None:
                    self._read_errors.add(
                        "foreign_reply" if status == STATUS_FOREIGN else
                        "busy_timeout" if status == STATUS_BUSY else
                        "device_timeout_04" if status == STATUS_TIMEOUT else
                        f"reply_status_{status:02x}")
                return status, None, None
            level = round(raw / 255 * 100)
            cst, craw = self._query(dev, tid, 0x07, 0x84)
            charging = bool(craw) if cst == STATUS_OK and craw is not None else False
            return status, level, charging
        finally:
            try:
                dev.close()
            except Exception:
                pass

    # ---- high level ------------------------------------------------------
    def poll(self) -> List[DeviceStatus]:
        """One icon for a mouse on its cable while its receiver stays plugged in.

        On the cable the mouse is a second PID with the same name in KNOWN, and the
        receiver then answers "not responding". Its greyed copy of the last level stayed
        next to the live icon of the cable for ASLEEP_KEEP. A greyed icon is dropped when
        another PID of the same model answers in the same poll. Two live icons stay: that
        is two mice of the same model, one on the receiver and one on the cable."""
        out = self._poll_devices()
        models = {name for name, _tid in self._known.values()}
        live: Dict[str, set] = {}       # model name -> PIDs that answered (key "razer:<pid>:...")
        for s in out:
            if s.online and s.name in models:
                live.setdefault(s.name, set()).add(s.key.split(":")[1])
        return [s for s in out
                if s.online or not live.get(s.name, set()) - {s.key.split(":")[1]}]

    def _poll_devices(self) -> List[DeviceStatus]:
        self._diag = []
        self._public_errors = set()
        try:
            infos = hidlist.enumerate(RAZER_VID)
        except Exception as e:  # pragma: no cover
            log.warning("hid.enumerate(razer): %s", e)
            self._public_errors.add("enumerate_failed")
            return []

        # group interfaces by device (PID + serial / location)
        groups: Dict[Tuple[int, str], List[dict]] = {}
        for d in infos:
            pid = d["product_id"]
            if self.device_pack.is_disabled(self.name, RAZER_VID, pid):
                self._diag.append(f"  disabled: razer {RAZER_VID:04x}:{pid:04x}")
                continue
            pack_entry = self._pack_entries.get(pid)
            if pack_entry and not pack_entry.match.matches(dict(d, vendor_id=RAZER_VID)):
                continue
            serial = d.get("serial_number") or ""
            groups.setdefault((pid, serial), []).append(d)

        # Windows re-parents some collections: Razer Synapse creates RZVIRTUAL
        # children for a mouse's extra buttons, and hidapi reports those with an
        # empty serial and no strings. Grouped by serial they look like a second,
        # identical device that can never answer, so every poll logs a "poll
        # failed" line for a device that is fine (and if one ever did answer, the
        # same mouse would get a second icon). Attach them to the real device of
        # the same PID when there is exactly one.
        named: Dict[int, List[str]] = {}
        for pid, serial in groups:
            if serial:
                named.setdefault(pid, []).append(serial)
        for (pid, serial) in list(groups):
            if not serial and len(named.get(pid, [])) == 1:
                groups[(pid, named[pid][0])] += groups.pop((pid, serial))

        for gkey in set(self._foreign) | set(self._rediscovery):
            if gkey not in groups:
                self._clear_foreign(gkey)

        out: List[DeviceStatus] = []
        for (pid, serial), ifaces in groups.items():
            pack_entry = self._pack_entries.get(pid)
            name, pref_tid = self._known.get(pid, (None, None))
            if not name:
                name = (ifaces[0].get("product_string") or f"Razer {pid:04x}").strip()
            key = f"razer:{pid:04x}:{serial}"
            kind = pack_entry.kind if pack_entry else "keyboard" if pid in KEYBOARD_INTERFACE else ""
            diag_from = len(self._diag)
            self._diag.append(f"[Razer] {name} pid={pid:04x}, interfaces: {len(ifaces)}")
            if pid == blackshark2020.CABLE_PID:
                self._diag.append("  skipped: 2020 charging cable; battery is read from receiver 0528")
                continue
            if not pack_entry and not maybe_wireless(pid, name):
                self._diag.append("  skipped: not a known wireless device")
                continue
            if pid == 0x053A:
                # The Barracuda Pro's receiver does not answer the mouse request this
                # provider sends; it speaks the headset "PA" protocol instead, which
                # providers/barracuda.py reads.
                self._diag.append("  skipped: read by the barracuda provider (own PA protocol)")
                continue
            is_headset = (pack_entry.kind == "headset" if pack_entry
                          else pid in blackshark.PA_PIDS or "blackshark" in name.lower())
            self._read_errors = set()
            if pack_entry:
                # Pack metadata cannot activate PA remote mode or another TID.
                st = self._poll_group((pid, serial), ifaces, pref_tid, profile_only=True)
            elif pid == blackshark2020.PID:
                # Deliberately no generic/PA fallback: the 0528 hardware rejects
                # their reads/writes. A missing fresh feature reply means no reading.
                st = self._poll_2020(ifaces)
            elif pid in blackshark.PA_PIDS:
                # 2023 headset: its own protocol first
                st = self._poll_pa((pid, serial), ifaces)
                if st is None:
                    st = self._poll_group((pid, serial), ifaces, pref_tid)
            else:
                st = self._poll_group((pid, serial), ifaces, pref_tid)
                if is_headset and (st is None or st[0] != STATUS_OK):
                    pa = self._poll_pa((pid, serial), ifaces)
                    if pa is not None and (st is None or pa[0] == STATUS_OK):
                        st = pa
            if st is None or st[0] != STATUS_OK:
                self._public_errors.update(self._read_errors or {"no_reply"})
                # failed poll: the details go to the log once, when the device stops
                # answering (or the reason changes), not on every poll while it is off
                reason = ("no reply" if st is None else
                          "reply command mismatch; cause unconfirmed" if st[0] == STATUS_FOREIGN else
                          f"status {st[0]:02x}")
                if self._failing.get(key) != reason:
                    self._failing[key] = reason
                    log.info("[Razer] %s: poll failed (%s); not logged again until it changes",
                             name, reason)
                    for line in self._diag[diag_from:]:
                        log.info("%s", line)
                # STATUS_TIMEOUT covers a switched-off device and one that fell asleep
                # a few seconds after the last movement, and the receiver cannot tell
                # them apart. Keep the last value (greyed out, the translucent icon
                # the README describes) for a while and let the icon go away after
                # that; it comes back as soon as the device answers again. The same
                # thing the WLmouse provider does for a silent mouse.
                #
                # Headsets are left alone: the README says a switched-off headset
                # disappears from the tray, and no Razer headset is on hand to test a
                # sleeping one, so they keep exactly the behaviour they had before.
                last = self._last.get(key)
                if not is_headset and last and time.time() - last[2] < ASLEEP_KEEP:
                    out.append(DeviceStatus(key, name, last[0], last[1], False, "razer", kind=kind))
                continue
            elif self._failing.pop(key, None) is not None:
                log.info("[Razer] %s: answering again", name)
            status, level, charging = st
            if status == STATUS_OK:
                if level is not None:
                    self._last[key] = (level, bool(charging), time.time())
                approx = ""
                if pid == blackshark2020.PID and level is None:
                    approx = "battery level unknown"
                    if charging:
                        approx += ", charging"
                if pid == blackshark2020.PID and charging is None:
                    approx = (approx or f"{level}%") + ", charging state unknown"
                out.append(DeviceStatus(key, name, level, bool(charging), True, "razer",
                                        approx=approx, kind=kind))
        return [replace(status, model_source="pack", pack_version=self.device_pack.version,
                        verification_level=entry.level, model_reference=entry.source,
                        dpi=None, dpi_target=None)
                if (entry := self._pack_entries.get(int(status.key.split(":")[1], 16))) else status
                for status in out]

    def _clear_foreign(self, gkey):
        self._foreign.pop(gkey, None)
        self._rediscovery.pop(gkey, None)

    def _poll_group(self, gkey, ifaces, pref_tid, profile_only=False):
        tids = [pref_tid] if pref_tid else []
        if not profile_only:
            tids += [t for t in TRANSACTION_IDS if t not in tids]
        cached = self._cache.get(gkey)
        if cached and (cached.path not in {d["path"] for d in ifaces} or cached.tid not in tids):
            self._cache.pop(gkey, None)
            self._clear_foreign(gkey)
            cached = None
        if cached:
            status, level, charging = self._read(cached.path, cached.tid)
            if status in (STATUS_OK, STATUS_TIMEOUT):
                self._clear_foreign(gkey)
                return status, level, charging
            self._cache.pop(gkey, None)
            if status == STATUS_FOREIGN:
                self._foreign[gkey] = self._foreign.get(gkey, 0) + 1
                if self._foreign[gkey] < 3:
                    self._cache[gkey] = cached
                    return status, None, None
                # Three consecutive foreign reads only throttle recovery; they do
                # not prove this interface works, or that a device was cancelled.
                self._rediscovery[gkey] = (cached.path, cached.tid)
            else:
                self._clear_foreign(gkey)

        # Probe order: vendor / main collection interfaces first, then the rest.
        # Collections Windows re-parented (interface number -1) go last.
        want = KEYBOARD_INTERFACE.get(gkey[0])

        def rank(d):
            up = d.get("usage_page", 0)
            iface = d.get("interface_number", 0)
            if iface is None or iface < 0:
                iface = 99
            return (0 if iface == want else 1, 0 if up in (0x0001, 0xFF00) else 1, iface)

        ifaces = sorted(ifaces, key=rank)
        if gkey in self._rediscovery:
            return self._rediscover_group(gkey, ifaces, tids)
        now = time.time()
        timeout_hit = None
        attempted = False
        for d in ifaces:
            path = d["path"]
            if self._dead.get(path, 0) > now:
                continue
            attempted = True
            self._diag.append(
                f"  iface={d.get('interface_number')} usage={d.get('usage_page', 0):04x}:"
                f"{d.get('usage', 0):04x}")
            answered = False
            for tid in tids:
                status, level, charging = self._read(path, tid)
                if status is None:
                    break          # the interface rejects feature reports, next one
                answered = True
                if status == STATUS_OK:
                    self._cache[gkey] = _Cand(path, tid)
                    self._clear_foreign(gkey)
                    return status, level, charging
                if status == STATUS_TIMEOUT:
                    timeout_hit = (status, None, None)
                    self._cache[gkey] = _Cand(path, tid)
                    break
                if status == STATUS_FOREIGN:
                    # Keep a transient mismatch briefly, without treating it as
                    # evidence of a working battery interface/transaction id.
                    self._cache[gkey] = _Cand(path, tid)
                    self._foreign[gkey] = 1
                    return status, None, None
            if not answered:
                self._dead[path] = now + 300   # leave this interface alone for 5 minutes
        if not attempted:
            self._read_errors.add("interfaces_cooling_down" if ifaces else "no_usable_interface")
        return timeout_hit

    def _rediscover_group(self, gkey, ifaces, tids):
        # Rebuild from today's allowed inventory; a cursor is an identity, not
        # an index into yesterday's ranking. Wrap even with just one candidate.
        candidates = [(d["path"], tid) for d in ifaces for tid in tids]
        if not candidates:
            self._clear_foreign(gkey)
            self._read_errors.add("no_usable_interface")
            return None
        cursor = self._rediscovery[gkey]
        start = (candidates.index(cursor) + 1) % len(candidates) if cursor in candidates else 0
        now = time.time()
        skipped = set()
        reads = 0
        foreign_hit = None
        timeout_hit = None
        for offset in range(len(candidates)):
            path, tid = candidates[(start + offset) % len(candidates)]
            if path in skipped or self._dead.get(path, 0) > now:
                continue
            self._rediscovery[gkey] = (path, tid)
            status, level, charging = self._read(path, tid)
            reads += 1
            if status == STATUS_OK:
                self._cache[gkey] = _Cand(path, tid)
                self._clear_foreign(gkey)
                return status, level, charging
            if status is None or status == STATUS_TIMEOUT:
                # As in initial discovery, reject the remaining TIDs on an
                # unusable/asleep interface. Reaching a later TID already means
                # this interface answered during the current walk.
                if status is None and tid == tids[0]:
                    self._dead[path] = now + 300
                if status == STATUS_TIMEOUT:
                    timeout_hit = (status, None, None)
                    self._cache[gkey] = _Cand(path, tid)
                skipped.add(path)
                self._rediscovery[gkey] = (path, tids[-1])
            elif status == STATUS_FOREIGN:
                foreign_hit = (status, None, None)
            if reads >= 2:
                break
        if timeout_hit is not None:
            self._clear_foreign(gkey)
        if not reads:
            self._read_errors.add("interfaces_cooling_down")
        return timeout_hit or foreign_hit

    def _poll_2020(self, ifaces):
        """Only the 0xFF00 collection accepts the 2020 feature report."""
        offline = None
        for d in ifaces:
            if not blackshark2020.is_candidate(d):
                continue
            self._diag.append(
                f"  [2020] iface={d.get('interface_number')} usage=ff00:0001")
            res, level, charging = blackshark2020.read_battery(d["path"], self._diag)
            if res == "ok":
                return STATUS_OK, level, charging
            if res == "offline":
                offline = (STATUS_TIMEOUT, None, None)
        return offline

    def _poll_pa(self, gkey, ifaces):
        """BlackShark V2 Pro 2023: the "PA" protocol over output/input reports."""
        cache_key = ("pa",) + tuple(gkey)
        cached = self._cache.get(cache_key)
        cands = [d for d in ifaces if blackshark.is_candidate(d)] or list(ifaces)
        if cached:
            cands.sort(key=lambda d: 0 if d["path"] == cached.path else 1)
        offline = None
        asleep = None
        for d in cands:
            self._diag.append(
                f"  [PA] iface={d.get('interface_number')} usage={d.get('usage_page', 0):04x}:"
                f"{d.get('usage', 0):04x}")
            res, level, charging = blackshark.read_battery(d["path"], self._diag)
            if res == "ok":
                self._cache[cache_key] = _Cand(d["path"], 0)
                return STATUS_OK, level, charging
            if res == "offline":
                # The interface accepted a command and the headset did not answer: this is the
                # collection that speaks the protocol, with the headset switched off. Remember
                # it, so an off headset costs one probe per poll instead of one per collection
                # (measured: 2 probes -> 1 with two vendor collections, ~0.7 s each), and stop
                # walking the list.
                self._cache[cache_key] = _Cand(d["path"], 0)
                if offline is None:
                    offline = (STATUS_TIMEOUT, None, None)
                break
            if res == "nowake" and asleep is None:
                # The interface opened but never accepted a command - which is also what a
                # wrong collection looks like, so it must NOT be cached. If a wrong path were
                # cached, the sort above would put it first and its "offline" would break the
                # loop every time, so the collection that actually works would never be
                # reached again and a headset switched on later would never be read.
                # Keep it only as the fallback answer, so a receiver that is asleep still
                # shows "no link" (STATUS_TIMEOUT) instead of losing its icon.
                asleep = (STATUS_TIMEOUT, None, None)
        return offline or asleep

    def diagnostics(self) -> List[str]:
        return list(self._diag)

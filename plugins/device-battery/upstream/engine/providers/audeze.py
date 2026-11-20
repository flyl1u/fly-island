"""Audeze Maxwell headsets (0x3329): the USB wireless dongle and the USB cable.

The headset is reached through the vendor HID collection (usage page 0xFF13,
usage 0x0001). A request is a 62-byte output report with report id 0x06; the
answer comes back as the 62-byte input report 0x07. Its payload is a rolling
buffer holding the dongle's most recent replies, so the battery marker sits in
a different frame from poll to poll and the whole buffer has to be scanned.

One packet is enough to read the battery. The packet that asks for attribute
0x0CD6 (``BATTERY_ONLY``) is answered with the marker on its own: measured on the
dongle and on the USB-C endpoint at 0.19 s against 1.48 s for the full sequence,
and running both against each other every 30 s through a charge from 85% to 91%
agreed in 19 of 20 cycles. The cycle that differed read 90% from the single packet
against 88% from the full sequence at a moment when both neighbouring cycles read
90%, so the fuller window was carrying an older copy too: the buffer holds several
historical values and either sequence can pick one up, which is why the level can
bounce by a couple of points between polls. The full sequence stays as the
fallback whenever the single packet comes back without a marker, so a firmware
that does need the initialisation (the Xbox dongle and the Maxwell 2 are
untested) still reads; the cost of the fallback is one extra round trip per poll
while the headset is off.

The 14 packets are HeadsetControl's, byte for byte (lib/devices/audeze_maxwell.hpp,
UNIQUE_REQUESTS). Thirteen of them carry 0x80 in the byte after the length, and the
seventh - 06 07 00 05 5A 03 00 07 1C - carries 0x00. An earlier version of this
docstring claimed that byte marks a write and therefore never appears in the
sequence; that claim was asserted, not measured, and the table above disproves it.
Either that byte is not a plain read/write marker, or that one packet is not a
plain read. Since it is part of the vendor's own initialisation and HeadsetControl
sends it on every read, it stays - but the claim that the sequence writes nothing
at all is withdrawn. What is enforced instead: the sequence is only sent to the
product ids in KNOWN, and only ever to a vendor collection.

Protocol and the packet tables come from the HeadsetControl project
(Sapd/HeadsetControl, lib/devices/audeze_maxwell.hpp). The battery is their
marker ``d6 0c 00 00 <percent>``. HeadsetControl reads only the reply that
follows a packet and reports BATTERY_UNAVAILABLE on dongles where that reply
does not happen to be the one holding the marker; reading the last frame of
the whole sequence that contains the marker is what makes this work here.

Both endpoints of the headset speak the same protocol and report the same
level, measured on hardware: the 2.4 GHz dongle is 0x4B19 ("Audeze Maxwell
HID") and the USB-C cable is 0x4B1A ("Audeze Maxwell Headset"). Plugged in for
charging the headset keeps its wireless link, so both answer at once; they are
one device and get one icon, the cable winning.

There is no charging flag in the protocol: the payload of a battery answer is
exactly ``d6 0c 00 00 <percent>`` with nothing after it, HeadsetControl has no
charging value for any Audeze device, and Audeze HQ itself shows only "Battery
level is 76%." (and "USB Wired") while the headset is wired. A search for one
came up empty: firing the sequence's queries one at a time (01:09, 07:1C, 83:2C
with sub-bytes 01/07/0B, 0D6) against six frames of answer each turns up only
four kinds of record - the battery, the firmware string, echoes of the query just
sent, and the 83:2C settings block - and every one of them is byte for byte the
same while charging and while running off the dongle.

So the cable endpoint is used as the signal instead: a Maxwell charges whenever
it is on USB-C (there is no way to switch that off), which makes the cable
answering mean "on power". Its status is reported as charging, so the icon
breathes and a headset that was just plugged in is not told to charge. The
inference is one-sided on purpose: docked and already full, the icon still
breathes where the headset's own LED is solid green.

Measured with the headset switched off and the dongle left plugged in: the
dongle keeps enumerating (all three collections stay, only the audio endpoints
go away) and keeps answering every packet with the last value it held - the
marker does not disappear from its buffer, so a stale level and a live one are
indistinguishable that way (nine answers over two and a half minutes, all the
same value). The dongle does say which state it is in, though: with no headset
linked it enumerates as "Audeze Maxwell Dongle" instead of "Audeze Maxwell HID",
and its interface paths change at the same moment, so hidlist's path-keyed cache
re-enumerates by itself and poll() sees the fresh string. poll() reads that
before anything else and reports nothing while it says Dongle: a switched-off
headset leaves the tray through the usual "two misses" path, is never reported as
0%, and its 1.5 s battery sequence is not sent at all.

Both endpoints report serial number ``0000000000000000``, so the icon key is that
serial and two Maxwells on one machine would share one icon (and only the first
would be read). Nothing that can be done about it here: the headset does not
report anything unique over HID.

With the USB-C cable plugged in instead, a switched-off headset keeps reporting
its real level on 0x4B1A: 85% while the LED showed charging, up from 83% before
the switch-off. That is the level it is charging at, so the icon stays and shows
it - the honest thing to show. The dongle goes silent in that state as well (its
buffer can still hold the last value for one poll), and since the cable is read
first a stale dongle value never wins. Windows shows no Audeze audio endpoint
while the headset is off even though both HID endpoints stay enumerated, and the
dongle's product string reads "Audeze Maxwell Dongle" instead of "Audeze Maxwell
HID" - poll() uses that to tell a switched-off headset from a live one.
"""
from __future__ import annotations

import time
from typing import Dict, List, Optional, Set, Tuple

import hid

from . import hidlist
from .base import DeviceStatus, Provider, hexdump, log

AUDEZE_VID = 0x3329

# PID -> name. 0x4B19 (the Maxwell dongle) and 0x4B1A (the USB-C cable) are
# confirmed on hardware; the others use the same protocol and are listed so
# their icon gets the right name, but nobody has confirmed them.
KNOWN = {
    0x4B19: "Audeze Maxwell",
    0x4B18: "Audeze Maxwell (Xbox)",
    0x4B1A: "Audeze Maxwell (USB cable)",
    # 0x4B1E is derived, not measured: it is 0x4B18 (the Xbox dongle) with the same
    # +1 offset that separates the PC dongle 0x4B19 from its cable 0x4B1A. If the
    # offset does not hold for the Xbox model, an Xbox cable is read as 0x4B18 and
    # reported as "not charging" rather than as a cable.
    0x4B1E: "Audeze Maxwell (Xbox, USB cable)",
    0x4B29: "Audeze Maxwell 2",
    0x4B28: "Audeze Maxwell 2 (Xbox)",
}

# the cable endpoints: read before the dongle, see poll()
CABLE_PIDS = {0x4B1A, 0x4B1E}

# one icon per headset, so whichever endpoint answered is called this
HEADSET_NAME = "Audeze Maxwell"

MSG_SIZE = 62
REPORT_ID_OUT = 0x06
REPORT_ID_IN = 0x07
PACKET_DELAY = 0.060      # Audeze HQ sends at ~52 ms; 60 ms is what HeadsetControl uses
EXTRA_READS = 2           # the answer to the last request arrives a little later

VENDOR_USAGE_PAGE = 0xFF13
VENDOR_USAGE = 0x0001

BATTERY_MARKER = b"\xd6\x0c\x00\x00"

# 14-packet initialisation sequence
INIT = [
    [0x06, 0x08, 0x80, 0x05, 0x5A, 0x04, 0x00, 0x01, 0x09, 0x20],
    [0x06, 0x08, 0x80, 0x05, 0x5A, 0x04, 0x00, 0x01, 0x09, 0x25],
    [0x06, 0x07, 0x80, 0x05, 0x5A, 0x03, 0x00, 0x07, 0x1C],
    [0x06, 0x08, 0x80, 0x05, 0x5A, 0x04, 0x00, 0x01, 0x09, 0x28],
    [0x06, 0x08, 0x80, 0x05, 0x5A, 0x04, 0x00, 0x83, 0x2C, 0x01],
    [0x06, 0x08, 0x80, 0x05, 0x5A, 0x04, 0x00, 0x83, 0x2C, 0x07],
    [0x06, 0x07, 0x00, 0x05, 0x5A, 0x03, 0x00, 0x07, 0x1C],
    [0x06, 0x08, 0x80, 0x05, 0x5A, 0x04, 0x00, 0x01, 0x09, 0x2D],
    [0x06, 0x08, 0x80, 0x05, 0x5A, 0x04, 0x00, 0x01, 0x09, 0x2C],
    [0x06, 0x08, 0x80, 0x05, 0x5A, 0x04, 0x00, 0x01, 0x09],
    [0x06, 0x08, 0x80, 0x05, 0x5A, 0x04, 0x00, 0x83, 0x2C, 0x0B],
    [0x06, 0x08, 0x80, 0x05, 0x5A, 0x04, 0x00, 0x01, 0x09, 0x24],
    [0x06, 0x08, 0x80, 0x05, 0x5A, 0x04, 0x00, 0x01, 0x09, 0x2F],
    [0x06, 0x07, 0x80, 0x05, 0x5A, 0x03, 0x00, 0xD6, 0x0C],   # battery value
]

# 6-packet status sequence (battery status, mic, eq, chatmix, noise filter, sidetone)
STATUS = [
    [0x06, 0x08, 0x80, 0x05, 0x5A, 0x04, 0x00, 0x01, 0x09, 0x22],
    [0x06, 0x08, 0x80, 0x05, 0x5A, 0x04, 0x00, 0x01, 0x09],
    [0x06, 0x08, 0x80, 0x05, 0x5A, 0x04, 0x00, 0x83, 0x2C, 0x0B],
    [0x06, 0x08, 0x80, 0x05, 0x5A, 0x04, 0x00, 0x01, 0x09, 0x24],
    [0x06, 0x08, 0x80, 0x05, 0x5A, 0x04, 0x00, 0x01, 0x09, 0x2C],
    [0x06, 0x08, 0x80, 0x05, 0x5A, 0x04, 0x00, 0x83, 0x2C, 0x07],
]

REQUESTS = INIT + STATUS

# The packet that asks for the battery attribute (0x0CD6). On its own it is enough:
# the answer to it carries the marker, measured on both the dongle and the USB-C
# endpoint (0.19 s against 1.48 s for the whole sequence, agreeing with the full
# sequence across a charge from 85% to 88%). The full sequence stays as the
# fallback for a firmware that does need the initialisation.
BATTERY_QUERY = next(p for p in INIT if p[7:9] == [0xD6, 0x0C])
BATTERY_ONLY = [BATTERY_QUERY]


def packet(values) -> bytes:
    """A request padded to the 62 bytes the report descriptor declares."""
    data = bytearray(MSG_SIZE)
    data[:len(values)] = bytes(values)
    return bytes(data)


def find_level(data) -> Optional[int]:
    """The percentage after the first ``d6 0c 00 00`` battery marker, or None.

    The marker is followed by exactly one byte, the percentage. A marker whose
    byte is outside 0..100 cannot be a real one (the dongle's frame also carries
    leftovers of earlier replies), so the search continues after it.
    """
    if not data:
        return None
    b = bytes(data)
    start = 0
    while True:
        i = b.find(BATTERY_MARKER, start)
        if i < 0 or i + 4 >= len(b):
            return None
        level = b[i + 4]
        if 0 <= level <= 100:
            return level
        start = i + 1


def newest_level(frames) -> Optional[int]:
    """The marker from the newest frame that carries one.

    The reply is a rolling buffer with leftovers of earlier polls still in it -
    a stale 86% sat next to a fresh 85% in one measurement - so the newest frame
    is the one that counts.
    """
    for frame in reversed(frames):
        level = find_level(frame)
        if level is not None:
            return level
    return None


# A stuck dongle: it answers every packet, but each answer is only the first bytes of the
# request echoed back (07 00 80 00 00 ... - 07 00 00 00 ... for the one request with 00
# there) with nothing after them, so the requests never reach the headset. Seen on an
# Xbox dongle (3329:4B18) that said "Audeze Maxwell HID" (headset linked), in PC mode,
# with the headset on and playing audio: 22 of 22 replies were echoes, over several
# polls. Unplugging the dongle and plugging it back in made it answer with the battery
# at once. HeadsetControl #460 (the same dongle, "battery unavailable" on Windows and
# Linux) may well be the same state.
ECHO_MIN_FRAMES = 5      # fewer replies than this is too little to call it
STUCK_POLLS = 2          # polls in a row before the icon says so (not a dongle just waking up)
STUCK_TEXT = "no answer from the headset - unplug the dongle and plug it back in"


# Right after it is switched on, the headset reports its battery as 0 for a moment:
# measured on an Xbox dongle (4B18), the first reading after power-on was 0% (and gave a
# "Low battery" alert), the next one a minute later the real 80%. So a 0 in the first
# ZERO_GRACE seconds after the headset appears is "not measured yet", and the provider
# asks the app to re-check in a few seconds (`pending`) instead of waiting a whole poll
# interval. After that a 0 is believed: a flat headset charging on the cable is 0%.
ZERO_GRACE = 90.0
WAKING_TEXT = "connected, battery level not reported yet"


def echo_only(frames) -> bool:
    """True when every reply is an empty echo of the request header."""
    return len(frames) >= ECHO_MIN_FRAMES and all(
        len(f) > 3 and f[0] == REPORT_ID_IN and not any(f[3:]) for f in frames)


def is_vendor_interface(d: dict) -> bool:
    return d.get("usage_page") == VENDOR_USAGE_PAGE and d.get("usage", 0) == VENDOR_USAGE


# With no headset linked the dongle identifies itself as this instead of
# "Audeze Maxwell HID". Its interface paths change at the same moment, so
# hidlist's path-keyed cache hands poll() a fresh string - no cache to fight.
NO_HEADSET_STRING = "audeze maxwell dongle"


def no_headset_linked(ifaces) -> bool:
    """True when the dongle itself says no headset is linked (switched off)."""
    return any((d.get("product_string") or "").strip().lower() == NO_HEADSET_STRING
               for d in ifaces)


class AudezeProvider(Provider):
    name = "audeze"

    def __init__(self):
        self._diag: List[str] = []
        # serials that have already reported "no battery reading" once, so a
        # switched-off headset does not write the same block of lines every poll
        self._down_logged: Set[str] = set()
        # (pid, serial) -> the single battery packet came back without a marker last
        # time, so send only the full sequence until something answers again
        self._short_useless: Dict[Tuple[int, str], bool] = {}
        # (pid, serial) -> polls in a row whose replies were all empty echoes (stuck dongle)
        self._echo_polls: Dict[Tuple[int, str], int] = {}
        self._last_echo_only = False     # set by _read_battery for the read it just did
        self._up_since: Dict[str, float] = {}   # serial -> when the headset started answering
        self.pending = False             # a 0% was held back: the app re-checks in 3 s

    # ---- low level -------------------------------------------------------
    def _read_frame(self, dev) -> Optional[bytes]:
        try:
            resp = dev.get_input_report(REPORT_ID_IN, MSG_SIZE)
        except (OSError, ValueError) as e:
            self._diag.append(f"    read: {e}")
            return None
        if not resp:
            return None
        return bytes(resp)

    def _sequence(self, dev, requests) -> Tuple[List[bytes], bool]:
        """Send the packets and collect the frames -> (frames, device answered)."""
        frames: List[bytes] = []
        unanswered = 0
        for req in requests:
            try:
                dev.write(packet(req))
            except (OSError, ValueError) as e:
                self._diag.append(f"    write {req[7]:02x}:{req[8]:02x}: {e}")
                break
            time.sleep(PACKET_DELAY)
            frame = self._read_frame(dev)
            if frame:
                frames.append(frame)
            elif not frames:
                # a collection that rejects the first few packets is not
                # going to answer the next seventeen either
                unanswered += 1
                if unanswered >= 3:
                    self._diag.append("    the collection does not answer")
                    return frames, False
        for _ in range(EXTRA_READS):
            time.sleep(PACKET_DELAY)
            frame = self._read_frame(dev)
            if frame:
                frames.append(frame)
        return frames, True

    def _read_battery(self, path: bytes,
                      state_key=None) -> Tuple[Optional[int], Optional[bool]]:
        """-> (level%, charging). charging is always False: the Maxwell does not
        report a charging flag in the status the dongle exposes."""
        self._last_echo_only = False
        dev = hid.device()
        try:
            dev.open_path(path)
        except (OSError, IOError, ValueError) as e:
            self._diag.append(f"    open: {e}")
            return None, None
        frames: List[bytes] = []
        try:
            # One packet is enough when the headset is awake: the answer to the
            # battery query carries the marker. The full sequence is the fallback
            # for a device that only reports after the initialisation, and it costs
            # one extra round trip while the headset is switched off. Switched off
            # is a routine state, so remember that the single packet was useless and
            # send only the full sequence until something answers again: 1.5 s per
            # poll instead of 1.7 s, and 19 fewer packets on the wire.
            short = not (state_key is not None and self._short_useless.get(state_key))
            answered = True
            level = None
            if short:
                frames, answered = self._sequence(dev, BATTERY_ONLY)
                level = newest_level(frames)
            if level is None and answered:
                self._diag.append(("    the battery query alone gave no marker, " if short
                                   else "    skipping the battery query, ")
                                  + f"sending the full {len(REQUESTS)}-packet sequence")
                more, _ = self._sequence(dev, REQUESTS)
                frames += more
                level = newest_level(more)
            if state_key is not None:
                if level is not None:
                    self._short_useless[state_key] = False   # it is alive again
                elif short:
                    self._short_useless[state_key] = True    # awake but empty
            if level is None:
                self._diag.append(f"    no battery marker in {len(frames)} frames"
                                  + (f", last: {hexdump(frames[-1])}" if frames else ""))
                self._last_echo_only = echo_only(frames)
                if self._last_echo_only:
                    self._diag.append("    every reply is an empty echo of the request: the "
                                      "dongle is not passing the requests to the headset. "
                                      "Unplugging the dongle and plugging it back in fixes this")
                return None, None
            return level, False
        finally:
            try:
                dev.close()
            except Exception:
                pass

    # ---- high level ------------------------------------------------------
    def poll(self) -> List[DeviceStatus]:
        self._diag = []
        self.pending = False
        try:
            infos = hidlist.enumerate(AUDEZE_VID)
        except Exception as e:  # pragma: no cover
            log.warning("hid.enumerate(audeze): %s", e)
            return []

        # one icon per device: group the collections of one dongle together. Only the
        # product ids in KNOWN are talked to: 0x3329 is Audeze's vendor id, and writing a
        # 14-packet sequence of unknown effect to a device that is not one of these is not
        # something a battery reader should do. An unknown id is named in the diagnostics
        # so a reporter can ask for it.
        groups: Dict[Tuple[int, str], List[dict]] = {}
        for d in infos:
            pid = d["product_id"]
            if pid not in KNOWN:
                name = (d.get("product_string") or "").strip()
                line = (f"[Audeze] pid={pid:04x} '{name}' is not a known Maxwell, "
                        f"not writing the sequence to it")
                if line not in self._diag:
                    self._diag.append(line)
                continue
            groups.setdefault((pid, d.get("serial_number") or ""), []).append(d)

        # One icon per headset. The dongle and the cable are the same Maxwell:
        # plugged in for charging the headset keeps its wireless link and both
        # endpoints answer at once ("Audeze Maxwell HID" and "Audeze Maxwell
        # Headset" in Windows), which gave a second icon and a poll that read
        # the whole sequence twice. The cable is the direct connection and is
        # read first; the dongle is only read when there is no cable. The key is
        # the serial number, which both endpoints report identically, so the
        # icon survives plugging the cable in and out.
        order = sorted(groups.items(),
                       key=lambda kv: (kv[0][0] not in CABLE_PIDS, kv[0][0], kv[0][1]))
        out: List[DeviceStatus] = []
        stuck: Optional[DeviceStatus] = None
        for (pid, serial), ifaces in order:
            name = KNOWN.get(pid) or (ifaces[0].get("product_string") or f"Audeze {pid:04x}").strip()
            diag_from = len(self._diag)
            self._diag.append(f"[Audeze] {name} pid={pid:04x}, interfaces: {len(ifaces)}")
            # The vendor collection (usage page 0xFF13) is the only one that
            # speaks this protocol. The consumer-control and telephony
            # collections on the same interface answer nothing at all, and
            # writing the sequence to them cost 2.6 s and ~45 log lines per poll
            # while the headset was switched off, so they are only tried on a
            # device that has no 0xFF13 collection at all.
            # A switched-off headset: the dongle keeps answering, but with the last
            # value it held, and there is no way to tell that from a live reading -
            # the icon sat there showing the stale level for as long as the headset
            # stayed off (nine answers over 2.5 minutes, all the same value). The
            # dongle does say which state it is in, so report nothing: the icon
            # leaves through the usual two-misses path (what the README promises for
            # a switched-off device) and the battery sequence is not sent at all,
            # 1.5 s saved per poll for a value that cannot change while it is off.
            off = pid not in CABLE_PIDS and no_headset_linked(ifaces)
            # The vendor collection (usage page 0xFF13) is the only one that speaks this
            # protocol, and only vendor collections are ever written to: a device whose
            # vendor collection is missing gets nothing rather than the sequence going to
            # its consumer-control and telephony collections, which answer nothing, cost
            # about 2.6 s per poll and are not meant to receive it.
            cands = ([d for d in ifaces if is_vendor_interface(d)]
                     or [d for d in ifaces if d.get("usage_page") == VENDOR_USAGE_PAGE]
                     or [d for d in ifaces if (d.get("usage_page") or 0) >= 0xFF00])
            if not cands:
                self._diag.append("    no vendor collection on this device "
                                  "(not writing to the standard collections)")
                out.append(DeviceStatus(f"audeze:{serial}", HEADSET_NAME, None, False, True,
                                        "audeze", kind="headset"))
                continue
            level = None
            echoed = False
            if off:
                self._diag.append("    the dongle reports no headset linked "
                                  "(switched off), skipping the read")
            else:
                for d in cands:
                    if len(cands) > 1:
                        self._diag.append(f"  iface={d.get('interface_number')} "
                                          f"usage={d.get('usage_page', 0):04x}:{d.get('usage', 0):04x}")
                    level, _ = self._read_battery(d["path"], (pid, serial))
                    if level is not None:
                        break
                    echoed = echoed or self._last_echo_only
            # A stuck dongle (see STUCK_TEXT) looks like a switched-off headset - no icon -
            # although the headset is on and the fix is one replug. After STUCK_POLLS polls
            # in a row it gets a greyed icon that says so, under the headset's own key, so
            # the normal icon takes over in place once the dongle answers again. Only a
            # dongle that says a headset is linked gets here ("off" above skips the read).
            n = self._echo_polls[(pid, serial)] = (
                self._echo_polls.get((pid, serial), 0) + 1 if level is None and echoed else 0)
            if n >= STUCK_POLLS and stuck is None:
                self._diag.append(f"    stuck for {n} polls in a row: showing \"{STUCK_TEXT}\"")
                stuck = DeviceStatus(f"audeze:{serial}", HEADSET_NAME, None, False, True,
                                     "audeze", STUCK_TEXT, kind="headset")
            if level is None:
                # A switched-off headset is a routine state, not a fault. Log the
                # outage once per headset and stay quiet until it answers again:
                # otherwise a headset that sits switched off overnight writes about
                # 1400 lines and pushes the useful history out of a rotating log.
                # The diagnostics report is unaffected, it is rebuilt every poll.
                if serial not in self._down_logged:
                    self._down_logged.add(serial)
                    log.info("[Audeze] %s: no battery reading", name)
                    for line in self._diag[diag_from:]:
                        log.info("%s", line)
                self._up_since.pop(serial, None)     # the next answer starts a new grace period
                continue
            # whichever endpoint answered, this headset is alive again
            self._down_logged.discard(serial)
            now = time.time()
            since = self._up_since.setdefault(serial, now)
            if level == 0 and now - since < ZERO_GRACE:
                self._diag.append(f"    0% within {now - since:.0f} s of the headset coming on: "
                                  f"not measured yet, re-checking in a few seconds")
                self.pending = True
                out.append(DeviceStatus(f"audeze:{serial}", HEADSET_NAME, None, False, True,
                                        "audeze", WAKING_TEXT, kind="headset"))
                break
            if len(order) > 1:
                self._diag.append(f"  {name} answered, the other endpoint is not read")
            # The cable endpoint is the charging source: a Maxwell charges
            # whenever it is on USB-C (there is no way to switch that off), so the
            # cable answering means "on power". The protocol itself carries no
            # charging flag, so this is an inference - docked and already full,
            # the icon still breathes where the headset's own LED is solid green.
            # It is worth it: a headset plugged in while nearly empty is no longer
            # told to charge.
            out.append(DeviceStatus(f"audeze:{serial}",
                                    HEADSET_NAME if pid in KNOWN else name,
                                    level, pid in CABLE_PIDS, True, "audeze",
                                    kind="headset"))
            break
        if not out and stuck is not None:
            out.append(stuck)
        # a dongle that was unplugged starts a new grace period when it comes back
        present = {serial for _, serial in groups}
        for serial in [s for s in self._up_since if s not in present]:
            del self._up_since[serial]
        return out

    def diagnostics(self) -> List[str]:
        return list(self._diag)

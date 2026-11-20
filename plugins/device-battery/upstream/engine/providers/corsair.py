"""Corsair wireless receivers (Void v2 Wireless and its siblings) over USB/HID,
without iCUE.

Protocol from Sapd/HeadsetControl's corsair_void_v2w device:

  * the vendor collection on the receiver, which HeadsetControl identifies by
    interface 4 (it gives no usage page/usage for it, so the interface number is
    the only handle on that collection; a probe logs whatever it actually finds).
  * commands are 65 bytes: [0] 0x00 report id, [1] 0x02, [2] endpoint,
    [3] 0x02, [4] command. Endpoint 0x08 is the receiver itself, 0x09 the
    headset behind it. Replies are 64 bytes.
  * talking to a sleeping headset needs the same minimal handshake
    HeadsetControl uses - receiver firmware query, receiver heartbeat, then a
    headset heartbeat - which is enough to read the battery without switching
    the headset into software mode (that switch is audible as a pop).
  * battery: command 0x0f to endpoint 0x09 -> reply[4] | reply[5] << 8 is a
    0..1000 value, ten times the percent. The receiver sometimes answers with
    the paired headset id instead of a level, so a reading of 0 or above 1000 is
    retried a few times and then refused rather than shown.

The reply carries no charging flag: HeadsetControl reports the level as
available (not charging) for this family, and so does this provider.

The Dark Core RGB Pro SE (dongle 1b1c:1b7f) speaks the newer Corsair protocol
that ckb-next calls "bragi" (USES_BRAGI in src/daemon/usb.h; bragi_proto.h,
device_bragi.c) and OpenLinkHub "slipstream" (src/devices/slipstream/): 64-byte
routed frames behind report id 0, 65 bytes to hidapi. Byte 1 is the route (0x08
the receiver itself, 0x08 | child the device behind it; 0x09 = the paired
mouse), byte 2 the command (0x02 = get) and byte 3 the property (battery level
0x0F). An answer is `[route][0x02][err][value]...`: err 0 means OK, and the
battery sits little-endian in bytes 3-4 in tenths of a percent - both drivers
divide by 10. The 1.13.0 build asked this dongle with ckb-next's "nxp" packet;
the reporter's runs in #56 showed it never answers that one, and that one of
its *other* frames parsed as a level was the 0 % flash. The request above and
its `01 02 00 26 02 ...` answer (55 %) were captured from the reporter's
dongle, and the exchange is confirmed on hardware: KKiruano's test build run
showed the same level SignalRGB does. The answer echoes the command, not the
property, so a second app on the same dongle (iCUE, SignalRGB) can put an
answer for another property on the channel that parses as a level; the ask is
therefore repeated and only two equal answers are taken, the wait is a time
window (traffic frames end a 500 ms read early), and a per-dongle budget
bounds the try-every-collection fallback (review by @ahmedkhursheed23). The
Virtuoso RGB Wireless SE receiver (1b1c:0a40) runs the same exchange with two
measured differences (#204, jeffpeng3's Linux proof-of-concept and the Windows
probe): Windows refuses every report-id-prefixed write on it and takes the bare
64-byte frame - which also carries a leading 0x02 the Dark Core's frame does not
have (`02 09 02 0f` against `09 02 0f`) - and its headset reports the charge
state on property 0x10 (1 charging, 2 on battery). It is read with the full
session that was measured on it - firmware query, receiver heartbeat, headset
heartbeat, then the properties.

The rest of the Virtuoso family is the same exchange on the ids HeadsetControl's
reworked Virtuoso XT/SE device covers (#570): the SE's own receiver 1b1c:0a3e and
its cable 1b1c:0a3d, the XT's receiver 1b1c:0a64 and its cable 1b1c:0a62. The wired
ids read with target 0x08 first and the receivers with 0x09, each with the other as
the fallback, and reads need neither the session nor software mode (HeadsetControl
notes only writes need software mode). Those four ran on HeadsetControl's author's
hardware (#568/#570 discussion) and have not answered a build here; the 0a40 is
measured. The Dark Core's wired id 1b1c:1b7e stays out - nothing can prove it
answers.
"""
from __future__ import annotations

import time
from typing import List, Optional, Tuple

import hid

from . import hidlist
from .base import DeviceStatus, Provider, hexdump, log

CORSAIR_VID = 0x1B1C

USAGE_PAGE = 0
USAGE = 0
CONTROL_INTERFACE = 4           # the collection that carries the protocol

RECEIVER_ENDPOINT = 0x08
HEADSET_ENDPOINT = 0x09
MSG_SIZE_WRITE = 65
MSG_SIZE_READ = 64

CMD_FIRMWARE = 0x13
CMD_HEARTBEAT = 0x12
CMD_BATTERY = 0x0F

FW_SUB = 0x02
HB_SUB = 0x02
BATTERY_SUB = 0x02

LEVEL_INDEX = 4                 # little-endian 16-bit, hundredths
LEVEL_MAX = 1000
ATTEMPTS = 3
READ_TIMEOUT_MS = 500
FLUSH_TIMEOUT_MS = 30

PIDS = {
    0x2A08: "Corsair Void v2 Wireless",
    0x2A02: "Corsair Virtuoso Max Wireless",
    0x0A97: "Corsair HS80 Max Wireless",
}


def make_request(endpoint: int, sub: int, command: int) -> List[int]:
    frame = [0x00, 0x02, endpoint, sub, command]
    return frame + [0x00] * (MSG_SIZE_WRITE - len(frame))


# --- second family: the "bragi" / "slipstream" exchange of the Dark Core RGB Pro SE dongle ---
# A wired mouse (1b1c:1b7e) exists too; nothing here can prove it answers, so only the
# dongle is read.
BRAGI_PIDS = {
    0x1B7F: "Corsair Dark Core RGB Pro SE",
    0x0A40: "Corsair Virtuoso RGB Wireless SE",
    0x0A3E: "Corsair Virtuoso RGB Wireless SE",
    0x0A3D: "Corsair Virtuoso RGB Wireless SE",
    0x0A64: "Corsair Virtuoso RGB Wireless XT",
    0x0A62: "Corsair Virtuoso RGB Wireless XT",
}
# one icon per product: a headset's receiver and cable ids share the key
BRAGI_KEYS = {
    0x1B7F: "corsair:1b7f",
    0x0A40: "corsair:virtuoso-se",
    0x0A3E: "corsair:virtuoso-se",
    0x0A3D: "corsair:virtuoso-se",
    0x0A64: "corsair:virtuoso-xt",
    0x0A62: "corsair:virtuoso-xt",
}
BRAGI_VENDOR_PAGE = 0xFF42       # the dongle's two vendor collections, from the #56 dump
BRAGI_USAGE = 0x0001             # the one that answers; 0x0002 is its notice channel
BRAGI_MSG_SIZE = 64              # ckb-next: MSG_SIZE (structures.h)
BRAGI_ROUTE_DONGLE = 0x08        # the receiver itself
BRAGI_ROUTE_MOUSE = 0x09         # 0x08 | child 1: the paired mouse
BRAGI_ROUTE_CHILD = 0x01         # the route the mouse's answers come back with
BRAGI_CMD_GET = 0x02             # ckb-next: CMD_GET
BRAGI_PROP_BATTERY = 0x0F        # ckb-next: BRAGI_BATTERY_LEVEL
BRAGI_PROP_CHARGE = 0x10         # 1 = charging, 2 = on battery (#204, measured)
BRAGI_PROP_HEARTBEAT = 0x12      # the session heartbeats (#204)
BRAGI_PROP_FIRMWARE = 0x13       # the session's firmware query (#204)
BRAGI_LEVEL_MAX = 1000           # tenths of a percent (765 -> 76 %)
BRAGI_WINDOW_S = 6.0             # the answer measured ~4.7 s after the write (#56); a
                                 # time window, not a read count - traffic frames end a
                                 # 500 ms read early and used to eat the old budget
BRAGI_CONFIRM_WINDOW_S = 3.0     # the confirming ask; the mouse is awake by then
BRAGI_READ_ATTEMPTS = 96         # a hard stop so a busy channel cannot spin
BRAGI_POLL_BUDGET_S = 7.0        # total per dongle, across its collections

# The Virtuoso family reads through the bare 64-byte frame with the leading 0x02
# and reports the charge state on property 0x10: measured on the 0A40 receiver
# (#204), and the same exchange on the four XT/SE ids from HeadsetControl's
# reworked device (#570). The Dark Core takes the framed write and reports no
# charge, so each stays scoped to the ids measured with it.
BRAGI_BARE_PIDS = {0x0A40, 0x0A3E, 0x0A3D, 0x0A64, 0x0A62}
# the session was measured on the 0A40 alone; HeadsetControl reads the family's
# properties without one (#570), so the new ids mirror that
BRAGI_SESSION_PIDS = {0x0A40}
# the wired ids resolve their target the other way round: HeadsetControl's
# resolveTarget tries 0x08 first on a wired id and 0x09 on a receiver, with the
# other as the fallback (#570)
BRAGI_WIRED_PIDS = {0x0A3D, 0x0A62}


def bragi_request(prop: int = BRAGI_PROP_BATTERY,
                  route: int = BRAGI_ROUTE_MOUSE) -> bytes:
    """The Dark Core's get-property frame: report id 0, the route, cmd, property."""
    payload = bytearray(BRAGI_MSG_SIZE)
    payload[0] = route
    payload[1] = BRAGI_CMD_GET
    payload[2] = prop
    return b"\x00" + bytes(payload)


def bragi_se_request(prop: int = BRAGI_PROP_BATTERY,
                     route: int = BRAGI_ROUTE_MOUSE) -> bytes:
    """The Virtuoso SE receiver's get-property frame: `02 <route> 02 <property>`.

    Its data begins with the extra 0x02 (`02 09 02 0f` against the Dark Core's
    `09 02 0f`), and the whole 64 bytes go out bare - Windows refuses every
    report-id-prefixed form on this receiver (#204, measured).
    """
    head = bytes([0x02, route, BRAGI_CMD_GET, prop])
    return head + bytes(BRAGI_MSG_SIZE - len(head))


def parse_bragi_raw(reply) -> Optional[int]:
    """The raw 16-bit value of a get-property answer, or None when it is not one.

    Two answer shapes carry it, both routed to `0x01` with command `0x02` and
    err `0x00`: the Dark Core's `01 02 00 <v LE>` (measured in #56) and the
    Virtuoso receivers' `01 01 02 00 <v LE>`, whose extra byte is the source
    (`01` = the headset; probe-measured on the 0A40, #204 - the value sits one
    byte further along). The dongle sends other frames as well (device-list
    records on the same channel, notices on its sibling collection, the session
    heartbeats with values in the thousands), so a frame counts only when every
    field above matches - one of those frames parsed as a level was the 0 %
    flash the earlier release showed.
    """
    if not reply:
        return None
    data = list(reply)
    if len(data) >= BRAGI_MSG_SIZE + 1:      # hidapi may hand the report id back
        data = data[1:]
    if len(data) < 5 or data[0] != BRAGI_ROUTE_CHILD:
        return None
    if data[1] == BRAGI_CMD_GET and data[2] == 0x00:            # the Dark Core
        return data[3] | (data[4] << 8)
    if (len(data) >= 6 and data[1] == BRAGI_ROUTE_CHILD         # the Virtuoso
            and data[2] == BRAGI_CMD_GET and data[3] == 0x00):
        return data[4] | (data[5] << 8)
    return None


def parse_bragi(reply) -> Optional[int]:
    """The battery level in percent from a get-property answer, or None."""
    value = parse_bragi_raw(reply)
    if value is None or value == 0 or value > BRAGI_LEVEL_MAX:
        return None
    return value // 10


def parse_bragi_charge(reply) -> Optional[bool]:
    """True while charging, False on battery, None when not a charge answer.

    Property 0x10: 1 = charging, 2 = on battery (measured on the Virtuoso SE
    receiver's headset, #204); anything else is not taken as a state.
    """
    value = parse_bragi_raw(reply)
    if value == 1:
        return True
    if value == 2:
        return False
    return None


def parse_level(r) -> Optional[int]:
    """Percent from a battery reply, or None when there is no usable value."""
    if not r or len(r) <= LEVEL_INDEX + 1:
        return None
    vendor = r[LEVEL_INDEX] | (r[LEVEL_INDEX + 1] << 8)
    if vendor == 0 or vendor > LEVEL_MAX:
        return None
    return vendor // 10


class CorsairProvider(Provider):
    name = "corsair"

    def __init__(self):
        self._diag: List[str] = []

    def _pick(self, infos: List[dict]) -> Optional[dict]:
        for d in infos:
            if d.get("interface_number") == CONTROL_INTERFACE:
                return d
        self._diag.append(f"  no interface {CONTROL_INTERFACE} collection; "
                          f"falling back to the first of {len(infos)}")
        return infos[0] if infos else None

    def _pick_bragi(self, infos: List[dict]) -> List[dict]:
        """The dongle's vendor collections, the one that answers first.

        It has two (0xFF42:0x0001 and 0xFF42:0x0002, from the #56 dump): the
        exchange answers on usage 0x0001, while 0x0002 is its notice channel and
        is not asked. When 0xFF42 is missing, the remaining collections are tried,
        which then costs one read window.
        """
        vend = [d for d in infos if d.get("usage_page") == BRAGI_VENDOR_PAGE]
        if not vend:
            self._diag.append(f"  no {BRAGI_VENDOR_PAGE:04x} collection; trying all "
                              f"{len(infos)}")
            vend = list(infos)
        return sorted(vend, key=lambda d: (0 if d.get("usage") == BRAGI_USAGE else 1,
                                           d.get("interface_number") or 99))

    def _ask_bragi(self, dev, window: float, parse=parse_bragi) -> Optional[int]:
        """One ask's answer within a time window; the parsed value, or None."""
        deadline = time.monotonic() + window
        for _ in range(BRAGI_READ_ATTEMPTS):
            if time.monotonic() >= deadline:
                return None
            r = dev.read(BRAGI_MSG_SIZE + 1, READ_TIMEOUT_MS)
            if not r:
                continue
            self._diag.append(f"  reply: {hexdump(r)}")
            value = parse(r)
            if value is not None:
                return value
        return None

    def _write_bragi(self, dev, prop: int = BRAGI_PROP_BATTERY,
                     route: int = BRAGI_ROUTE_MOUSE, pid: int = 0x1B7F) -> bool:
        """Send a get-property ask in the framing the receiver takes.

        The Dark Core's dongle takes the 65-byte report-id-0 frame (confirmed on
        hardware), with the bare form as a fallback; the Virtuoso SE receiver
        refuses every report-id-prefixed form with Windows' 0x57 and takes its
        own bare 64-byte frame, extra leading 0x02 included (#204, measured).
        """
        if pid in BRAGI_BARE_PIDS:
            forms = [bragi_se_request(prop, route)]
        else:
            req = bragi_request(prop, route)
            forms = [req, req[1:]]
        framed = True
        for buf in forms:
            try:
                wrote = dev.write(buf)
            except (OSError, IOError, ValueError) as e:
                self._diag.append(f"  write: {e}")
                wrote = None
            if isinstance(wrote, int) and wrote > 0:
                if not framed:
                    self._diag.append("  (the framed write was refused; "
                                      "the bare form took it)")
                return True
            framed = False
        self._diag.append(f"  prop {prop:02x}: the write was refused")
        return False

    def _read_window(self, dev, window: float, label: str) -> None:
        """Read and log whatever arrives in a short window (session replies)."""
        deadline = time.monotonic() + window
        for _ in range(BRAGI_READ_ATTEMPTS):
            if time.monotonic() >= deadline:
                return
            try:
                r = dev.read(BRAGI_MSG_SIZE + 1, READ_TIMEOUT_MS)
            except (OSError, IOError, ValueError):
                return
            if r:
                self._diag.append(f"  {label}: {hexdump(r)}")

    def _bragi_session(self, dev, deadline: float, pid: int) -> None:
        """The session the SE receiver was measured with (#204): firmware query,
        receiver heartbeat (route 0x08), headset heartbeat (route 0x09)."""
        for prop, route, label in ((BRAGI_PROP_FIRMWARE, BRAGI_ROUTE_DONGLE,
                                    "firmware query"),
                                   (BRAGI_PROP_HEARTBEAT, BRAGI_ROUTE_DONGLE,
                                    "receiver heartbeat"),
                                   (BRAGI_PROP_HEARTBEAT, BRAGI_ROUTE_MOUSE,
                                    "headset heartbeat")):
            if time.monotonic() >= deadline:
                return
            if not self._write_bragi(dev, prop, route, pid):
                self._diag.append(f"  {label}: not sent")
                return
            self._read_window(dev, min(0.8, max(0.0, deadline - time.monotonic())), label)

    @staticmethod
    def _routes(pid: int) -> Tuple[int, ...]:
        """The target order for a pid: the wired ids try themselves first (HSC #570)."""
        if pid in BRAGI_WIRED_PIDS:
            return (BRAGI_ROUTE_DONGLE, BRAGI_ROUTE_MOUSE)
        if pid in (0x0A3E, 0x0A64):
            return (BRAGI_ROUTE_MOUSE, BRAGI_ROUTE_DONGLE)
        return (BRAGI_ROUTE_MOUSE,)

    def _bragi_charge(self, dev, deadline: float, pid: int,
                      route: int = BRAGI_ROUTE_MOUSE) -> Optional[bool]:
        """The charge state on the receivers that report one (property 0x10),
        or None."""
        if pid not in BRAGI_BARE_PIDS or time.monotonic() >= deadline:
            return None
        if not self._write_bragi(dev, BRAGI_PROP_CHARGE, route=route, pid=pid):
            return None
        value = self._ask_bragi(dev, min(BRAGI_CONFIRM_WINDOW_S,
                                         deadline - time.monotonic()),
                                parse=parse_bragi_charge)
        if value is None:
            self._diag.append("  no charge-state answer")
            return None
        self._diag.append("  charge state: " + ("charging" if value else "on battery"))
        return bool(value)

    def _query_bragi(self, path: bytes, deadline: float,
                     pid: int) -> Optional[Tuple[int, Optional[bool]]]:
        """One battery question to the dongle; (level, charging or None), or None.

        The answer arrives late - measured ~4.7 s on the reporter's dongle with
        the mouse resting (#56) - so the wait is a time window (review by
        @ahmedkhursheed23: traffic frames end a 500 ms read early and used to
        eat a read-count budget). The answer does not echo which property it
        answers, and Windows delivers input reports to every open handle, so a
        second app polling the same dongle could put a foreign answer on the
        channel that parses as a level - the ask is repeated and the two answers
        must agree (a confirming ask that stays silent is noted and the single
        reading taken; a disagreement is refused rather than shown). The SE
        receivers run the measured session first and answer the charge property
        after the level (#204).
        """
        dev = hid.device()
        try:
            dev.open_path(path)
        except (OSError, IOError) as e:
            self._diag.append(f"  open: {e}")
            return None
        try:
            self._drain(dev)
            if pid in BRAGI_SESSION_PIDS:
                self._bragi_session(dev, deadline, pid)
            routes = self._routes(pid)
            first = None
            route = routes[0]
            for i, route in enumerate(routes):
                if not self._write_bragi(dev, route=route, pid=pid):
                    return None
                first = self._ask_bragi(dev, min(BRAGI_WINDOW_S,
                                                 deadline - time.monotonic()))
                if first is not None:
                    break
                if i + 1 < len(routes):
                    self._diag.append(f"  no answer on target {route:02x}; "
                                      "trying the other")
            if first is None:
                self._diag.append("  no battery answer")
                return None
            if not self._write_bragi(dev, route=route, pid=pid):
                return None
            second = self._ask_bragi(dev, min(BRAGI_CONFIRM_WINDOW_S,
                                              deadline - time.monotonic()))
            if second is None:
                self._diag.append("  (the confirming ask stayed silent; taking the "
                                  "single reading)")
            elif second != first:
                self._diag.append(f"  the two answers disagree ({first} % / {second} %) - "
                                  f"refused")
                return None
            return first, self._bragi_charge(dev, deadline, pid, route)
        except (OSError, IOError, ValueError) as e:
            self._diag.append(f"  query error: {e}")
            return None
        finally:
            try:
                dev.close()
            except Exception:
                pass

    def _write(self, dev, endpoint: int, sub: int, command: int) -> bool:
        dev.write(make_request(endpoint, sub, command))
        return True

    def _drain(self, dev) -> None:
        """Drop replies that are still queued, so the next read is ours."""
        for _ in range(4):
            if not dev.read(MSG_SIZE_READ, FLUSH_TIMEOUT_MS):
                return

    def _query(self, path: bytes) -> Optional[List[int]]:
        dev = hid.device()
        try:
            dev.open_path(path)
        except (OSError, IOError) as e:
            self._diag.append(f"  open: {e}")
            return None
        try:
            # The handshake that wakes a sleeping headset without an audible pop.
            self._write(dev, RECEIVER_ENDPOINT, FW_SUB, CMD_FIRMWARE)
            self._write(dev, RECEIVER_ENDPOINT, HB_SUB, CMD_HEARTBEAT)
            self._drain(dev)
            self._write(dev, HEADSET_ENDPOINT, HB_SUB, CMD_HEARTBEAT)
            if not dev.read(MSG_SIZE_READ, READ_TIMEOUT_MS):
                self._diag.append("  headset heartbeat: no reply "
                                  "(headset off or asleep)")
                return None
            self._drain(dev)

            for attempt in range(ATTEMPTS):
                self._write(dev, HEADSET_ENDPOINT, BATTERY_SUB, CMD_BATTERY)
                r = dev.read(MSG_SIZE_READ, READ_TIMEOUT_MS)
                if not r:
                    self._diag.append(f"  attempt {attempt + 1}: no reply")
                    continue
                self._diag.append(f"  attempt {attempt + 1} reply: {hexdump(r)}")
                if parse_level(r) is not None:
                    return list(r)
            self._diag.append("  no usable level in the replies")
            return None
        except (OSError, IOError, ValueError) as e:
            self._diag.append(f"  query error: {e}")
            return None
        finally:
            try:
                dev.close()
            except Exception:
                pass

    def poll(self) -> List[DeviceStatus]:
        self._diag = []
        try:
            infos = hidlist.enumerate(CORSAIR_VID)
        except Exception as e:  # pragma: no cover
            log.warning("hid.enumerate(corsair): %s", e)
            return []
        out = []
        seen = set()
        for pid in PIDS:
            mine = [d for d in infos if d["product_id"] == pid and d["path"] not in seen]
            if not mine:
                continue
            d = self._pick(mine)
            if d is None:
                continue
            seen.add(d["path"])
            name = PIDS[pid]
            self._diag.append(f"[Corsair] pid={pid:04x} '{name}' "
                              f"iface={d.get('interface_number')} "
                              f"{d.get('usage_page', 0):04x}:{d.get('usage', 0):04x}")
            reply = self._query(d["path"])
            level = parse_level(reply)
            if level is None:
                continue
            out.append(DeviceStatus(f"corsair:{pid:04x}", name, level, False, True,
                                    "corsair", kind="headset"))
        found: Dict[str, Tuple[int, bool, str, str]] = {}
        for pid, name in BRAGI_PIDS.items():
            mine = [d for d in infos if d["product_id"] == pid and d["path"] not in seen]
            if not mine:
                continue
            self._diag.append(f"[Corsair bragi] pid={pid:04x} '{name}'")
            deadline = time.monotonic() + BRAGI_POLL_BUDGET_S
            for d in self._pick_bragi(mine):
                if time.monotonic() >= deadline:
                    self._diag.append("  (the read budget is spent; the remaining "
                                      "collections are skipped)")
                    break
                self._diag.append(f"  iface={d.get('interface_number')} "
                                  f"usage={d.get('usage_page', 0):04x}:{d.get('usage', 0):04x}")
                seen.add(d["path"])
                got = self._query_bragi(d["path"], deadline, pid)
                if got is None:
                    continue
                level, charging = got
                key = BRAGI_KEYS[pid]
                kind = "mouse" if pid == 0x1B7F else "headset"
                kept = found.get(key)
                # a receiver and a cable of one headset are one icon; when both
                # answer, the one that reports charging wins (the cable state)
                if kept is None or (charging and not kept[1]):
                    found[key] = (level, bool(charging), name, kind)
                break
        for key, (level, charging, name, kind) in found.items():
            out.append(DeviceStatus(key, name, level, charging, True, "corsair",
                                    kind=kind))
        return out

    def diagnostics(self) -> List[str]:
        return list(self._diag)

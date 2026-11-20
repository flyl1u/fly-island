"""JBL Quantum 910 Wireless over USB/HID, without JBL QuantumENGINE.

Protocol from plugato/JBL_Baterry_Monitor, which reads this headset on Linux for
exactly this USB id (0ecb:2088):

  * the headset pushes its own reports on the receiver's vendor collection
    (ff13:0001, reported on interface 5 by a real unit); there is no request to send.
    The battery arrives as report id 0x08 with the level in byte 1 - the pattern that
    project confirmed against the hardware ([Report ID, Battery%] -> 08 1e = 30%).
  * report id 0x2f carries the microphone mute state, not a level.
  * the headset can stay quiet for a long time, so the last level heard is kept and
    shown greyed out until something arrives again - the project reaches for the
    headset's own buttons to make it talk, and a probe here does the same by
    reporting what it saw.

Charging is not in the frame that carries the level, so none is reported.
"""
from __future__ import annotations

import threading
from typing import Dict, List, Optional, Tuple

import hid

from . import hidlist
from .base import DeviceStatus, Provider, hexdump, log

JBL_VID = 0x0ECB
JBL_PID_QUANTUM910 = 0x2088

USAGE_PAGE = 0xFF13             # the receiver's vendor collection
USAGE = 0x0001

REPORT_ID_BATTERY = 0x08
REPORT_ID_MUTE = 0x2F
REPORT_ID_POWER = 0x09      # power/link state, byte 1 = 0/1; not a level
LEVEL_INDEX = 1

# The headset talks when it feels like it, and on a real unit it talks on an *event*: the only
# frame seen there (report 0x08 with byte 1 = 0x5f = 95, at the moment JBL's own app said 95%)
# arrived when the headset was plugged into its charger. Pressing every button and rolling the
# volume produced nothing. A report that arrives while the collection is closed is lost, so a
# reader thread keeps it open and listens all the time; poll() only takes what it heard and
# never waits, so it does not hold up the other devices.
READ_TIMEOUT_MS = 250       # one read() of the reader thread; only sets how fast it can stop
# scripts/probe.bat polls once: there the first poll still listens this long, as it always did
PROBE_LISTEN_S = 10.0

PIDS = {
    JBL_PID_QUANTUM910: "JBL Quantum 910 Wireless",
}


def parse_level(r) -> Optional[int]:
    """Percent from a battery report, or None when this is not one."""
    if not r or len(r) <= LEVEL_INDEX:
        return None
    if r[0] != REPORT_ID_BATTERY:
        return None
    level = r[LEVEL_INDEX]
    return level if 0 <= level <= 100 else None


class _Reader:
    """Keeps the receiver's collection open in its own thread and reads every report the
    headset pushes. take() hands over what arrived since the last call."""

    def __init__(self, path: bytes):
        self.path = path
        self._lock = threading.Lock()
        self._level: Optional[int] = None    # newest level since the last take()
        self._power: Optional[bool] = None   # newest 0x09 state since the last take()
        self._lines: List[str] = []          # diagnostics since the last take()
        self._error: Optional[str] = None    # terminal failure, retained until replacement
        self._reports = 0
        self.heard = threading.Event()       # a level arrived and was not taken yet
        self._stop = threading.Event()
        self.thread = threading.Thread(target=self._run, name="jbl-reader", daemon=True)
        self.thread.start()

    def alive(self) -> bool:
        return self.thread.is_alive()

    def stop(self) -> None:
        self._stop.set()        # the thread sees it after its current read() and closes

    def take(self) -> Tuple[Optional[int], Optional[bool], List[str]]:
        with self._lock:
            lines = self._lines + ([self._error] if self._error is not None else [])
            out = (self._level, self._power, lines)
            self._level, self._power, self._lines = None, None, []
            self.heard.clear()
        return out

    def _note(self, line: str) -> None:
        with self._lock:
            # Both callers terminate the worker. Observing the error while the
            # thread is still exiting must not erase its failure on the next poll.
            self._error = line

    def _run(self) -> None:
        dev = hid.device()
        try:
            dev.open_path(self.path)
        except (OSError, IOError) as e:
            self._note(f"  open: {e}")
            return
        try:
            while not self._stop.is_set():
                r = dev.read(64, READ_TIMEOUT_MS)
                if not r:
                    continue        # the headset goes quiet between reports; keep listening
                self._handle(r)
        except (OSError, IOError, ValueError) as e:
            # the receiver was unplugged, most likely; the next poll opens it again
            self._note(f"  read error: {e}")
        finally:
            try:
                dev.close()
            except Exception:
                pass

    def _handle(self, r) -> None:
        self._reports += 1
        lines = [f"  report {self._reports}: {hexdump(r)}"]
        level = parse_level(r)
        on = None
        if level is None:
            if r[0] == REPORT_ID_MUTE:
                lines.append("  (mute report, not a level)")
            elif r[0] == REPORT_ID_POWER:
                # The reporter confirmed the meaning on his unit: byte 1 is 0x00 when the
                # headset is switched off and 0x01 when it is switched on.
                on = bool(r[1]) if len(r) > 1 else None
                lines.append("  (power report: headset %s, not a level)"
                             % ("ON" if on else "OFF" if on is not None else "state unknown"))
        with self._lock:
            self._lines += lines
            if on is not None:
                self._power = on
            if level is not None:
                self._level = level
                self.heard.set()


class JblProvider(Provider):
    name = "jbl"

    def __init__(self, listen_first: float = 0.0):
        self._diag: List[str] = []
        self._last: Dict[bytes, int] = {}     # the headset goes quiet; keep what we heard
        self._power: Dict[bytes, bool] = {}   # 0x09: switch state, so "quiet" can be explained
        self._readers: Dict[bytes, _Reader] = {}
        self._listen_first = listen_first     # seconds the first poll waits for a level (probe)

    def _pick(self, infos: List[dict]) -> Optional[dict]:
        # pick the collection by usage, never by interface number or position: a
        # reporter's dump of a real receiver shows exactly one vendor collection,
        # 0ecb:2088 as ff13:0001 on interface 5, while the Linux reference reaches the
        # same receiver through its interrupt endpoint
        for d in infos:
            if d.get("usage_page") == USAGE_PAGE and d.get("usage") == USAGE:
                return d
        self._diag.append(f"  no {USAGE_PAGE:04x}:{USAGE:04x} collection among {len(infos)}; "
                          f"using the first")
        return infos[0] if infos else None

    def _listen(self, path: bytes) -> Optional[int]:
        """Whatever the headset has sent since the last poll, without waiting for it."""
        reader = self._readers.get(path)
        if reader is None:
            reader = self._readers[path] = _Reader(path)
            if self._listen_first:
                reader.heard.wait(self._listen_first)
        # Only replace a worker known to have exited BEFORE draining its data.
        # If it exits after this check, its final reports/error survive to the
        # next poll instead of being discarded with the old reader.
        exited = not reader.alive()
        level, on, lines = reader.take()
        self._diag += lines
        if on is not None:
            self._power[path] = on
        if exited:
            # the open failed or the receiver went away: try again, heard on the next poll
            self._readers[path] = _Reader(path)
        return level

    def poll(self) -> List[DeviceStatus]:
        self._diag = []
        try:
            infos = hidlist.enumerate(JBL_VID)
        except Exception as e:  # pragma: no cover
            log.warning("hid.enumerate(jbl): %s", e)
            return []
        out = []
        present = set()
        for pid in PIDS:
            mine = [d for d in infos if d["product_id"] == pid]
            if not mine:
                continue
            d = self._pick(mine)
            if d is None:
                continue
            name = PIDS[pid]
            key = f"jbl:{pid:04x}"
            path = d["path"]
            present.add(path)
            self._diag.append(f"[JBL] pid={pid:04x} '{name}' "
                              f"iface={d.get('interface_number')} "
                              f"{d.get('usage_page', 0):04x}:{d.get('usage', 0):04x}")
            level = self._listen(path)
            if level is not None:
                self._last[path] = level
                out.append(DeviceStatus(key, name, level, False, True, "jbl", kind="headset"))
                continue
            if path in self._last:
                self._diag.append("  nothing new; keeping the last level, greyed out")
                out.append(DeviceStatus(key, name, self._last[path], False, False,
                                        "jbl", kind="headset"))
            else:
                if self._power.get(path) is False:
                    self._diag.append("  nothing heard yet and no earlier level "
                                     "(the headset was last seen switched off)")
                else:
                    self._diag.append("  nothing heard yet and no earlier level")
        for path in [p for p in self._readers if p not in present]:
            self._readers.pop(path).stop()      # the receiver is gone
        return out

    def diagnostics(self) -> List[str]:
        return list(self._diag)

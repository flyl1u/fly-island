"""Tests for the PA-protocol cache fix, item 4 of the review in #62.

A "PA" headset (BlackShark V2 Pro 2023, Barracuda) that is switched off must cost one probe
per poll instead of one per vendor collection - and the collection that gets remembered must
be the one that actually speaks the protocol. `read_battery` cannot say which of the two
"no reading" situations it is in unless it distinguishes them: an interface that opened but
never accepted a command (which is also what a wrong collection looks like) must not be
cached, only an interface that accepted a command with the headset staying silent.

No hardware: PASession is replaced by a stub whose write/query behaviour is scripted.

Run from the repository root:

    python -m unittest discover -s tests
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import _hidstub  # noqa: E402, F401

from providers import blackshark, razer  # noqa: E402


class StubSession:
    """One collection: whether it ever accepts a command, and what the battery query answers."""

    script = {}          # path -> (accepts, answer)

    def __init__(self, path, diag):
        if path == b"unopenable":
            raise OSError("cannot open")
        self.path, self.diag = path, diag
        self.accepts, self.answer = self.script.get(path, (True, None))

    def _write(self, frame):
        return self.accepts

    def query(self, cmd_id):
        return list(self.answer) if self.answer is not None else None

    def close(self):
        pass


class ReadBatteryTest(unittest.TestCase):
    def setUp(self):
        self._saved = (blackshark.PASession, blackshark.time.sleep, blackshark.WAKE_ATTEMPTS)
        blackshark.PASession = StubSession
        blackshark.time.sleep = lambda *_: None
        blackshark.WAKE_ATTEMPTS = 1

    def tearDown(self):
        blackshark.PASession, blackshark.time.sleep, blackshark.WAKE_ATTEMPTS = self._saved

    def test_a_collection_that_never_accepts_a_command_is_nowake(self):
        StubSession.script = {b"wrong": (False, None)}
        self.assertEqual(blackshark.read_battery(b"wrong", [])[0], "nowake")

    def test_a_collection_that_accepts_and_stays_silent_is_offline(self):
        StubSession.script = {b"right": (True, None)}
        self.assertEqual(blackshark.read_battery(b"right", [])[0], "offline")

    def test_a_reading_is_ok(self):
        StubSession.script = {b"right": (True, [77])}
        res, level, _ = blackshark.read_battery(b"right", [])
        self.assertEqual((res, level), ("ok", 77))

    def test_a_path_that_cannot_be_opened_is_fail(self):
        StubSession.script = {}
        self.assertEqual(blackshark.read_battery(b"unopenable", [])[0], "fail")


def iface(path, page, usage=0x0001):
    return {"path": path, "interface_number": 3, "usage_page": page, "usage": usage,
            "product_id": 0x0555, "vendor_id": 0x1532}


class PollPaTest(unittest.TestCase):
    def setUp(self):
        self._saved = blackshark.read_battery
        self.calls = []

    def tearDown(self):
        blackshark.read_battery = self._saved

    def script(self, mapping):
        def read(path, diag):
            self.calls.append(path)
            res, level = mapping[path]
            return res, level, False
        blackshark.read_battery = read

    def test_the_collection_that_speaks_is_remembered_and_the_walk_stops(self):
        a, b = iface(b"wrong", 0xFF00), iface(b"right", 0xFF14)
        mapping = {b"wrong": ("nowake", None), b"right": ("offline", None)}
        self.script(mapping)
        p = razer.RazerProvider()
        self.assertEqual(p._poll_pa(("k",), [a, b])[0], razer.STATUS_TIMEOUT)
        self.assertEqual(self.calls, [b"wrong", b"right"])       # wrong one tried, not remembered
        self.assertEqual(p._cache[("pa", "k")].path, b"right")
        self.calls.clear()
        self.assertIsNotNone(p._poll_pa(("k",), [a, b]))
        self.assertEqual(self.calls, [b"right"])                 # one probe per poll now

    def test_a_nowake_collection_is_never_cached(self):
        self.script({b"wrong": ("nowake", None)})
        p = razer.RazerProvider()
        self.assertEqual(p._poll_pa(("k",), [iface(b"wrong", 0xFF00)])[0], razer.STATUS_TIMEOUT)
        self.assertEqual(dict(p._cache), {})                     # "no link" is still shown

    def test_a_working_collection_is_still_reached_after_a_nowake_first(self):
        # the regression the suggested one-line fix would have introduced
        a, b = iface(b"wrong", 0xFF00), iface(b"right", 0xFF14)
        self.script({b"wrong": ("nowake", None), b"right": ("offline", None)})
        p = razer.RazerProvider()
        p._poll_pa(("k",), [a, b])
        self.script({b"wrong": ("nowake", None), b"right": ("ok", 78)})
        res, level, _ = p._poll_pa(("k",), [a, b])
        self.assertEqual((res, level), (razer.STATUS_OK, 78))


if __name__ == "__main__":
    unittest.main()

"""Tests for providers/jbl.py. No hardware is needed.

The fake receiver hands out the reports a test queues, one per read(), and
otherwise waits the way hidapi's read(n, timeout) does. It records which thread
reads, so the tests can prove that poll() itself never waits for the headset:
the listening happens in the provider's own reader thread, which keeps the
collection open between polls so no report is lost.

Run from the repository root:

    python -m unittest discover -s tests
"""
import os
import queue
import sys
import threading
import time
import types
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import _hidstub  # noqa: E402, F401

from providers import jbl as J  # noqa: E402

PATH = b"\\\\?\\hid#vid_0ecb&pid_2088&mi_05#x"
ENTRY = {"product_id": J.JBL_PID_QUANTUM910, "interface_number": 5,
         "usage_page": J.USAGE_PAGE, "usage": J.USAGE, "path": PATH}
WAIT = 5.0      # an upper bound for the reader thread to catch up; never reached when it works


class FakeReceiver:
    def __init__(self):
        self.reports = queue.Queue()
        self.opened = 0
        self.closed = 0
        self.readers = set()           # threads that called read()
        self.idle = threading.Event()  # read() found nothing queued: every report so far is handled
        self.fail = None               # an exception read() raises, e.g. the receiver unplugged
        self.open_error = None
        self.lock = threading.Lock()   # send() and read()'s "nothing queued" check do not interleave

    def send(self, *reports):
        with self.lock:
            self.idle.clear()
            for r in reports:
                self.reports.put(list(r))

    def settle(self):
        """Wait until the reader has handled everything queued."""
        assert self.idle.wait(WAIT), "the reader thread never came back to read()"

    def device_class(self):
        rx = self

        class FakeDevice:
            def open_path(self, path):
                if rx.open_error:
                    raise rx.open_error
                rx.opened += 1

            def read(self, n, timeout=0):
                rx.readers.add(threading.current_thread())
                if rx.fail:
                    raise rx.fail
                with rx.lock:
                    try:
                        return rx.reports.get_nowait()
                    except queue.Empty:
                        rx.idle.set()
                try:
                    return rx.reports.get(timeout=min(timeout, 20) / 1000)
                except queue.Empty:
                    return []

            def close(self):
                rx.closed += 1
        return FakeDevice


class PollTest(unittest.TestCase):
    def setUp(self):
        self._saved = (J.hid, J.hidlist)
        self.rx = FakeReceiver()
        self.entries = [ENTRY]
        J.hid = types.SimpleNamespace(device=self.rx.device_class())
        J.hidlist = types.SimpleNamespace(enumerate=lambda vid=0: list(self.entries))
        self.provider = J.JblProvider()

    def tearDown(self):
        self.entries = []
        self.provider.poll()            # stops the reader threads
        J.hid, J.hidlist = self._saved

    def seen(self, res):
        return [(r.key, r.name, r.level, r.charging, r.online, r.kind) for r in res]

    def test_poll_does_not_wait_for_the_headset(self):
        # poll() never calls read() itself, so it never waits out a read timeout
        self.assertEqual(self.provider.poll(), [])      # nothing heard yet
        self.rx.settle()
        self.provider.poll()
        self.assertTrue(self.rx.readers)
        self.assertNotIn(threading.current_thread(), self.rx.readers)

    def test_level_heard_between_polls(self):
        self.provider.poll()
        self.rx.send([J.REPORT_ID_BATTERY, 95])
        self.rx.settle()
        self.assertEqual(self.seen(self.provider.poll()),
                         [("jbl:2088", "JBL Quantum 910 Wireless", 95, False, True, "headset")])
        self.assertIn(f"  report 1: {J.hexdump([J.REPORT_ID_BATTERY, 95])}", self.provider.diagnostics())

    def test_quiet_headset_keeps_the_last_level_greyed(self):
        self.provider.poll()
        self.rx.send([J.REPORT_ID_BATTERY, 30])
        self.rx.settle()
        self.provider.poll()
        self.rx.settle()
        self.assertEqual(self.seen(self.provider.poll()),
                         [("jbl:2088", "JBL Quantum 910 Wireless", 30, False, False, "headset")])
        self.assertIn("  nothing new; keeping the last level, greyed out", self.provider.diagnostics())

    def test_the_collection_stays_open_between_polls(self):
        for level in (40, 41, 42):
            self.provider.poll()
            self.rx.send([J.REPORT_ID_BATTERY, level])
            self.rx.settle()
        self.assertEqual([r.level for r in self.provider.poll()], [42])
        self.assertEqual((self.rx.opened, self.rx.closed), (1, 0))

    def test_newest_level_wins(self):
        self.provider.poll()
        self.rx.send([J.REPORT_ID_MUTE, 1], [J.REPORT_ID_BATTERY, 60], [J.REPORT_ID_BATTERY, 59])
        self.rx.settle()
        self.assertEqual([(r.level, r.online) for r in self.provider.poll()], [(59, True)])
        self.assertIn("  (mute report, not a level)", self.provider.diagnostics())

    def test_power_report_explains_silence(self):
        self.provider.poll()
        self.rx.send([J.REPORT_ID_POWER, 0])
        self.rx.settle()
        self.assertEqual(self.provider.poll(), [])
        diag = self.provider.diagnostics()
        self.assertIn("  (power report: headset OFF, not a level)", diag)
        self.assertIn("  nothing heard yet and no earlier level "
                      "(the headset was last seen switched off)", diag)

    def test_receiver_unplugged_and_back(self):
        self.provider.poll()
        self.rx.fail = OSError("read error")
        self.rx.send([J.REPORT_ID_BATTERY, 1])    # wakes the reader
        self.provider._readers[PATH].thread.join(WAIT)
        self.assertEqual(self.rx.closed, 1)
        self.rx.fail = None                        # plugged back in
        self.rx.reports = queue.Queue()
        self.provider.poll()                       # reports the error, opens it again
        self.assertIn("  read error: read error", self.provider.diagnostics())
        self.rx.send([J.REPORT_ID_BATTERY, 70])
        self.rx.settle()
        self.assertEqual([(r.level, r.online) for r in self.provider.poll()], [(70, True)])
        self.assertEqual(self.rx.opened, 2)

    def test_open_failure_is_reported(self):
        self.rx.open_error = OSError("open failed")
        self.provider.poll()
        self.provider._readers[PATH].thread.join(WAIT)
        self.provider.poll()
        self.assertIn("  open: open failed", self.provider.diagnostics())

    def test_open_failure_survives_observation_before_thread_exit(self):
        self.rx.open_error = OSError("open failed")
        with patch.object(J.threading, "Thread") as factory:
            thread = factory.return_value
            thread.is_alive.return_value = True
            # The worker has recorded its error, but has not exited yet.
            thread.start.side_effect = lambda: factory.call_args.kwargs["target"]()
            self.provider.poll()
            self.assertIn("  open: open failed", self.provider.diagnostics())
            thread.is_alive.return_value = False
            self.provider.poll()
            self.assertIn("  open: open failed", self.provider.diagnostics())

    def test_open_failure_between_take_and_exit_check_is_not_discarded(self):
        self.rx.open_error = OSError("open failed")
        with patch.object(J.threading, "Thread") as factory:
            thread = factory.return_value
            thread.is_alive.return_value = True
            self.provider.poll()  # Worker has not run yet; no hardware access.
            reader = self.provider._readers[PATH]
            take = reader.take

            def finish_after_take():
                result = take()
                reader._run()  # Complete the fake open immediately after take.
                thread.is_alive.return_value = False
                return result

            with patch.object(reader, "take", side_effect=finish_after_take):
                self.provider.poll()
            self.provider.poll()
            self.assertIn("  open: open failed", self.provider.diagnostics())

    def test_reader_stops_when_the_receiver_is_gone(self):
        self.provider.poll()
        reader = self.provider._readers[PATH]
        self.entries = []
        self.assertEqual(self.provider.poll(), [])
        reader.thread.join(WAIT)
        self.assertFalse(reader.thread.is_alive())
        self.assertEqual(self.rx.closed, 1)
        self.assertEqual(self.provider._readers, {})

    def test_probe_listens_on_its_first_poll(self):
        # console mode (scripts/probe.bat) polls once, so it still waits for a level to arrive
        provider = J.JblProvider(listen_first=WAIT)
        later = threading.Timer(0.2, self.rx.send, ([J.REPORT_ID_BATTERY, 88],))
        later.start()                   # the headset talks only after poll() has begun
        try:
            started = time.monotonic()
            self.assertEqual([(r.level, r.online) for r in provider.poll()], [(88, True)])
            # and it stops listening as soon as the level is in, not at the end of the window
            self.assertLess(time.monotonic() - started, WAIT / 2)
        finally:
            later.cancel()
            for r in provider._readers.values():
                r.stop()


if __name__ == "__main__":
    unittest.main()

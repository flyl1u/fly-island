"""Tests for the hidlist fix, item 8 of the review in #62.

hidapi opens every device it lists to read its attributes, so a collection it could not open
at that moment is missing from the result - with the path set unchanged, so the short list
would be served from the cache until the device is replugged. A result shorter than the
vendor's present interfaces is now re-read: immediately once, then at most every SHORT_RETRY
so that a permanently unopenable collection cannot turn every call into an enumeration.

No hardware: hid.enumerate and interface_paths are stubbed.

Run from the repository root:

    python -m unittest discover -s tests
"""
import os
import sys
import time
import types
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import _hidstub  # noqa: E402, F401

from providers import hidlist  # noqa: E402

VID = 0x1532
PATHS = frozenset(r"\?\hid#vid_1532&pid_0000&col%d#{abcd}" % i for i in range(10))
ALL = sorted(PATHS)


class HidlistTest(unittest.TestCase):
    def setUp(self):
        self._saved = (hidlist.hid, hidlist.interface_paths, hidlist.SHORT_RETRY)
        self.enumerations = 0
        self.script = []

        def enum(vid=0):
            self.enumerations += 1
            got = self.script.pop(0) if self.script else ALL[:9]
            return [{"path": p, "product_id": vid} for p in got]

        hidlist.hid = types.SimpleNamespace(enumerate=enum)
        hidlist.interface_paths = lambda: PATHS
        hidlist._cache.clear()
        hidlist._short_at.clear()
        hidlist._stats.update({"hidapi": 0, "cached": 0, "skipped": 0, "short": 0})

    def tearDown(self):
        hidlist.hid, hidlist.interface_paths, hidlist.SHORT_RETRY = self._saved

    def test_a_short_list_is_re_read_and_the_missing_collection_comes_back(self):
        self.script = [ALL[:9], ALL]
        self.assertEqual(len(hidlist.enumerate(VID)), 9)
        self.assertEqual(len(hidlist.enumerate(VID)), 10)        # retried, complete now
        self.assertEqual(self.enumerations, 2)

    def test_a_permanently_short_list_is_re_read_once_then_rate_limited(self):
        self.script = [ALL[:9]]                                  # always short
        self.assertEqual(len(hidlist.enumerate(VID)), 9)
        self.assertEqual(len(hidlist.enumerate(VID)), 9)         # the immediate retry
        hidlist.SHORT_RETRY = 3600.0
        self.assertEqual(len(hidlist.enumerate(VID)), 9)         # rate-limited, served cached
        self.assertEqual(self.enumerations, 2)

    def test_a_complete_list_is_still_cached(self):
        self.script = [ALL]
        self.assertEqual(len(hidlist.enumerate(VID)), 10)
        self.assertEqual(len(hidlist.enumerate(VID)), 10)
        self.assertEqual(self.enumerations, 1)

    def test_paths_for_counts_the_vendors_present_interfaces(self):
        self.assertEqual(len(hidlist.paths_for(PATHS, VID)), 10)
        self.assertEqual(hidlist.paths_for(PATHS, 0x054C), [])

    def test_the_short_retry_is_well_clear_of_the_poll_interval(self):
        self.assertGreaterEqual(self._saved[2], 10.0)


if __name__ == "__main__":
    unittest.main()

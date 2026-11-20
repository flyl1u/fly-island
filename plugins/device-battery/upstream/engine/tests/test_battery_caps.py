import ctypes as c
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import battery_hid
from standardhid import Caps

OK = 0x00110000


class FakeApi:
    """Fills button/value caps like hid.dll for one direction."""

    def __init__(self, buttons=(), values=()):
        self.buttons, self.values = list(buttons), list(values)
        # Plain functions accept the argtypes/restype assignments made by the code.
        self.HidP_GetButtonCaps = lambda t, a, n, d: self._fill(self.buttons, a, n)
        self.HidP_GetValueCaps = lambda t, a, n, d: self._fill(self.values, a, n)

    def _fill(self, items, array, count):
        out, n = getattr(array, "_obj", array), count._obj
        for i, item in enumerate(items[:n.value]):
            for key, value in item.items():
                setattr(out[i], key, value)
        n.value = len(items)
        return OK


VGN_ARRAY = {"page": 0xFF1C, "report": 4, "alias": 0, "field": 0x00, "is_range": 1,
             "usage_min": 0, "usage_max": 255}


def caps(ib=0, iv=0, ob=0, ov=0, size=64):
    value = Caps()
    value.ib, value.iv, value.ob, value.ov = ib, iv, ob, ov
    value.input = value.output = size
    return value


class ByteArrayReportTests(unittest.TestCase):
    def test_vgn_lone_byte_array_proves_both_sizes(self):
        sizes = battery_hid.battery_caps(FakeApi([VGN_ARRAY]), None, caps(ib=1, ob=1))
        self.assertEqual(sizes, {"input_report_sizes": {"4": 64}, "output_report_sizes": {"4": 64}})

    def test_variable_item_is_not_an_array(self):
        item = dict(VGN_ARRAY, field=0x02)
        self.assertIsNone(battery_hid.byte_report_sizes(FakeApi([item]), None, caps(ib=1), 0))

    def test_non_byte_selector_range_is_rejected(self):
        for change in ({"usage_max": 127}, {"usage_min": 1}, {"is_range": 0}, {"alias": 1}):
            item = dict(VGN_ARRAY, **change)
            self.assertIsNone(battery_hid.byte_report_sizes(FakeApi([item]), None, caps(ib=1), 0), change)

    def test_multiple_buttons_or_mixed_values_are_rejected(self):
        api = FakeApi([VGN_ARRAY, VGN_ARRAY])
        self.assertIsNone(battery_hid.byte_report_sizes(api, None, caps(ib=2), 0))
        self.assertIsNone(battery_hid.byte_report_sizes(FakeApi([VGN_ARRAY]), None, caps(ib=1, iv=1), 0))

    def test_unreasonable_collection_size_is_rejected(self):
        self.assertIsNone(battery_hid.byte_report_sizes(FakeApi([VGN_ARRAY]), None, caps(ib=1, size=1), 0))


if __name__ == "__main__":
    unittest.main()

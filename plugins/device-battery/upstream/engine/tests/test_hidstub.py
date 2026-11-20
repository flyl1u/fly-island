"""The optional HID fallback must never replace an importable real binding."""
import builtins
from pathlib import Path
import runpy
import sys
import types
import unittest
from unittest.mock import patch


HELPER = Path(__file__).with_name("_hidstub.py")


class HidStubTests(unittest.TestCase):
    def missing_hid(self):
        original_import = builtins.__import__

        def without_hid(name, *args, **kwargs):
            if name == "hid":
                raise ModuleNotFoundError("No module named 'hid'", name="hid")
            return original_import(name, *args, **kwargs)

        with patch.dict(sys.modules):
            sys.modules.pop("hid", None)
            with patch("builtins.__import__", side_effect=without_hid):
                runpy.run_path(str(HELPER))
            return sys.modules["hid"]

    def test_importable_hid_is_preserved(self):
        real_hid = types.ModuleType("hid")
        with patch.dict(sys.modules, {"hid": real_hid}):
            runpy.run_path(str(HELPER))
            self.assertIs(sys.modules["hid"], real_hid)

    def test_missing_hid_enumerates_no_devices(self):
        hid = self.missing_hid()
        self.assertEqual(hid.enumerate(), [])
        self.assertEqual(hid.enumerate(0x046D, product_id=0xC547), [])

    def test_missing_hid_refuses_device_opens(self):
        device = self.missing_hid().device()
        with self.assertRaises(OSError):
            device.open(0x046D, 0xC547)
        with self.assertRaises(OSError):
            device.open_path(b"fixture-only")
        device.close()


if __name__ == "__main__":
    unittest.main()

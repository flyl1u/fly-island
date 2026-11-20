"""Keep protocol fixtures importable without installing the native HID binding."""
import sys
import types

try:
    import hid
except ImportError:
    class _UnavailableDevice:
        def open(self, *args, **kwargs):
            raise OSError("hidapi is unavailable; tests must provide a fake HID device")

        open_path = open

        def close(self):
            pass

    hid = types.ModuleType("hid")
    hid.enumerate = lambda *args, **kwargs: []
    hid.device = _UnavailableDevice
    sys.modules["hid"] = hid

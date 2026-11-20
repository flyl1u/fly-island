"""VGN HUB beiying dongles: one descriptor-gated, read-only BY battery query.

No model query: VGN HUB routes these exact pairs directly to getBatteryInternal.
258A:024F was user-verified in #190; siblings have static protocol evidence only.
Wired beiying endpoints use different feature protocols and are excluded.
Shared 3554:FA09 receivers belong exclusively to mchose_by_keyboard.
"""
import battery_hid as H
from by_keyboard import make_request, payload

VID = 0x258A
PIDS = {
    (0x258A, 0x024F): "VGN V98 Pro V3 2.4G receiver",
    (0x258A, 0x027F): "VGN V98 Pro V3 2.4G receiver",
    (0x258A, 0x027B): "VGN V87 V2 2.4G receiver",
    (0x391D, 0x2A01): "VGN N75 V2 2.4G receiver",
    (0x391D, 0x2A02): "VGN V108 2.4G receiver",
}


def parse_reply(reply):
    data = payload(reply, 0x4A, check_checksum=True)
    if data is None or data[0] > 100:
        return None
    # #190: bit 4 followed external power at 99%. Unlike M HUB, no full-status
    # nibble interpretation or 100%-charging suppression is established here.
    return data[0], bool(data[1] & 0x10), ""


class VgnBeiyingProvider(H.BatteryHidProvider):
    name = "vgn_beiying"
    vid = VID
    pids = {pid: name for (vid, pid), name in PIDS.items() if vid == VID}
    collection = (0xFF02, 0x0002)
    input_id = output_id = 0x13
    input_bounds = (20, 20)
    output_bytes = 20
    kind = "keyboard"
    verification_level = "C"  # 用户实机验证，#190 (024F only).
    read_timeout_ms = 2500
    make_request = staticmethod(make_request)
    parse_reply = staticmethod(parse_reply)

    def poll(self):
        result, diagnostics = [], []
        original = self.vid, self.pids
        try:
            for vid in sorted({vid for vid, _ in PIDS}):
                self.vid = vid
                self.pids = {pid: name for (vendor, pid), name in PIDS.items() if vendor == vid}
                result.extend(super().poll())
                diagnostics.extend(self._diag)
        finally:
            self.vid, self.pids = original
            self._diag = diagnostics
        return result

    def _pick(self, infos):
        info = super()._pick(infos)
        if info is not None and any(info.get(direction + "_report_sizes") != {"19": 20}
                                    for direction in ("input", "output")):
            self._diag.append("single byte-array report not proven: nothing sent")
            return None
        return info

    def _query(self, dev, info):
        # Only #190 supplies a controlled plugged/unplugged charging comparison.
        self.charging_known = (info["vendor_id"], info["product_id"]) == (0x258A, 0x024F)
        return super()._query(dev, info)

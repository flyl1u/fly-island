"""Tests for providers/mchose.py - the A5 Pro Max addition. No hardware is needed.

The exchange is the one z750sasr/mchose-a5-pro-max-web-driver documents for the
first-generation A5 Pro Max (docs/PROTOCOL.md and lib/a5-protocol.ts): 64-byte feature
reports on the vendor collection (usage page 0xFFFF), report id 0; the reference's
payload carries route 2 at its byte 2, its own length 2 at byte 3, page 0 at byte 4 and
command 0x83 at byte 5. The reply starts with the 0xA1 marker and echoes page and
command at its bytes 4 and 5, with the charging state in byte 6 and the level in byte 7
(clamped to 100, as the reference clamps it). The collection shape is the reporter's
diagnostics dump from issue #149 (2023:f013 'MCHOSE A5 2.4G': the mouse, ffa0:0001 and
ffff:0001 on interface 1, a keyboard, consumer and system collection, then ffff:0000 on
interface 2).

Run from the repository root:

    python -m unittest discover -s tests
"""
import os
import sys
import types
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import _hidstub  # noqa: E402, F401

from providers import mchose as M  # noqa: E402


def answer(level=58, charging=False):
    """A reply as the reference expects it: 0xA1, ..., page, command, charge, level."""
    return ([0xA1, 0x00, 0x00, 0x00, M.A5_PAGE, M.A5_CMD_BATTERY,
             1 if charging else 0, level] + [0x00] * 56)


class FakeMchose:
    """One fake receiver for every open_path; only `answer_path` replies with 0xA1."""

    def __init__(self, level=58, charging=False, answer_path=None):
        self.level = level
        self.charging = charging
        self.answer_path = answer_path
        self.path = None
        self.sent = []                    # (path, bytes)
        self.reads = 0

    # hid.device API
    def open_path(self, path):
        self.path = path

    def close(self):
        pass

    def send_feature_report(self, data):
        self.sent.append((self.path, bytes(data)))
        return len(data)

    def get_feature_report(self, report_id, length):
        self.reads += 1
        if self.path == self.answer_path:
            return [M.A5_REPORT_ID] + answer(self.level, self.charging)
        return [0x00] * length               # silent: no 0xA1 marker in it


def entries(pid=0xF013, prefix=b"a5"):
    # the reporter's dump for 2023:f013, in its order
    shape = [(0, 0x0001, 0x0002),   # the mouse: never written to
             (1, 0xFFA0, 0x0001),
             (1, 0xFFFF, 0x0001),   # the vendor page the reference prefers
             (1, 0x0001, 0x0006),
             (1, 0x000C, 0x0001),
             (1, 0x0001, 0x0080),
             (2, 0xFFFF, 0x0000)]
    return [{"vendor_id": 0x2023, "product_id": pid, "interface_number": i,
             "usage_page": p, "usage": u,
             "path": prefix + b"-%d-%04x-%02x" % (i, p, u),
             "product_string": "MCHOSE A5 2.4G"}
            for i, p, u in shape]


FF_F1 = entries()[2]["path"]         # ffff:0001 on interface 1
FF_F2 = entries()[6]["path"]         # ffff:0000 on interface 2
FFA0 = entries()[1]["path"]


class ParseTest(unittest.TestCase):
    def test_the_request_frame_is_the_references_plus_the_report_id(self):
        self.assertEqual(M.make_a5_request(),
                         [0x00, 0x00, 0x00, 0x02, 0x02, 0x00, 0x83] + [0x00] * 58)
        self.assertEqual(len(M.make_a5_request()), 65)

    def test_the_answer_reads_level_and_charging(self):
        self.assertEqual(M.parse_a5(answer(58, True)), (58, True))
        self.assertEqual(M.parse_a5(answer(58, False)), (58, False))

    def test_the_report_id_may_lead_the_answer(self):
        self.assertEqual(M.parse_a5([0x00] + answer(58, True)), (58, True))

    def test_a_level_above_100_is_clamped_as_the_reference_clamps_it(self):
        self.assertEqual(M.parse_a5(answer(200, False)), (100, False))

    def test_another_page_or_command_is_refused(self):
        wrong = answer()
        wrong[5] = 0x84
        self.assertIsNone(M.parse_a5(wrong))
        wrong = answer()
        wrong[4] = 0x02
        self.assertIsNone(M.parse_a5(wrong))

    def test_a_silent_or_short_answer_is_refused(self):
        self.assertIsNone(M.parse_a5([0x00] * 65))
        self.assertIsNone(M.parse_a5([0xA1, 0x00, 0x00]))
        self.assertIsNone(M.parse_a5(None))


class PollTest(unittest.TestCase):
    def setUp(self):
        self._saved = (M.hid, M.hidlist, M.time)
        self.now = [1000.0]
        M.time = types.SimpleNamespace(sleep=lambda s: None, time=lambda: self.now[0])

    def tearDown(self):
        M.hid, M.hidlist, M.time = self._saved

    def poll(self, fake, ents):
        M.hid = types.SimpleNamespace(device=lambda: fake)
        M.hidlist = types.SimpleNamespace(
            enumerate=lambda vid=0: [e for e in ents if e["vendor_id"] == vid])
        p = M.MchoseProvider()
        return p.poll(), p.diagnostics()

    def test_the_receiver_is_read_on_the_ffff_collection(self):
        ents = entries()
        fake = FakeMchose(level=58, charging=True, answer_path=FF_F1)
        out, diag = self.poll(fake, ents)
        self.assertEqual([(s.key, s.name, s.level, s.charging, s.online, s.source, s.kind)
                          for s in out],
                         [("mchose:2023", "MCHOSE A5 2.4G", 58, True, True,
                           "mchose", "mouse")])
        self.assertEqual({p for p, _ in fake.sent}, {FF_F1})    # nothing else was written to
        self.assertEqual(fake.sent[0][1], bytes(M.make_a5_request()))

    def test_the_second_ffff_collection_is_tried_too(self):
        # the same reply arrives on either ffff collection depending on the model/revision
        ents = entries()
        fake = FakeMchose(level=77, charging=False, answer_path=FF_F2)
        out, _ = self.poll(fake, ents)
        self.assertEqual([s.level for s in out], [77])
        self.assertTrue(any(p == FF_F2 for p, _ in fake.sent))
        self.assertNotIn(FFA0, {p for p, _ in fake.sent})

    def test_another_2023_pid_is_left_alone(self):
        ents = entries(pid=0xF017)       # an A5 Pro receiver, not a Pro Max identity
        fake = FakeMchose(level=58, charging=False, answer_path=FF_F1)
        out, diag = self.poll(fake, ents)
        self.assertEqual(out, [])
        self.assertEqual(fake.sent, [])
        self.assertTrue(any("leaving it alone" in line for line in diag))

    def test_silence_gives_nothing_and_says_so(self):
        ents = entries()
        fake = FakeMchose(answer_path=None)
        out, diag = self.poll(fake, ents)
        self.assertEqual(out, [])
        # the 0xFFA0 sibling is not written to even when the mouse stays silent
        # (review by @ahmedkhursheed23)
        self.assertNotIn(FFA0, {p for p, _ in fake.sent})
        self.assertTrue(any("no A1 answer" in line for line in diag))


if __name__ == "__main__":
    unittest.main()

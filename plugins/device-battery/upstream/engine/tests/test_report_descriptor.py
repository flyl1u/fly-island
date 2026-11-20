"""Pure HID 1.11 descriptor proofs; captured bytes and synthetic items only."""
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import _hidstub
from battery_hid import declared_report_summary, parse_report_descriptor, report_descriptor_proof


RAPOO_DESCRIPTOR = bytes.fromhex(
    "06 00 ff 09 02 a1 01 85 07 09 02 15 00 26 ff 00 75 08 95 12 81 00 "
    "09 02 15 00 26 ff 00 75 08 95 12 91 00 c0")
START = "06 00 ff 09 02 a1 01 "


def descriptor(body):
    return bytes.fromhex(START + body + " c0")


class ReportDescriptorTests(unittest.TestCase):
    def test_declarations_are_bounded_numeric_metadata_not_arbitrary_inventory(self):
        info = {"declared_report_sizes": {"output": {"75": 64}, "input": {"76": 64}, "feature": {}}}
        self.assertEqual(declared_report_summary(info),
                         "; declared=out:4B/64,in:4C/64,feature:none")
        self.assertEqual(declared_report_summary({}),
                         "; declared=out:unknown,in:unknown,feature:unknown")
        info["declared_report_sizes"]["input"] = {
            "76": 64, "private-path": 64, "1": "private-payload", "2": True,
            "3": 4097, "256": 64, "٤": 64, "0004": 64, 5: 64}
        summary = declared_report_summary(info)
        self.assertEqual(summary, "; declared=out:4B/64,in:4C/64,in:unknown,feature:none")
        self.assertNotIn("private", summary)
        info["declared_report_sizes"] = {d: {str(i): 4096 for i in range(256)}
                                         for d in ("input", "output", "feature")}
        summary = declared_report_summary(info)
        self.assertLess(len(summary), 512)
        self.assertEqual(summary.count("/4096"), 24)
        self.assertEqual(summary.count(":+248"), 3)

    def test_reported_vt3s_descriptor_input_and_output_include_id(self):
        self.assertEqual(parse_report_descriptor(RAPOO_DESCRIPTOR), {
            (0xFF00, 2): {"input": {"7": 19}, "output": {"7": 19}, "feature": {}}})
        self.assertEqual(report_descriptor_proof(bytearray(RAPOO_DESCRIPTOR))[1], None)

    def test_push_pop_restores_size_count_id_and_usage_page(self):
        raw = bytes.fromhex(
            "06 00 ff 75 08 95 02 85 07 a4 "
            "06 02 ff 75 10 95 03 85 08 a4 75 08 95 01 85 09 b4 "
            "09 02 a1 01 81 02 91 02 b1 02 c0 b4 09 02 a1 01 81 02 c0")
        parsed = parse_report_descriptor(raw)
        self.assertEqual(parsed[(0xFF02, 2)], {
            "input": {"8": 7}, "output": {"8": 7}, "feature": {"8": 7}})
        self.assertEqual(parsed[(0xFF00, 2)]["input"], {"7": 3})

    def test_multiple_reports_nested_collection_and_bit_padding(self):
        raw = descriptor("85 07 75 01 95 03 81 02 95 05 81 01 "
                         "09 03 a1 00 75 08 95 02 81 02 c0 "
                         "85 08 95 04 81 02 95 06 91 02 95 01 b1 02")
        self.assertEqual(parse_report_descriptor(raw)[(0xFF00, 2)], {
            "input": {"7": 4, "8": 5}, "output": {"8": 7}, "feature": {"8": 2}})

    def test_local_usage_reset_and_extended_usage_page(self):
        raw = bytes.fromhex("0b 02 00 02 ff a1 01 75 08 95 01 81 02 c0 "
                            "06 00 ff 09 03 a1 01 91 02 c0")
        parsed = parse_report_descriptor(raw)
        self.assertEqual(parsed[(0xFF02, 2)]["input"], {"0": 2})
        self.assertEqual(parsed[(0xFF00, 3)]["output"], {"0": 2})
        # The field's Usage must not leak past Input to the next collection.
        raw = descriptor("75 08 95 01 09 04 81 02") + bytes.fromhex("a1 01 c0")
        self.assertIsNone(parse_report_descriptor(raw))

    def test_usage_ranges_and_implicit_id_zero(self):
        raw = descriptor("19 00 29 ff 75 08 95 12 81 00")
        self.assertEqual(parse_report_descriptor(raw)[(0xFF00, 2)]["input"], {"0": 19})

    def test_invalid_or_unsupported_items_fail_closed_with_fixed_reasons(self):
        cases = {
            "fe 01 00 00": "long item",
            "77": "truncated item",
            "0c": "reserved item",
            "c5 00": "reserved item",
            "74": "invalid global item",
            "85 00": "invalid report ID",
            "86 07 00": "invalid report ID",
            "a5 00": "invalid global item",
            "b4": "unbalanced global stack",
            "a4": "unbalanced global stack",
            "a9 01": "unsupported local item",
            "08": "invalid usage",
            "19 01 75 08 95 01 81 00": "invalid usage",
            "29 01 75 08 95 01 81 00": "invalid usage",
            "19 02 29 01 75 08 95 01 81 00": "invalid usage",
            "19 01 19 02 29 03 75 08 95 01 81 00": "invalid usage",
            "1b 00 00 01 00 2b ff 00 02 00 75 08 95 01 81 00": "invalid usage",
            "d1 00": "unknown main item",
            "a1 07": "invalid main item",
            "c1 00": "invalid main item",
            "c0": "unbalanced collection",
            "81 00": "missing report size/count",
            "75 08 81 00": "missing report size/count",
            "95 01 81 00": "missing report size/count",
            "75 00 95 01 81 00": "report size out of bounds",
            "75 08 95 00 81 00": "report size out of bounds",
            "77 ff ff ff ff 97 ff ff ff ff 81 00": "report size out of bounds",
            "75 01 95 07 81 00": "non-byte-aligned report",
            "75 08 95 01 82 00 02": "invalid main item",
            "75 08 95 01 81 80": "invalid main item",
            "75 08 95 01 80": "invalid main item",
            "75 08 95 01 81 00 85 07 81 00": "mixed report IDs",
            "75 08 95 01 81 00 a4 85 07 b4": "mixed report IDs",
            "": "no reports",
        }
        for body, reason in cases.items():
            with self.subTest(body=body):
                raw = descriptor(body)
                self.assertIsNone(parse_report_descriptor(raw))
                self.assertEqual(report_descriptor_proof(raw), (None, reason))

    def test_collection_ambiguity_shared_ids_and_unbalanced_structure(self):
        valid = descriptor("85 07 75 08 95 01 81 00")
        invalid = [valid + valid, valid[:-1], valid + b"\xc0",
                   valid + bytes.fromhex("09 03"),
                   bytes.fromhex("75 08 95 01 81 00"),
                   bytes.fromhex("06 00 ff 09 01 09 02 a1 01 75 08 95 01 81 00 c0"),
                   bytes.fromhex("06 00 ff 19 01 29 02 a1 01 75 08 95 01 81 00 c0"),
                   valid + bytes.fromhex("09 03 a1 01 81 00 c0")]
        for raw in invalid:
            with self.subTest(raw=raw):
                self.assertIsNone(parse_report_descriptor(raw))
        self.assertEqual(report_descriptor_proof(invalid[-1])[1], "report shared across collections")

    def test_bounds_truncation_and_alignment_apply_to_every_report_and_direction(self):
        for raw in (None, 10, [1], "75", b"", b"\x00" * 4097):
            self.assertIsNone(parse_report_descriptor(raw))
        for end in range(len(RAPOO_DESCRIPTOR)):
            self.assertIsNone(parse_report_descriptor(RAPOO_DESCRIPTOR[:end]), end)
        for body in ("85 07 75 08 95 01 81 00 85 08 75 01 81 00",
                     "85 07 75 08 95 01 81 00 75 01 91 00",
                     "85 07 75 08 95 01 81 00 75 01 b1 00",
                     "85 07 75 08 96 ff 0f 81 00 95 01 81 00"):
            self.assertIsNone(parse_report_descriptor(descriptor(body)))
        self.assertEqual(parse_report_descriptor(descriptor("75 08 96 ff 0f 81 00"))[
            (0xFF00, 2)]["input"], {"0": 4096})


if __name__ == "__main__":
    unittest.main()

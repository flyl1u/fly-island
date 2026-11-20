"""Pack contract, protocol boundaries and manager/child integration; no hardware."""
from contextlib import contextmanager
from dataclasses import FrozenInstanceError, replace
import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import types
import unittest
from unittest.mock import patch

ENGINE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ENGINE))
sys.path.insert(0, str(ENGINE / "tests"))
import _hidstub  # noqa: F401
from device_pack import BRAND_PROVIDERS, EMPTY_PACK, MAX_BYTES, load_pack, parse_pack
from providers import profiles as registry, razer as R
from test_razer import FakeBus, FakeMouse, entry as hid_entry
import server
from isolation import wire_encode


def entry(pid="FE01", **values):
    return dict({"provider": "razer", "profile": "hyperspeed-mouse-1f", "profileRev": 1,
                 "match": {"vendorId": "1532", "productId": pid},
                 "name": "Pack Mouse", "kind": "mouse", "source": "issue-23"}, **values)


def disabled(pid="00B9", provider="razer", vid="1532"):
    return {"provider": provider, "vendorId": vid, "productId": pid, "reason": "issue-25"}


def document(entries=None, denies=None):
    return {"format": "myfinder-device-pack", "loader": 1, "packVersion": 2026110401,
            "keyId": "pack-2026a", "createdAt": "2026-11-04T10:00:00Z",
            "entries": [entry()] if entries is None else entries,
            "disabled": [] if denies is None else denies}


def pack(data=None):
    return parse_pack(json.dumps(document() if data is None else data))


def info(pid=0xFE01, path=b"pack", **values):
    return dict(hid_entry(pid, path, "Pack USB product"), vendor_id=0x1532,
                physical_id="fixture-physical", **values)


@contextmanager
def fake_razer(inventory, devices):
    with patch.object(R, "hid", types.SimpleNamespace(device=FakeBus(devices).device_class())), \
            patch.object(R.hidlist, "enumerate", return_value=inventory), \
            patch.object(R, "time", types.SimpleNamespace(time=time.time, sleep=lambda _: None)):
        yield


class ValidationTests(unittest.TestCase):
    def test_disable_scope_matches_engine_brand_providers(self):
        self.assertEqual(BRAND_PROVIDERS, {name for name, _ in server.PROVIDERS} - {"bluetooth", "xinput"})

    def assert_rejected(self, data):
        result = pack(data)
        self.assertFalse(result.loaded, result)
        self.assertIsNone(result.version)
        self.assertEqual((result.entries, result.disabled), ((), ()))
        self.assertTrue(result.rejected)
        return result

    def test_valid_immutable_snapshot_and_defaults(self):
        result = pack()
        self.assertTrue(result.loaded)
        self.assertEqual(result.entries[0].level, "C")
        self.assertEqual(result.rejected, ())
        for target, field, value in ((result, "version", 1), (result.entries[0], "name", "bad"),
                                     (result.entries[0].match, "product_id", 1)):
            with self.assertRaises(FrozenInstanceError):
                setattr(target, field, value)
        original = result.diagnostic()
        original["rejected"].append("mutated")
        self.assertEqual(result.rejected, ())

    def test_bad_top_level_fields_reject_all(self):
        for field, values in {
            "format": ["wrong", 1, None], "loader": [2, True, 1.0, "1"],
            "packVersion": [0, -1, 10**10, True, 1.0, "1", None],
            "keyId": ["", "has spaces", "a" * 65, 123],
            "createdAt": ["now", "2026-02-30T10:00:00Z", "2026-11-04T10:00:00+00:00", None],
            "entries": [{}, None, ""], "disabled": [{}, None, ""],
        }.items():
            for value in values:
                with self.subTest(field=field, value=value):
                    data = document(denies=[disabled()])
                    data[field] = value
                    self.assert_rejected(data)

    def test_non_object_rows_reject_all(self):
        for field in ("entries", "disabled"):
            for value in (None, [], 1, "row", True):
                data = document()
                data[field] = [value]
                with self.subTest(field=field, value=value):
                    self.assert_rejected(data)

    def test_unknown_and_missing_fields_at_every_object_level(self):
        for location in ("root", "entry", "match", "disabled"):
            for change in ("unknown", "missing"):
                data = document(denies=[disabled()])
                target, required = {"root": (data, "loader"), "entry": (data["entries"][0], "profile"),
                                    "match": (data["entries"][0]["match"], "productId"),
                                    "disabled": (data["disabled"][0], "reason")}[location]
                if change == "unknown":
                    target["transactionId"] = 31
                else:
                    del target[required]
                with self.subTest(location=location, change=change):
                    self.assert_rejected(data)

    def test_entry_and_match_types_ranges_and_printability(self):
        cases = {"provider": [None, [], 2], "profile": [[], "", True],
                 "profileRev": [0, 2, True, 1.0, "1"], "match": [None, [], 2],
                 "name": ["", "a" * 49, "bad\nname", "bad\x00", "a\u200bb", "\ud800", 2],
                 "kind": ["unknown", None, 1], "level": ["Z", 0, True], "source": [[], "a" * 129, "bad\t"]}
        for field, values in cases.items():
            for value in values:
                data = document(denies=[disabled()])
                data["entries"][0][field] = value
                with self.subTest(field=field, value=value):
                    self.assert_rejected(data)
        for field in ("vendorId", "productId", "usagePage", "usage"):
            for value in ("123", "12345", "0x12", "G123", "1234\n", 0x1532, True, None):
                data = document()
                data["entries"][0]["match"][field] = value
                with self.subTest(field=field, value=value):
                    self.assert_rejected(data)
        for value in (-1, 256, True, 1.0, "1", None):
            data = document()
            data["entries"][0]["match"]["interfaceNumber"] = value
            self.assert_rejected(data)

    def test_disabled_shape_errors_also_reject_pack(self):
        for field, value in (("provider", 1), ("vendorId", 0x1532), ("productId", "0x01"),
                             ("reason", ""), ("reason", "a" * 257), ("reason", "bad\n")):
            data = document(denies=[disabled()])
            data["disabled"][0][field] = value
            self.assert_rejected(data)

    def test_boundaries_and_unicode_names(self):
        for version in (1, 9999999999):
            data = document()
            data["packVersion"] = version
            data["entries"][0]["name"] = "测试鼠标 " + "x" * 43
            data["entries"][0]["match"].update(interfaceNumber=255, usagePage="fF00", usage="0000")
            self.assertTrue(pack(data).loaded)

    def test_duplicate_keys_at_every_depth(self):
        text = json.dumps(document(denies=[disabled()]))
        for key, value in (("loader", "1"), ("profileRev", "1"), ("productId", '"FE01"'),
                           ("reason", '"issue-25"')):
            needle = json.dumps(key) + ": "
            duplicate = text.replace(needle, needle + value + ", " + needle, 1)
            result = parse_pack(duplicate)
            self.assertFalse(result.loaded)
            self.assertIn("duplicate_key", result.rejected[0])

    def test_invalid_json_encoding_nonfinite_numbers_and_size(self):
        for data in ("{", "[]", "null", "true", "", b"\xff", b"\xef\xbb\xbf{}",
                     "[" * 2000, b" " * (MAX_BYTES + 1), json.dumps(document()).replace('"loader": 1', '"loader": NaN'),
                     json.dumps(document()).replace('"loader": 1', '"loader": Infinity')):
            with self.subTest(data=str(data)[:50]):
                self.assertFalse(parse_pack(data).loaded)

    def test_total_row_limit_including_disabled(self):
        rows = [disabled(f"{pid:04X}") for pid in range(2000)]
        self.assertTrue(pack(document([], rows)).loaded)
        self.assert_rejected(document([entry()], rows))
        self.assert_rejected(document([], rows + [disabled()]))

    def test_missing_file_and_absent_option_are_safe(self):
        self.assertEqual(load_pack(), EMPTY_PACK)
        with tempfile.TemporaryDirectory(dir=ENGINE / "tests") as directory:
            self.assertFalse(load_pack(Path(directory) / "absent.json").loaded)
            self.assertFalse(load_pack(directory).loaded)

    def test_builtin_conflict_and_reserved_protocol_ids(self):
        for pid in ("00B9", "0528", "053A", "052E", "0095", "00CB"):
            result = pack(document([entry(pid), entry()]))
            self.assertTrue(result.loaded)
            self.assertEqual([e.match.product_id for e in result.entries], [0xFE01])
            self.assertIn("builtin_id_conflict", result.rejected[0])

    def test_duplicate_ids_reject_every_member_even_disjoint_profiles(self):
        for second in (entry("fe01"), entry("FE01", profile="hyperspeed-mouse-3f")):
            second["match"]["interfaceNumber"] = 3
            result = pack(document([entry(), second, entry("FE02")]))
            self.assertEqual([e.match.product_id for e in result.entries], [0xFE02])
            self.assertEqual(len(result.rejected), 2)
            self.assertTrue(all("duplicate_id_or_multiple_profiles" in r for r in result.rejected))

    def test_unknown_profile_provider_and_profile_mismatches_are_row_errors(self):
        bad = [entry(profile="unknown"), entry(provider="native_atk"), entry(provider="unknown"),
               entry(kind="headset"), entry()]
        bad[-1]["match"]["vendorId"] = "046D"
        for candidate in bad:
            result = pack(document([candidate, entry("FE02")]))
            self.assertTrue(result.loaded)
            self.assertEqual([e.match.product_id for e in result.entries], [0xFE02])
            self.assertEqual(len(result.rejected), 1)

    def test_unknown_revision_in_conflicting_row_still_rejects_whole_pack(self):
        self.assert_rejected(document([entry("00B9", profileRev=2), entry()], [disabled()]))

    def test_profile_declares_allowed_fields_and_ambiguity_is_rejected(self):
        profile = next(p for p in registry.profiles() if p.name == "hyperspeed-mouse-1f")
        restricted = replace(profile, match_fields=frozenset(("vendorId", "productId")))
        data = document()
        data["entries"][0]["match"]["usagePage"] = "FF00"
        with patch("device_pack.profiles", return_value=(restricted,)):
            self.assertIn("disallowed_match_field", self.assert_rejected(data).rejected[0])
        with patch("device_pack.profiles", return_value=(profile, profile)):
            result = pack()
            self.assertTrue(result.loaded)
            self.assertEqual(result.entries, ())
            self.assertIn("multiple_profiles", result.rejected[0])

    def test_disabled_is_exact_and_native_rows_are_rejected(self):
        result = pack(document(denies=[disabled(), disabled("FE01"), disabled(provider="native_atk", vid="373B", pid="1278")]))
        self.assertTrue(result.is_disabled("razer", 0x1532, 0x00B9))
        self.assertFalse(result.is_disabled("barracuda", 0x1532, 0x00B9))
        self.assertFalse(result.is_disabled("razer", 0x0001, 0x00B9))
        self.assertFalse(result.is_disabled("native_atk", 0x373B, 0x1278))
        self.assertEqual(len(result.rejected), 1)
        ids = registry.registered_ids(result)
        self.assertFalse(any(row[2] in (0x00B9, 0xFE01) for row in ids))
        self.assertEqual(len(result.diagnostic()["disabled"]), 2)

    def test_registered_ids_adds_pack_and_preserves_builtin_fallback(self):
        result = pack()
        self.assertIn(("razer", 0x1532, 0xFE01, "Pack Mouse", "mouse", "pack"), registry.registered_ids(result))
        self.assertEqual(registry.registered_ids(parse_pack("{invalid")), registry.registered_ids())
        result = pack(document(denies=[disabled("FE01", "barracuda")]))
        self.assertTrue(any(row[2] == 0xFE01 for row in registry.registered_ids(result)))


class RazerPackTests(unittest.TestCase):
    def test_all_seven_profiles_identify_new_ids_with_only_battery_commands(self):
        class RecordingMouse(FakeMouse):
            def __init__(self, tid):
                super().__init__(tid)
                self.commands = []
            def reply(self):
                self.commands.append(tuple(self.request[6:8]))
                return super().reply()
        profiles = registry.profiles()
        self.assertEqual(len(profiles), 7)
        for profile in profiles:
            with self.subTest(profile=profile.name):
                result = pack(document([entry(profile=profile.name, kind=profile.kind)]))
                mouse = RecordingMouse(dict(profile.parameters)["transaction_id"])
                with fake_razer([info()], {b"pack": mouse}):
                    statuses = R.RazerProvider(result).poll()
                self.assertEqual(len(statuses), 1)
                status = statuses[0]
                self.assertEqual((status.name, status.level, status.kind), ("Pack Mouse", 71, profile.kind))
                self.assertEqual((status.model_source, status.pack_version, status.verification_level),
                                 ("pack", result.version, "C"))
                self.assertIsNone(status.dpi)
                self.assertIsNone(status.dpi_target)
                self.assertEqual(mouse.commands, [(7, 0x80), (7, 0x84)])

    def test_hard_match_constraints_never_fallback_to_another_interface(self):
        data = document()
        data["entries"][0]["match"].update(interfaceNumber=2, usagePage="FF00", usage="0001")
        result = pack(data)
        exact = dict(info(), interface_number=2, usage_page=0xFF00, usage=1)
        for field, wrong in (("interface_number", 3), ("usage_page", 1), ("usage", 2)):
            mouse = FakeMouse(0x1F)
            with fake_razer([dict(exact, **{field: wrong})], {b"pack": mouse}):
                self.assertEqual(R.RazerProvider(result).poll(), [])
            self.assertEqual(mouse.tids, [])
        with fake_razer([exact], {b"pack": FakeMouse(0x1F)}):
            self.assertEqual(len(R.RazerProvider(result).poll()), 1)

    def test_pack_name_never_activates_pa_or_transaction_fallback(self):
        result = pack(document([entry(name="BlackShark Wireless", profile="headset-3f", kind="headset")]))
        mouse = FakeMouse(0xFF)
        with fake_razer([info()], {b"pack": mouse}), patch.object(R.RazerProvider, "_poll_pa") as pa:
            self.assertEqual(R.RazerProvider(result).poll(), [])
            pa.assert_not_called()
        self.assertEqual(mouse.tids, [0x3F])

    def test_disabled_builtin_pack_and_unknown_wireless_ids_never_poll(self):
        result = pack(document(denies=[disabled(), disabled("FE01"), disabled("FE02")]))
        inventory = [dict(info(pid, str(pid).encode()), product_string="Razer wireless")
                     for pid in (0x00B9, 0xFE01, 0xFE02)]
        with fake_razer(inventory, {}), patch.object(R.RazerProvider, "_read") as read:
            provider = R.RazerProvider(result)
            self.assertEqual(provider.poll(), [])
            read.assert_not_called()
            self.assertEqual(len(provider.diagnostics()), 3)

    def test_asleep_pack_retains_provenance_without_dpi_cache(self):
        mouse = FakeMouse(0x1F)
        provider = R.RazerProvider(pack())
        with fake_razer([info()], {b"pack": mouse}):
            provider.poll()
            with patch.object(provider, "_read", return_value=(R.STATUS_TIMEOUT, None, None)):
                status = provider.poll()[0]
        self.assertFalse(status.online)
        self.assertEqual(status.model_source, "pack")
        status.dpi = {"supported": True, "current": 800, "stages": [800], "canSet": True}
        status.dpi_target = {"must": "not escape"}
        normalized = server.normalise(status, {"dpi": status.dpi}, server.utcnow())
        self.assertIsNone(normalized["dpi"])
        self.assertEqual(normalized["modelSource"], "pack")
        self.assertEqual(normalized["verificationLevel"], "C")

    def test_builtin_tables_preserve_historical_data_with_se_additions(self):
        # Captured from the unmodified worktree before moving the 80-row table.
        old_digest = "dd1e3a2112d861c70bced5408bad19322be85a152e3c16645db7aaeeb85ffe67"
        legacy_known = {pid: value for pid, value in R.KNOWN.items() if pid not in (0x00DE, 0x00DF)}
        tables = {"KNOWN": legacy_known, "KEYBOARD_INTERFACE": R.KEYBOARD_INTERFACE}
        self.assertEqual(hashlib.sha256(json.dumps(tables, sort_keys=True).encode()).hexdigest(), old_digest)
        self.assertEqual({pid: R.KNOWN[pid] for pid in (0x00DE, 0x00DF)},
                         {pid: ("Razer Viper V3 Pro SE", 0x1F) for pid in (0x00DE, 0x00DF)})
        self.assertEqual(R.RazerProvider()._known, R.KNOWN)
        for pid in list(R.KNOWN) + [0, 0x053A, 0xFE01, 0xFFFF]:
            for name in ("", "wired keyboard", "Wireless Mouse", "HyperSpeed", "BlackShark"):
                expected = pid in R.KNOWN or pid in R.blackshark.PA_PIDS or any(w in name.lower() for w in R.WIRELESS_WORDS)
                self.assertEqual(R.maybe_wireless(pid, name), expected)

    def test_offline_registry_never_imports_hidapi(self):
        code = ("import sys; sys.path.insert(0, " + repr(str(ENGINE)) + "); "
                "sys.modules['hid'] = None; from providers.profiles import registered_ids; "
                "rows=registered_ids(); assert len(rows)==82; "
                "assert 'providers.razer' not in sys.modules; print(len(rows))")
        result = subprocess.run([sys.executable, "-I", "-B", "-c", code], capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), "82")


class EngineIntegrationTests(unittest.TestCase):
    def child(self, commands):
        data = b"".join((json.dumps(dict(command, sequence=i), default=wire_encode) + "\n").encode()
                        for i, command in enumerate(commands))
        output = io.StringIO()
        with patch.object(server.sys, "stdin", types.SimpleNamespace(buffer=io.BytesIO(data))), \
                patch.object(server.sys, "stdout", output):
            server.reader_child()
        return [json.loads(line) for line in output.getvalue().splitlines()]

    def test_child_receives_pack_and_reports_provenance(self):
        result = pack()
        command = {"action": "query", "provider": "razer", "physicalId": "fixture-physical",
                   "inventory": [info()], "devicePack": result.document}
        with fake_razer([info()], {b"pack": FakeMouse(0x1F)}):
            response = self.child([command, command])
        self.assertEqual(response[0]["candidateCount"], 1)
        self.assertEqual(response[0]["statuses"][0]["pack_version"], result.version)
        self.assertEqual(response[1]["statuses"][0]["model_source"], "pack")

    def test_disabled_legacy_brand_is_filtered_before_poll_and_dpi(self):
        result = pack(document([], [disabled("C539", "logitech", "046D")]))
        inventory = [dict(info(), vendor_id=0x046D, product_id=0xC539)]
        command = {"provider": "logitech", "physicalId": "fixture-physical", "inventory": inventory,
                   "devicePack": result.document}
        with patch("providers.logitech.LogitechProvider.poll") as poll, \
                patch("providers.logitech.set_device_dpi") as write:
            responses = self.child([dict(command, action="query"), dict(command, action="set_dpi")])
            poll.assert_not_called()
            write.assert_not_called()
        self.assertEqual(responses[0]["statuses"], [])
        self.assertEqual(responses[0]["candidateCount"], 0)
        self.assertEqual(responses[1]["errorCode"], "read_failed")

    def test_manager_never_schedules_disabled_brand_and_keeps_other_provider(self):
        # Reuse the existing isolation/scheduler fixture, including child budgets.
        sys.path.insert(0, str(ENGINE.parent / "tests"))
        from test_engine_reliability import FakePool
        inventory = [info(0x00B9)]
        pool = FakePool(inventory)
        result = pack(document([], [disabled()]))
        engine = server.BatteryEngine(process_factory=pool.factory, device_pack=result)
        engine.providers = ["razer", "standard_hid"]
        try:
            with patch.object(engine._hidlist, "interface_paths", return_value=frozenset()):
                response = engine.poll()
            names = [name for name, _physical in pool.calls]
            self.assertNotIn("razer", names)
            self.assertIn("standard_hid", names)
            self.assertEqual(response["devicePack"]["disabled"][0]["productId"], "00B9")
            self.assertTrue(response["ready"])
            self.assertEqual(engine._reader_command({"action": "query"})["devicePack"], result.document)
        finally:
            engine.close()

    def test_direct_engine_pack_poll_and_snapshot(self):
        result = pack()
        with fake_razer([info()], {b"pack": FakeMouse(0x1F)}):
            engine = server.BatteryEngine(providers=[R.RazerProvider()], include_native=True, device_pack=result)
            try:
                snapshot = engine.poll()
            finally:
                engine.close()
        self.assertTrue(snapshot["ready"])
        self.assertEqual(snapshot["devicePack"]["version"], result.version)
        self.assertEqual(snapshot["devices"][0]["packVersion"], result.version)
        self.assertIsNone(snapshot["devices"][0]["dpi"])

    def test_ready_cli_loads_or_falls_back_without_hardware(self):
        for data, loaded in ((json.dumps(document()), True), ("{bad", False), (None, False)):
            with self.subTest(data=data), patch.object(server, "load_pack", return_value=parse_pack(data) if data else EMPTY_PACK), \
                    patch.object(server.sys, "argv", ["server.py", "--device-pack", "fixture.json"]), \
                    patch.object(server.sys, "stdin", io.StringIO('{"command":"ready","requestId":17,"generation":3}\n')), \
                    patch.object(server.sys, "stdout", new_callable=io.StringIO) as output, \
                    patch.object(server.BatteryEngine, "poll", side_effect=AssertionError("ready must not poll")):
                server.main()
            response = json.loads(output.getvalue())
            self.assertTrue(response["ready"])
            self.assertEqual((response["requestId"], response["generation"]), (17, 3))
            self.assertEqual(response["devicePack"]["loaded"], loaded)

    def test_real_cli_ready_and_file_replacement_keep_startup_snapshot(self):
        with tempfile.TemporaryDirectory(dir=ENGINE / "tests") as directory:
            path = Path(directory) / "pack.json"
            path.write_text(json.dumps(document()), encoding="utf-8")
            result = load_pack(path)
            self.assertTrue(result.loaded)
            code = ("import sys; sys.path.insert(0, " + repr(str(ENGINE)) + "); "
                    "import server; server.main()")
            response = subprocess.run([sys.executable, "-I", "-B", "-c", code, "--device-pack", str(path)],
                                      input='{"command":"ready","requestId":21}\n', capture_output=True,
                                      text=True, timeout=10)
            self.assertEqual(response.returncode, 0, response.stderr)
            snapshot = json.loads(response.stdout)
            self.assertTrue(snapshot["ready"])
            self.assertEqual(snapshot["devicePack"], result.diagnostic())
            self.assertEqual(snapshot["requestId"], 21)
            path.write_text("{invalid replacement", encoding="utf-8")
            engine = server.BatteryEngine(device_pack=result)
            try:
                sent = engine._reader_command({"action": "query"})["devicePack"]
                self.assertEqual(parse_pack(sent), result)
            finally:
                engine.close()
            response = subprocess.run([sys.executable, "-I", "-B", "-c", code, "--device-pack", str(path)],
                                      input='{"command":"ready"}\n', capture_output=True, text=True, timeout=10)
            self.assertEqual(response.returncode, 0, response.stderr)
            snapshot = json.loads(response.stdout)
            self.assertTrue(snapshot["ready"])
            self.assertFalse(snapshot["devicePack"]["loaded"])
            self.assertTrue(snapshot["devicePack"]["rejected"])


if __name__ == "__main__":
    unittest.main()

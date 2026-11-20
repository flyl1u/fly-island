"""Offline triage index. Use protocol data; never import/run a HID reader.

IDs in the JSON are integers; source is 'builtin' or 'pack'. Migrated providers
use the offline profile registry; legacy providers are parsed statically.
Optional devices/pack/*.json files use the engine's device-pack validator.
--engine-root reads another snapshot's engine directory strictly as data and
does not use the current checkout's builtin profile IDs.
Rejected packs/rows and unrecognised modules are reported in unparsed.
For provider sources, unparsed lists modules with no indexed IDs; partial maps
modules with indexed IDs but incomplete coverage to an explanatory reason.
Device rows with a model-identification or product-name gate include
requiresModelMatch: true; absence means false (the legacy row shape is kept).
"""
from __future__ import annotations

import argparse
import ast
import json
from pathlib import Path
import sys


# Isolated Python (-I) omits the script directory on ordinary Python installs.
ENGINE = Path(__file__).resolve().parent
if str(ENGINE) not in sys.path:
    sys.path.insert(0, str(ENGINE))

from device_pack import load_pack
from providers.profiles import profiles, registered_ids


# Explicit table meanings prevent protocol opcodes/model numbers becoming PIDs.
# Only the name (first tuple item) is needed; parser function references are inert.
TABLES = {
    "atk_headset": ("PIDS",),
    "astro": ("PIDS",), "asus": ("KNOWN",), "asus_omni": ("PIDS",), "audeze": ("KNOWN",),
    "corsair": ("PIDS", "BRAGI_PIDS"), "gwolves": ("WIRED", "MODELS"),
    "hyperx": ("PIDS",), "hyperx_cloud3": ("PIDS",),
    "hyperx_cloud3s": ("PIDS",), "jbl": ("PIDS",),
    "keychron": ("PIDS",), "lamzu": ("PIDS",), "lofree": ("DONGLES",),
    "logitech": ("HEADSETS",), "logitech_centurion": ("PIDS",),
    "mchose": ("A5_PIDS",), "mchose_headset": ("PIDS",), "nzxt": ("PIDS",), "pulsar": ("PIDS", "NANO_PIDS"),
    "mchose_qhw_keyboard": ("PIDS",), "mchose_glw_keyboard": ("PIDS",),
    "mchose_by_keyboard": ("PIDS",),
    "moondrop": ("PIDS",),
    "zhuaudio": ("PIDS",),
    "g3m": ("PIDS",), "eweadn": ("PIDS",), "flydigi": ("PIDS",),
    "eweadn_s9pro": ("PIDS",),
    "vgn_keyboard": ("PIDS",),
    "cherry": ("PIDS",),
    "lingbao": ("PIDS",),
    "vgn_beiying": ("PIDS",),
    "rapoo": ("PIDS",),
    "fa6x_passive": ("PIDS",),
    "dareu": ("PIDS",),
    "vgn_dragonfly3": ("PIDS",), "ninjutso_legacy": ("PIDS",),
    "steelseries": ("MODELS", "MOUSE_MODELS", "CLASSIC_MODELS"),
    "steelseries_elite": ("PIDS",), "wlmouse": ("KNOWN",), "razer": ("KNOWN",),
}
SINGLE = {"am_infinity", "hyperx_alpha2", "barracuda"}
HELPERS = {"__init__", "base", "hidlist", "blackshark", "blackshark2020", "profiles"}


class StaticSource:
    def __init__(self, path):
        self.tree = ast.parse(path.read_text(encoding="utf-8-sig"))
        self.values = {}
        for node in self.tree.body:
            targets = node.targets if isinstance(node, ast.Assign) else (
                [node.target] if isinstance(node, ast.AnnAssign) else [])
            for target in targets:
                self._bind(target, node.value)

    def _bind(self, target, value):
        if isinstance(target, ast.Name):
            self.values[target.id] = value
        elif isinstance(target, (ast.Tuple, ast.List)) and isinstance(value, (ast.Tuple, ast.List)):
            for child, item in zip(target.elts, value.elts):
                self._bind(child, item)

    def resolve(self, node, seen=frozenset()):
        if isinstance(node, ast.Name):
            if node.id in seen or node.id not in self.values:
                raise ValueError("not a static constant")
            return self.resolve(self.values[node.id], seen | {node.id})
        if node is None:
            raise ValueError("missing constant")
        return node

    def literal(self, node):
        node = self.resolve(node)
        if isinstance(node, (ast.List, ast.Tuple, ast.Set)):
            return [self.literal(item) for item in node.elts]
        return ast.literal_eval(node)

    def get(self, key):
        return self.literal(self.values[key])

    def table(self, key):
        node = self.resolve(self.values[key])
        if not isinstance(node, ast.Dict) or any(k is None for k in node.keys):
            raise ValueError("not a literal table")
        return zip(node.keys, node.values)

    def name(self, node):
        node = self.resolve(node)
        if isinstance(node, (ast.Tuple, ast.List)):
            node = node.elts[0]
        value = self.literal(node)
        if not isinstance(value, str) or not value.strip():
            raise ValueError("missing model name")
        return value


def word(value):
    result = int(value, 16) if isinstance(value, str) else value
    if type(result) is not int or not 0 <= result <= 0xFFFF:
        raise ValueError("ID must be an unsigned 16-bit integer")
    return result


def build_index(root=None, *, engine_root=None):
    # An external snapshot must never inherit the running checkout's registry or
    # import its own Python modules. Only the local, audited helpers run here.
    external = engine_root is not None
    root = Path(engine_root).resolve().parent if external else (
        Path(root) if root else ENGINE.parent)
    engine = Path(engine_root).resolve() if external else root / "engine"
    catalog = json.loads((engine / "compatibility.json").read_text(encoding="utf-8-sig"))
    readers = {item["provider"]: item for item in catalog["readers"]}
    devices, vendors, unparsed, partial = set(), {}, set(), {}
    registered = [] if external else registered_ids()
    profiled = {}
    for profile in (() if external else profiles()):
        profiled.setdefault(profile.provider, set()).update(profile.vendor_ids)

    def add(provider, vid, pid, name, kind, source="builtin"):
        vid, pid = word(vid), word(pid)
        if not all(isinstance(s, str) and s.strip() for s in (provider, name, kind)):
            raise ValueError("missing device metadata")
        devices.add((provider, vid, pid, name, kind, source))
        vendors.setdefault(provider, set()).add(vid)

    for path in sorted((engine / "providers").glob("*.py")):
        module = path.stem
        if module in HELPERS or module.endswith("_profiles"):
            continue  # Helpers and protocol data are represented by their owner.
        if module in profiled:
            vendors[module] = set(profiled[module])
            for row in registered:
                if row[0] == module:
                    add(*row)
            continue
        vendors[module] = set()
        try:
            source = StaticSource(path)
            if external and module == "razer" and "KNOWN" not in source.values:
                # Newer snapshots moved these literal tables into a data module.
                # Parse that snapshot's tables too, without importing the module.
                profile_path = path.with_name("razer_profiles.py")
                if profile_path.is_file():
                    source = StaticSource(profile_path)
            for key in source.values:
                if key == "VID" or key.endswith(("_VID", "_VIDS")):
                    value = source.get(key)
                    vendors[module].update(word(v) for v in (value if isinstance(value, list) else [value]))
            kinds = readers.get(module, {}).get("kinds", [])
            default_kind = kinds[0] if len(kinds) == 1 else None
            keyboard_ids = ({word(source.literal(key)) for key, _ in source.table("KEYBOARD_INTERFACE")}
                            if module == "razer" and "KEYBOARD_INTERFACE" in source.values else set())
            for table in TABLES.get(module, ()):
                if module == "pulsar" and table == "NANO_PIDS" and table not in source.values:
                    continue  # Older external snapshots predate the BITMOUSE reader.
                # Each table has an explicit VID relation, not a cross product.
                if module in ("mchose_headset", "mchose_by_keyboard", "vgn_beiying"):
                    for key, value in source.table(table):
                        identity = source.literal(key)
                        # Older snapshots used one VID and integer PID keys.
                        vid, pid = identity if isinstance(identity, list) else (source.get("VID"), identity)
                        add(module, vid, pid, source.name(value), default_kind)
                    continue
                if module == "mchose":
                    vid = source.get("A5_VID")
                elif module != "pulsar":
                    if len(vendors[module]) != 1:
                        raise ValueError("ambiguous vendor")
                    vid = next(iter(vendors[module]))
                for key, value in source.table(table):
                    if module == "pulsar":
                        vid = word(source.literal(key))
                        vendors[module].add(vid)
                        value = source.resolve(value)
                        if not isinstance(value, ast.Dict):
                            raise ValueError("invalid nested device table")
                        for pid, name in zip(value.keys, value.values):
                            add(module, vid, source.literal(pid), source.name(name), "mouse")
                        continue
                    pid, name = word(source.literal(key)), source.name(value)
                    kind = default_kind
                    if module == "lamzu":
                        name = source.get("NAME")  # PIDS values describe transport.
                    elif module == "steelseries":
                        kind = "mouse" if table == "MOUSE_MODELS" else "headset"
                    elif module == "corsair":
                        kind = "mouse" if table == "BRAGI_PIDS" and pid == 0x1B7F else "headset"
                    elif module == "logitech":
                        kind = "headset"
                    elif module == "razer":
                        kind = ("keyboard" if pid in keyboard_ids or pid in (0x025A, 0x025C)
                                else "headset" if pid in (0x0528, 0x0555, 0x0556, 0x0557) else "mouse")
                    add(module, vid, pid, name, kind)
            if module in SINGLE:
                vid = next(iter(vendors[module]))
                name = (readers[module]["name"] if module == "barracuda" else source.get("NAME"))
                add(module, vid, source.get("PID"), name, default_kind)
            elif module == "gwolves":
                add(module, source.get("GWOLVES_VID"), source.get("RECEIVER"), source.get("DEFAULT_NAME"), "mouse")
            elif module == "logitech":
                for pid in source.get("RECEIVERS"):
                    add(module, source.get("LOGITECH_VID"), pid, "Logitech HID++ 接收器", "device")
                # Paired model names/kinds and other HID++ identities are dynamic.
                partial[module] = "已收录耳机和接收器固定 ID，其他 HID++ 设备及配对型号依赖运行时识别。"
            elif module == "mchose":
                add(module, source.get("G7_VID"), source.get("G7_PID"), "MCHOSE mouse", "mouse")
                if "A5V2_VID" in source.values and "A5V2_PID" in source.values:
                    add(module, source.get("A5V2_VID"), source.get("A5V2_PID"),
                        source.get("A5V2_NAME"), "mouse")
                if "V3_VID" in source.values and "V3_PIDS" in source.values:
                    for pid, name in source.table("V3_PIDS"):
                        add(module, source.get("V3_VID"), source.literal(pid), source.name(name), "mouse")
                elif "V3_VID" in source.values and "V3_PID" in source.values:
                    add(module, source.get("V3_VID"), source.get("V3_PID"),
                        "MCHOSE A7 V3 Pro (V3 8K 接收器)", "mouse")
                # MODEL_NAMES uses reply model codes, NOT USB product IDs.
                partial[module] = "已收录固定 ID，其他系列按厂商与 HID 集合动态识别，回复型号代码不是 USB 产品 ID。"
            elif module not in TABLES:
                unparsed.add(module)  # Includes runtime-only Bluetooth identities.
        except (KeyError, ValueError, TypeError, SyntaxError):
            if any(row[0] == module for row in devices):
                partial[module] = "已收录部分固定 ID，但其余定义无法静态解析。"
            else:
                unparsed.add(module)

    for profile in catalog["nativeProfiles"]:
        add(profile["provider"], profile["match"]["vendorId"], profile["match"]["productId"],
            profile["name"], profile["kind"])
    disabled = set()
    # source.json is the human-maintained publication input, not a signed
    # complete pack and must not enter the triage index.
    for path in sorted((root / "devices/pack").glob("*.json")):
        if path.name == "source.json":
            continue
        pack = load_pack(path)
        if pack.rejected:
            unparsed.add(path.relative_to(root).as_posix())
        for entry in pack.entries:
            # Already validated by the engine, including profile compatibility.
            devices.add((entry.provider, entry.match.vendor_id, entry.match.product_id,
                         entry.name, entry.kind, "pack"))
            vendors.setdefault(entry.provider, set()).add(entry.match.vendor_id)
        disabled.update((entry.provider, entry.vendor_id, entry.product_id) for entry in pack.disabled)
    # Disables win over every source, including legacy tables and other files.
    devices = {row for row in devices if row[:3] not in disabled}
    fields = ("provider", "vendorId", "productId", "name", "kind", "source")
    indexed = []
    for row in sorted(devices):
        entry = dict(zip(fields, row))
        # These are explicit identity limits in existing provider/catalog data,
        # not generic mentions of model lists or descriptor/collection gates.
        scope = readers.get(entry["provider"], {}).get("matchScope", "")
        if (entry["name"].casefold().endswith("(model identification required)")
                or "产品全名" in scope or "产品名" in scope
                or entry["provider"] in ("fa6x_passive", "asus_omni")):
            entry["requiresModelMatch"] = True
        indexed.append(entry)
    return {"vendors": {key: sorted(value) for key, value in sorted(vendors.items())},
            "devices": indexed,
            "unparsed": sorted(unparsed), "partial": dict(sorted(partial.items()))}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true", help="print the stable JSON index")
    parser.add_argument("--engine-root", type=Path,
                        help="statically read another snapshot's engine directory; never import it")
    args = parser.parse_args()
    # ASCII escapes also make redirected Windows output independent of its codepage.
    print(json.dumps(build_index(engine_root=args.engine_root), ensure_ascii=True, sort_keys=True, indent=2))


if __name__ == "__main__":
    main()

"""Offline, machine-readable verification evidence; no hardware/network IO."""
from __future__ import annotations

import argparse
from functools import lru_cache
import json
from pathlib import Path
import sys

START = "<!-- BEGIN GENERATED COMPATIBILITY CATALOG -->"
END = "<!-- END GENERATED COMPATIBILITY CATALOG -->"


def docs_path():
    return Path(__file__).parent.parent / "docs" / "compatibility.md"


@lru_cache(maxsize=1)
def load_catalog():
    data = json.loads(Path(__file__).with_name("compatibility.json").read_text(encoding="utf-8"))
    if data.get("schema") != 1:
        raise ValueError("unsupported compatibility schema")
    return data


def verification_for(provider):
    data = load_catalog()
    for entry in data["readers"] + data["nativeProfiles"]:
        if entry["provider"] == provider:
            level = entry["verificationLevel"]
            return level, data["levels"][level]
    return "E", data["levels"]["E"]


def validate_catalog():
    from server import PROVIDERS, NATIVE
    data = load_catalog()
    names = [entry["provider"] for entry in data["readers"]]
    expected = {name for name, _ in PROVIDERS} | {"standard_hid"}
    if len(names) != len(set(names)) or set(names) != expected:
        raise ValueError("catalog and selected readers differ")
    if {(int(p["match"]["vendorId"], 16), int(p["match"]["productId"], 16)) for p in data["nativeProfiles"]} != NATIVE:
        raise ValueError("native exclusion profiles differ")
    for entry in data["nativeProfiles"] + data["readers"] + data["observedUnsupported"]:
        if entry["verificationLevel"] not in data["levels"]:
            raise ValueError("invalid verification level")
    if any(entry.get("compatible") for entry in data["observedUnsupported"]):
        raise ValueError("observed-only device incorrectly declared compatible")
    target = docs_path()
    if target.is_file():
        with target.open("r", encoding="utf-8", newline="") as stream:
            text = stream.read()
        if START in text:
            if text.count(START) != 1 or text.count(END) != 1:
                raise ValueError("invalid generated compatibility markers")
            section = text[text.index(START):text.index(END) + len(END)].replace("\r\n", "\n")
            if section != markdown():
                raise ValueError("generated compatibility section differs; run --sync-docs")
    return {"schema": 1, "readerCount": len(names), "nativeProfileCount": len(data["nativeProfiles"]),
            "observedUnsupportedCount": len(data["observedUnsupported"]), "errors": []}


def markdown():
    data = load_catalog()
    lines = [START,
             "来源：`engine/compatibility.json`；由 `python engine/catalog.py --markdown` 离线生成。", "",
             "等级是证据范围，不是当前在线状态，也不是市场覆盖率。A为历史实机记录；本轮读数另行复验。", "",
             "| 项目 | 类型 | 等级 | 边界 |", "| --- | --- | --- | --- |"]
    for entry in data["nativeProfiles"]:
        match = entry["match"]
        boundary = "`" + match["vendorId"] + ":" + match["productId"] + "` / `" + match["usagePage"] + ":" + match["usage"] + "` / " + str(match["inputBytes"]) + "字节；固件版本未记录"
        lines.append("| " + entry["name"] + " | " + entry["kind"] + " | A | " + boundary + " |")
    for entry in data["readers"]:
        level = entry["verificationLevel"]
        lines.append("| " + entry["name"] + " | " + ", ".join(entry["kinds"]) + " | " + level + " | " + data["levels"][level] + "；" + entry.get("matchScope", "限代码内既有匹配表") + " |")
    for entry in data["observedUnsupported"]:
        lines.append("| " + entry["name"] + " | " + entry["kind"] + " | " + entry["verificationLevel"] + " | 已发现但未取得电量，不列为兼容 |")
    lines += ["", "通用读取器基础来源为 HaloBattery `" + data["upstream"]["commit"] + "`；标准HID字段及 MCHOSE V9 PRO / V9 Turbo+、G98 V3、G87 V2、G3M PRO、EWEADN S9、Flydigi APEX5 读取为本项目实现，协议来源与许可证见 engine/upstream-protocols.md。",
              END]
    return "\n".join(lines)


def sync_docs():
    """Mechanical generation limited to our marked section; retain manual text."""
    target = docs_path()
    with target.open("r", encoding="utf-8", newline="") as stream:
        text = stream.read()
    newline = "\r\n" if "\r\n" in text else "\n"
    generated = markdown().replace("\n", newline)
    if START in text or END in text:
        if text.count(START) != 1 or text.count(END) != 1 or text.index(END) < text.index(START):
            raise ValueError("refusing ambiguous generated documentation markers")
        text = text[:text.index(START)] + generated + text[text.index(END) + len(END):]
    else:
        text += ("" if text.endswith(newline) else newline) + newline + generated + newline
    with target.open("w", encoding="utf-8", newline="") as stream:
        stream.write(text)


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="Validate/print offline compatibility evidence")
    parser.add_argument("--validate", action="store_true")
    parser.add_argument("--markdown", action="store_true")
    parser.add_argument("--sync-docs", action="store_true")
    args = parser.parse_args()
    if args.sync_docs:
        sync_docs()
    result = validate_catalog()
    print(markdown() if args.markdown else json.dumps(result, ensure_ascii=True))


if __name__ == "__main__":
    main()

"""Turn the public feedback section into fake HID inventory, without invented caps.

Paths, grouping keys and interface -1 are test-only placeholders. The reports
contain neither interface numbers, manufacturer strings nor report lengths.
"""
from pathlib import Path
import re


FIXTURES = Path(__file__).parent / "fixtures" / "feedback"


def feedback_inventory(issue):
    body = (FIXTURES / f"issue{issue}-body.txt").read_text(encoding="utf-8")
    # Some reports append reader health in the same fenced block after a blank
    # line. Parse only the device section, never health rows or existing cards.
    section = body.split("未取得电量的设备\n", 1)[1].split("```", 1)[0].split("\n\n", 1)[0]
    inventory = []
    for row, line in enumerate(section.splitlines()):
        match = re.fullmatch(r'([0-9A-F]{4}):([0-9A-F]{4}) "(.*)" (.+)', line)
        if not match:
            raise ValueError(f"Unexpected feedback row: {line!r}")
        vid, pid, name, collections = match.groups()
        group = f"fixture-issue{issue}-row{row}"
        for col, usage in enumerate(collections.split()):
            page, usage_id = (int(part, 16) for part in usage.split(":"))
            inventory.append(dict(vendor_id=int(vid, 16), product_id=int(pid, 16),
                                  product_string=name, usage_page=page, usage=usage_id,
                                  interface_number=-1, physical_id=group,
                                  path=f"{group}-collection{col}".encode()))
    return inventory

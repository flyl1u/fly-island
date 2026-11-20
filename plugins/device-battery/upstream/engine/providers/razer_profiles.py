"""Razer builtin data and audited profiles, usable offline without hidapi."""
from .profiles import Builtin, Profile, register_builtin, register_profile, reserve_ids

RAZER_VID = 0x1532

# PID -> (name, preferred transaction id)
#
# The mice come from OpenRazer's razer_attr_read_charge_level() (driver/razermouse_driver.c,
# commit 6820f9da16): every PID there that is a wireless mouse, its receiver or the same
# mouse on its cable, with the transaction id OpenRazer uses for it. Left out on purpose:
# 0x00CB Basilisk V3 35K (a wired-only mouse) and 0x0095 Orochi V2 over Bluetooth
# (Windows' own Bluetooth battery value already covers it). tests/test_razer.py holds a
# copy of that OpenRazer list and checks this table against it.
# The Viper V3 Pro SE pair below additionally follows OpenRazer's mouse driver
# IDs and charge-level cases; see upstream-protocols.md for the source facts.
KNOWN = {
    0x0528: ("Razer BlackShark V2 Pro (2020)", 0x3F),
    0x0555: ("Razer BlackShark V2 Pro (2023)", 0x3F),
    0x0556: ("Razer BlackShark V2 Pro (2023)", 0x3F),
    0x0557: ("Razer BlackShark V2 Pro (2023)", 0x3F),
    0x00A4: ("Razer Mouse Dock Pro", 0x1F),
    # ---- keyboards with a battery, from OpenRazer's keyboard driver (razerkbd_driver.c:
    # razer_attr_read_charge_level). The wireless id is the HyperSpeed receiver, the
    # wired id the keyboard on its cable (charging).
    0x0290: ("Razer DeathStalker V2 Pro", 0x9F),
    0x0292: ("Razer DeathStalker V2 Pro", 0x1F),
    0x0296: ("Razer DeathStalker V2 Pro TKL", 0x9F),
    0x0298: ("Razer DeathStalker V2 Pro TKL", 0x1F),
    0x0271: ("Razer BlackWidow V3 Mini HyperSpeed", 0x9F),
    0x0258: ("Razer BlackWidow V3 Mini HyperSpeed", 0x1F),
    0x02BA: ("Razer BlackWidow V4 Mini HyperSpeed", 0x9F),
    0x02B9: ("Razer BlackWidow V4 Mini HyperSpeed", 0x1F),
    0x02D5: ("Razer BlackWidow V4 Tenkeyless HyperSpeed", 0x9F),
    0x02D7: ("Razer BlackWidow V4 Tenkeyless HyperSpeed", 0x1F),
    # ---- mice, from OpenRazer (wired / wireless PIDs of one mouse share a name)
    0x001F: ("Razer Naga Epic", 0xFF),
    0x0024: ("Razer Mamba (2012)", 0xFF),
    0x0025: ("Razer Mamba (2012)", 0xFF),
    0x0032: ("Razer Ouroboros", 0xFF),
    0x003E: ("Razer Naga Epic Chroma", 0xFF),
    0x003F: ("Razer Naga Epic Chroma", 0xFF),      # its dock
    0x0044: ("Razer Mamba", 0xFF),
    0x0045: ("Razer Mamba", 0xFF),
    0x0059: ("Razer Lancehead", 0x3F),
    0x005A: ("Razer Lancehead", 0x3F),
    0x0062: ("Razer Atheris", 0x1F),
    0x006F: ("Razer Lancehead Wireless", 0x1F),
    0x0070: ("Razer Lancehead Wireless", 0x1F),
    0x0072: ("Razer Mamba Wireless", 0x3F),
    0x0073: ("Razer Mamba Wireless", 0x3F),
    0x0077: ("Razer Pro Click", 0x1F),
    0x0080: ("Razer Pro Click", 0x1F),
    0x007A: ("Razer Viper Ultimate", 0xFF),
    0x007B: ("Razer Viper Ultimate", 0xFF),
    0x007C: ("Razer DeathAdder V2 Pro", 0x3F),
    0x007D: ("Razer DeathAdder V2 Pro", 0x3F),
    0x0083: ("Razer Basilisk X HyperSpeed", 0xFF),
    0x0086: ("Razer Basilisk Ultimate", 0x1F),
    0x0088: ("Razer Basilisk Ultimate", 0x1F),
    0x008F: ("Razer Naga Pro", 0x1F),
    0x0090: ("Razer Naga Pro", 0x1F),
    0x0094: ("Razer Orochi V2", 0x1F),
    0x009A: ("Razer Pro Click Mini", 0x1F),
    0x009C: ("Razer DeathAdder V2 X HyperSpeed", 0x1F),
    0x009E: ("Razer Viper Mini SE", 0x1F),
    0x009F: ("Razer Viper Mini SE", 0x1F),
    0x00A5: ("Razer Viper V2 Pro", 0x1F),
    0x00A6: ("Razer Viper V2 Pro", 0x1F),
    0x00A7: ("Razer Naga V2 Pro", 0x1F),
    0x00A8: ("Razer Naga V2 Pro", 0x1F),
    0x00AA: ("Razer Basilisk V3 Pro", 0x1F),
    0x00AB: ("Razer Basilisk V3 Pro", 0x1F),
    0x00AF: ("Razer Cobra Pro", 0x1F),
    0x00B0: ("Razer Cobra Pro", 0x1F),
    0x00B3: ("Razer HyperPolling Dongle", 0x1F),
    0x00B4: ("Razer Naga V2 HyperSpeed", 0x1F),
    0x00B6: ("Razer DeathAdder V3 Pro", 0x1F),
    0x00B7: ("Razer DeathAdder V3 Pro", 0x1F),
    0x00B8: ("Razer Viper V3 HyperSpeed", 0x1F),
    0x00B9: ("Razer Basilisk V3 X HyperSpeed", 0x1F),
    0x00BE: ("Razer DeathAdder V4 Pro", 0x1F),
    0x00BF: ("Razer DeathAdder V4 Pro", 0x1F),
    0x00C0: ("Razer Viper V3 Pro", 0x1F),
    0x00C1: ("Razer Viper V3 Pro", 0x1F),
    0x00C2: ("Razer DeathAdder V3 Pro", 0x1F),
    0x00C3: ("Razer DeathAdder V3 Pro", 0x1F),
    0x00C4: ("Razer DeathAdder V3 HyperSpeed", 0x1F),
    0x00C5: ("Razer DeathAdder V3 HyperSpeed", 0x1F),
    0x00C7: ("Razer Pro Click V2 Vertical Edition", 0x1F),
    0x00C8: ("Razer Pro Click V2 Vertical Edition", 0x1F),
    0x00CC: ("Razer Basilisk V3 Pro 35K", 0x1F),
    0x00CD: ("Razer Basilisk V3 Pro 35K", 0x1F),
    0x00D0: ("Razer Pro Click V2", 0x1F),
    0x00D1: ("Razer Pro Click V2", 0x1F),
    0x00D3: ("Razer Basilisk Mobile", 0x1F),
    0x00D4: ("Razer Basilisk Mobile", 0x1F),
    0x00D6: ("Razer Basilisk V3 Pro 35K Phantom Green", 0x1F),
    0x00D7: ("Razer Basilisk V3 Pro 35K Phantom Green", 0x1F),
    0x00DE: ("Razer Viper V3 Pro SE", 0x1F),
    0x00DF: ("Razer Viper V3 Pro SE", 0x1F),

    # Keyboards with a battery. OpenRazer's RazerBlackWidowV3ProWired (0x025A) lists
    # get_battery/is_charging, and the wireless model (0x025C) inherits that class.
    # razer_attr_read_charge_level() reads both with razer_chroma_misc_get_battery_level()
    # - the same 0x07:0x80 / 0x07:0x84 commands this provider already sends - and sets
    # the transaction id to 0x9f for the wireless keyboards of this generation and 0x3f
    # for their wired twins. 0x3f is not a value this keyboard answers on: the wired id
    # goes only to 0x025A.
    0x025A: ("Razer BlackWidow V3 Pro", 0x3F),
    0x025C: ("Razer BlackWidow V3 Pro", 0x9F),
}

# The keyboards above take the commands on one USB interface: OpenRazer sends them with
# wIndex = report_index to the interface (USB_RECIP_INTERFACE), in
# razer_get_report_params(). That interface is asked first; the others stay a fallback.
KEYBOARD_INTERFACE = {
    0x0290: 2, 0x0296: 2, 0x02D5: 2,
    0x0292: 3, 0x0298: 3, 0x02D7: 3,
    0x0271: 3, 0x0258: 3, 0x02BA: 3, 0x02B9: 3,
}


# Preserve the historical tables exactly; their PID-specific special readers
# remain in razer.py. New pack rows use only the feature-report battery reader.
MATCH_FIELDS = frozenset(("vendorId", "productId", "interfaceNumber", "usagePage", "usage"))
PROFILE_NAMES = {
    ("mouse", 0x1F): "hyperspeed-mouse-1f",
    ("mouse", 0x3F): "hyperspeed-mouse-3f",
    ("mouse", 0xFF): "hyperspeed-mouse-ff",
    ("headset", 0x3F): "headset-3f",
    ("keyboard", 0x1F): "keyboard-1f",
    ("keyboard", 0x3F): "keyboard-3f",
    ("keyboard", 0x9F): "keyboard-9f",
}

for (_kind, _tid), _name in PROFILE_NAMES.items():
    register_profile(Profile("razer", _name, 1, _kind, (RAZER_VID,),
                             MATCH_FIELDS, (("transaction_id", _tid),)))

for _pid, (_name, _tid) in KNOWN.items():
    _kind = ("keyboard" if _pid in KEYBOARD_INTERFACE or _pid in (0x025A, 0x025C)
             else "headset" if _pid in (0x0528, 0x0555, 0x0556, 0x0557) else "mouse")
    register_builtin(Builtin("razer", RAZER_VID, _pid, _name, _kind, PROFILE_NAMES[_kind, _tid]))

# Barracuda's own PA reader, the 2020 charging cable, and intentional exclusions
# (Bluetooth Orochi / wired-only Basilisk) must not become generic pack targets.
reserve_ids((RAZER_VID, pid) for pid in (0x053A, 0x052E, 0x0095, 0x00CB))

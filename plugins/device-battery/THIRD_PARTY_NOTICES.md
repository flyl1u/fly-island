# Third-party components

The whole package is distributed under [AGPL-3.0-only](LICENSE). Each third-party component keeps its own license.

## MyFinder Device Battery

[wushuai0802/myfinder-device-battery](https://github.com/wushuai0802/myfinder-device-battery/tree/73d99e2087dd70ae8eef4199854e0c495a66f0bc), commit `73d99e2087dd70ae8eef4199854e0c495a66f0bc`, AGPL-3.0-only, copyright 2026 wushuai0802.

- `engine/runtime/python.exe` is the Fly Island device battery engine: a Rust rewrite (2026-11) of the Python reader engine under `engine/` at that commit. It is a modified version of that work and stays under AGPL-3.0-only. Despite its file name it contains no Python; the name is the path the Fly Island host starts. Its source is in [plugins/device-battery/engine](https://github.com/flyl1u/fly-island/tree/main/plugins/device-battery/engine) of the Fly Island repository.
- `device-battery-bridge.exe` is compiled from Fly Island's `Bridge.cs` and `AudioSettings.cs` together with the unmodified upstream files `scripts/AudioControl.cs`, `scripts/HidBattery.cs` and `scripts/HeadsetBattery.cs`.

The upstream application, installer, updater, input hooks, controller mode switches, user settings, Python sources and Python runtime are not included.

## HaloBattery

Most of the upstream readers, and therefore the matching Rust modules, are adapted from [HeyOkay/HaloBattery](https://github.com/HeyOkay/HaloBattery), commit `2251f0534a8e886c9692ead42056059b4f69d8c0` (MIT). Its copyright and permission notice is in `licenses/HaloBattery-MIT.txt`. The adapted portions keep that notice; the AGPL license does not replace it.

## Protocol references

The following readers were written upstream from protocol facts, without copying the referenced implementations. The upstream [notices](https://github.com/wushuai0802/myfinder-device-battery/blob/73d99e2087dd70ae8eef4199854e0c495a66f0bc/THIRD_PARTY_NOTICES.md), [protocol sources](https://github.com/wushuai0802/myfinder-device-battery/blob/73d99e2087dd70ae8eef4199854e0c495a66f0bc/engine/upstream-protocols.md) and [credits](https://github.com/wushuai0802/myfinder-device-battery/blob/73d99e2087dd70ae8eef4199854e0c495a66f0bc/engine/upstream-credits.md) record the evidence and its limits.

- CHERRY: facts from [zcmk123/cherry-battery-state](https://github.com/zcmk123/cherry-battery-state/tree/af82d4d98cbad872a586302ba44e6a6b75ba65f4), commit `af82d4d98cbad872a586302ba44e6a6b75ba65f4`. That commit declares MIT in its README and has no standalone license file; no complete license text has been verified.
- Lingbao M1 Pro: user-contributed frames in upstream issues #171 and #95.
- ZhuAudio ZG4: facts from the vendor's Z HUB web client, read as text and not copied or distributed, and the descriptor in upstream issue #459.
- ROG OMNI receiver (mouse only): facts recorded upstream with reference to [seerge/g-helper](https://github.com/seerge/g-helper/tree/0bda6b55317f67c0ad68f3b5366a0e12a9096c53) (GPL-3.0). No G-Helper code is copied.

A protocol implementation or a listed USB ID does not by itself establish hardware validation.

## Rust crates

The engine links [hidapi](https://github.com/ruabmbua/hidapi-rs) (MIT, Windows native backend; the C hidapi library is not used), `serde_json`, `sha2`, the `windows` crates and their dependencies. Their copyright and permission notices are collected in `licenses/rust-crates.txt`; where a crate offers a choice of licenses, this distribution uses MIT.

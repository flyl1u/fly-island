# Third-party components

Original project code is licensed under [AGPL-3.0-only](LICENSE),
copyright 2026 wushuai0802. Each third-party component retains its own license.
Versions 1.3.4 and earlier were released under MIT; the change applies from
the next release and does not relicense those published versions.

The battery-query modules under `engine/providers` are adapted from
[HeyOkay/HaloBattery](https://github.com/HeyOkay/HaloBattery), commit
`2251f0534a8e886c9692ead42056059b4f69d8c0` (MIT).
Its copyright and permission notice is preserved in
`engine/licenses/HaloBattery-MIT.txt`. The adapted HaloBattery portions retain
that MIT notice; the project's AGPL license does not replace the upstream license.

The upstream application, installer, updater, input hooks, controller mode
switches and user settings are not included. Provider imports are lazy; the
native ATK and HyperX adapters retain ownership of their existing device IDs.
Local changes include marking voltage-derived Logitech levels as estimates,
preserving source timestamps and measurement quality, isolating reader calls
and physical receivers, and binding child process lifetimes to their parent.

Upstream protocol references and model verification notes are retained in
`engine/upstream-protocols.md`, `engine/upstream-devices.md` and
`engine/upstream-credits.md`. A protocol implementation or a listed USB ID does
not by itself establish hardware validation.

The CHERRY battery-only provider is an independent project implementation.
Protocol facts reference [zcmk123/cherry-battery-state](https://github.com/zcmk123/cherry-battery-state/tree/af82d4d98cbad872a586302ba44e6a6b75ba65f4),
commit `af82d4d98cbad872a586302ba44e6a6b75ba65f4`, and contributor
[#482](https://github.com/wushuai0802/myfinder-device-battery/issues/482). No upstream
application code is copied for this adaptation. The supervisor's GitHub
contents check found an MIT License declaration in that commit's README but
no standalone root LICENSE file. This declaration is not verification of the
complete copyright and permission text. The reference does not assert that
an upstream license-text review or maintainer hardware acceptance has passed.

The Lingbao M1 Pro battery-only provider is an independent project implementation
based on user-contributed protocol frames and observations in this repository's
[#171](https://github.com/wushuai0802/myfinder-device-battery/issues/171), with related
request [#95](https://github.com/wushuai0802/myfinder-device-battery/issues/95).
No vendor application implementation is copied, and these issue references do
not originate from HaloBattery. Contributor evidence remains grade C pending
maintainer hardware acceptance; complete raw frames and synthetic table-based
test variants are distinguished in `docs/lingbao-m1pro.md`.

The ZG4 battery-only provider is an independent project implementation based
on protocol facts in ZhuAudio's official [Z HUB](https://drive.zhuaudio.cn/web/)
`main.dart.js`, SHA256
`04bee7a730669e758dd3e01df12e1823c18f262b2be4df43879595b6413bab3d`,
and the sanitized raw descriptor supplied in
[#459](https://github.com/wushuai0802/myfinder-device-battery/issues/459#issuecomment-6745518125).
The vendor JavaScript is read as inert text, not executed, copied into the
provider or distributed with it. No vendor license review or hardware
acceptance is asserted. Exact evidence and limitations: `docs/zhuaudio-zg4.md`.

The ROG OMNI mouse-only battery candidate is an independent project implementation
from protocol facts recorded in `docs/rog-omni-ghelper.md`, referencing
[seerge/g-helper](https://github.com/seerge/g-helper/tree/0bda6b55317f67c0ad68f3b5366a0e12a9096c53),
commit `0bda6b55317f67c0ad68f3b5366a0e12a9096c53` (GPL-3.0).
No G-Helper implementation is copied or bundled with this candidate. Only the
mouse battery exchange is used; pairing-table, Booster and keyboard commands
are excluded. Grade C, pending hardware validation; the reference does not
establish the underlying transport or cold-start independent-query behavior.

The Windows distribution bundles the official CPython embeddable runtime and
the `hidapi` Python wheel, with their original license files. Versions, original
download URLs and SHA256 hashes are pinned in `engine/dependencies.lock.json`.
No runtime download or package installation is performed on end-user PCs.

Bundled-license review for this change: CPython 3.14.8 uses PSF License v2
and preserves its bundled third-party notices in `engine/runtime/LICENSE.txt`
(including permissive BSD/MIT-style terms and Apache-2.0). Its Windows
Microsoft runtime conditions apply to Microsoft's code, not to Python scripts.
The hidapi 0.15.0 wheel offers alternative licenses; this distribution uses
its BSD-style option in
`engine/runtime/hidapi-0.15.0.dist-info/licenses/LICENSE-bsd.txt` and retains
all of its license files. These terms permit distribution alongside this
AGPL-3.0-only application; no incompatible component was identified in this
bundled-license review. No upstream license text has been changed.

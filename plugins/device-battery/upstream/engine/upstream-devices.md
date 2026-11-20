# Supported devices

[Back to the README](../README.md). How a device is read, and the source of each protocol, is in [protocols.md](protocols.md).

**`yes`** means the level has actually been seen on the device - here, from a report, or from a user who tried it. **`no`** means the support was written from another tool's code and nobody has tried it on real hardware yet. **`likely`** means other models of the same family share the code, so they should work too - they just haven't been tried one at a time. Each device links to [notes on how its level is read](protocols.md).

| Device | Connection | Verified on hardware |
|---|---|---|
| [8BitDo Pro 2, Pro 3, SN30 Pro, SF30 Pro in D-input mode](protocols.md#8bitdo-pro-2-pro-3-sn30-pro-sf30-pro-in-d-input-mode) | Bluetooth or USB | Pro 3 over Bluetooth |
| [AM Infinity 8K (Angry Miao)](protocols.md#am-infinity-8k-angry-miao) | 2.4 GHz receiver | no |
| [Astro A50 Gen 5 (Logitech 046D:0B1C)](protocols.md#astro-a50-gen-5-logitech-046d0b1c) | Base station | no |
| [ASUS ROG Gladius III Aimpoint and other ROG / TUF wireless mice (list in `providers/asus.py`)](protocols.md#asus-rog-gladius-iii-aimpoint-and-other-rog--tuf-wireless-mice) | 2.4 GHz receiver or USB cable | no |
| [Audeze Maxwell](protocols.md#audeze-maxwell) | 2.4 GHz dongle or USB-C cable | yes |
| [Bluetooth devices, tested on the 1MORE SonoFlow headset (users also report Audio-Technica and JBL Tune 760NC headphones working)](protocols.md#bluetooth-devices-tested-on-the-1more-sonoflow-headset) | Bluetooth (on by default, can be turned off in the menu) | yes |
| [Corsair Dark Core RGB Pro SE](protocols.md#corsair-dark-core-rgb-pro-se) | 2.4 GHz dongle | yes |
| [Corsair Virtuoso RGB Wireless SE / XT](protocols.md#corsair-virtuoso-rgb-wireless-se--xt) | Slipstream receiver or USB cable | yes for the SE on the Multi-Device receiver; XT untried |
| [Corsair Void v2 Wireless, Virtuoso Max Wireless, HS80 Max Wireless](protocols.md#corsair-void-v2-wireless-virtuoso-max-wireless-hs80-max-wireless) | Wireless receiver | no |
| [G-Wolves HSK Pro ACE and the other models with a receiver of their own](protocols.md#g-wolves-hsk-pro-ace-and-the-other-models-with-a-receiver-of-their-own) | The model's own receiver or USB cable | no |
| [G-Wolves WARG, HTS Plus (Pro), HTXU, Lycan, Fenrir Pro / Asym, HTX Mini](protocols.md#g-wolves-warg-hts-plus-pro-htxu-lycan-fenrir-pro--asym-htx-mini) | 8K receiver or USB cable | no |
| [GameSir G7 Pro; FlyDigi Vader Pro (tested by users)](protocols.md#gamesir-g7-pro-flydigi-vader-pro) | 2.4 GHz receiver (shows up as an Xbox controller) | yes |
| [Hitscan Hyperlight](protocols.md#hitscan-hyperlight) | 2.4 GHz receiver or USB cable | no |
| [HyperX Cloud Alpha 2](protocols.md#hyperx-cloud-alpha-2) | 2.4 GHz station | yes |
| [HyperX Cloud II Core Wireless](protocols.md#hyperx-cloud-ii-core-wireless) | 2.4 GHz dongle or USB cable | yes |
| [HyperX Cloud II Wireless](protocols.md#hyperx-cloud-ii-wireless) | 2.4 GHz dongle | no |
| [HyperX Cloud III S Wireless](protocols.md#hyperx-cloud-iii-s-wireless) | 2.4 GHz dongle | yes |
| [HyperX Cloud III Wireless](protocols.md#hyperx-cloud-iii-wireless) | 2.4 GHz dongle | no |
| [JBL Quantum 910 Wireless](protocols.md#jbl-quantum-910-wireless) | 2.4 GHz dongle | yes |
| [Keychron Ultra-Link 8K, Keychron M5](protocols.md#keychron-ultra-link-8k-keychron-m5) | 2.4 GHz receiver and USB cable | no |
| [LAMZU Maya X](protocols.md#lamzu-maya-x) | 8K dongle or USB cable | yes |
| [Lofree Hyzen](protocols.md#lofree-hyzen) | 2.4 GHz dongle | no |
| [Logitech (more HID++ 2.0 devices, older HID++ 1.0 keyboards and mice, G-series headsets)](protocols.md#logitech-more-hid-20-devices-and-g-series-headsets) | Lightspeed, Unifying or Bolt receiver | likely |
| [Logitech G PRO X 2 LIGHTSPEED](protocols.md#logitech-g-pro-x-2-lightspeed) | 2.4 GHz receiver | yes |
| [Logitech G502 LIGHTSPEED, G502 X PLUS](protocols.md#logitech-g502-lightspeed-g502-x-plus) | Lightspeed receiver | yes |
| [MCHOSE A5 Pro Max](protocols.md#mchose-a5-pro-max) | 2.4 GHz receiver or USB cable | yes |
| [MCHOSE A7 V2 Ultra](protocols.md#mchose-a7-v2-ultra) | 2.4 GHz receiver | no |
| [MCHOSE G7](protocols.md#mchose-g7) | USB (chip 'YJX-CHIP') | yes |
| [MCHOSE M7 Ultra](protocols.md#mchose-m7-ultra) | 2.4 GHz receiver | yes |
| [Nintendo Switch Pro Controller, Joy-Con (L) / (R)](protocols.md#nintendo-switch-pro-controller-joy-con-l--r) | Bluetooth | no |
| [NZXT Lift Elite Wireless](protocols.md#nzxt-lift-elite-wireless-1e712101) | 2.4 GHz receiver and USB cable | yes |
| [Pulsar X2 V2 Mini, Pulsar X2 CrazyLight Mini, ATK VXE R1 SE+, VXE R1 Pro Max](protocols.md#pulsar-x2-v2-mini-pulsar-x2-crazylight-mini-atk-vxe-r1-se-vxe-r1-pro-max) | 2.4 GHz dongle and USB cable | yes |
| [Razer Barracuda Pro (2.4 GHz)](protocols.md#razer-barracuda-pro-24-ghz) | 2.4 GHz dongle | yes |
| [Razer Basilisk V3 Pro, Razer Basilisk Ultimate (tested by users)](protocols.md#razer-basilisk-v3-pro-razer-basilisk-ultimate) | 2.4 GHz receiver | yes |
| [Razer BlackShark V2 Pro (2020)](protocols.md#razer-blackshark-v2-pro-2020) | 2.4 GHz receiver | yes |
| [Razer BlackShark V2 Pro (2023)](protocols.md#razer-blackshark-v2-pro-2023) | 2.4 GHz receiver | yes |
| [Razer BlackWidow V3 Pro](protocols.md#razer-blackwidow-v3-pro) | 2.4 GHz receiver or USB cable | no |
| [Razer DeathAdder V4 Pro](protocols.md#razer-deathadder-v4-pro) | 2.4 GHz receiver | yes |
| [Razer DeathStalker V2 Pro TKL](protocols.md#razer-deathstalker-v2-pro-tkl) | HyperSpeed receiver or USB cable | yes |
| [Razer DeathStalker V2 Pro, BlackWidow V3 Mini, V4 Mini and V4 Tenkeyless HyperSpeed](protocols.md#razer-deathstalker-v2-pro-blackwidow-v3-mini-v4-mini-and-v4-tenkeyless-hyperspeed) | HyperSpeed receiver or USB cable | no |
| [Razer wireless mice (other OpenRazer models)](protocols.md#razer-wireless-mice-other-openrazer-models) | 2.4 GHz receiver or USB cable | likely |
| [Sony DualSense (PS5)](protocols.md#sony-dualsense-ps5) | USB or Bluetooth | yes |
| [Sony DualShock 4 (PS4)](protocols.md#sony-dualshock-4-ps4) | USB cable and Bluetooth | yes |
| [Steam Controller (2025) with its puck](protocols.md#steam-controller-2025-with-its-puck) | 2.4 GHz puck | yes |
| [SteelSeries Aerox 3 Wireless](protocols.md#steelseries-aerox-3-wireless) | 2.4 GHz dongle | no |
| [SteelSeries Arctis and GameBuds (other models)](protocols.md#steelseries-arctis-and-gamebuds-other-models) | wireless base station or dongle | likely |
| [SteelSeries Arctis Nova 7](protocols.md#steelseries-arctis-nova-7) | 2.4 GHz dongle | yes |
| [SteelSeries Arctis Nova Elite](protocols.md#steelseries-arctis-nova-elite) | Wireless base station | yes |
| [SteelSeries Arctis Nova Pro Wireless (`1038:12E0`, `1038:12E5` X)](protocols.md#steelseries-arctis-nova-pro-wireless-103812e0-103812e5-x) | Wireless base station, interface 3 or 4 | no |
| [SteelSeries Rival 3 Wireless](protocols.md#steelseries-rival-3-wireless) | 2.4 GHz dongle | no |
| [WLmouse Beast X and Beast X Mini Pro](protocols.md#wlmouse-beast-x-and-beast-x-mini-pro) | 8K or 1K receiver, or USB cable | likely |
| [WLmouse Beast X Max](protocols.md#wlmouse-beast-x-max) | 8K receiver and USB cable | yes |
| [Xbox-compatible controllers (other models)](protocols.md#xbox-compatible-controllers-other-models) | USB or the Xbox wireless adapter | likely |

**PlayStation controllers over Bluetooth:** a DualShock 4 or DualSense sends its battery level over Bluetooth only in its "full report" mode. Switching a controller into that mode makes it invisible to games that use DirectInput until it is turned off and on again (#96), so the app does not switch it: the level shows while Steam or a game has already put the controller in that mode, and otherwise the icon shows the controller without a level. If you do not play such games, turn on **Preferences > PlayStation full mode (Bluetooth)** to always see the level. Over USB the level is always shown.

**8BitDo controllers in D-input mode:** the battery level is only in the controller's enhanced report. Switching the controller into that mode makes it invisible to DirectInput games until it is turned off and on (tested by the reporter of #101), so the app never switches it: the level shows while Steam or a game has already put the controller in that mode, and otherwise the icon shows the controller without a level. The Pro 3 needs no switch: it always sends its level. In XInput mode the level is always shown.

The devices marked `likely` are the same code paths with other models: the rest of the Razer list
OpenRazer reads, the other WLmouse models, more Logitech HID++ 2.0 devices and G-series headsets,
the other Arctis Nova and older Arctis models, and other Xbox-compatible controllers.

Is your device not in the table, or does it show a wrong level? See [Add your device](../README.md#add-your-device).

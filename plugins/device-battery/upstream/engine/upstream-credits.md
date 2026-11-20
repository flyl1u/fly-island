# Credits

[← Back to the README](../README.md)

Halo Battery reads each device the way its maker's software does. These projects and people worked out the protocols:

- WLmouse protocol: @len0c ([incconutwo/mouse-battery-tray](https://github.com/incconutwo/mouse-battery-tray), MIT).
- MCHOSE protocol: the write-up by @alexfrih ([alexfrih/mchose-linux](https://github.com/alexfrih/mchose-linux), recovered from MCHOSE's own web driver); the G7 from @kek353's monitor and the dump in [#8](https://github.com/HeyOkay/HaloBattery/issues/8).
- Hitscan Hyperlight protocol: @sopparus ([sopparus/hitscan-battery](https://github.com/sopparus/hitscan-battery)), who mapped it from the vendor application's USB traffic and confirmed it in the [libratbag discussion](https://github.com/libratbag/libratbag/issues/1893).
- AM Infinity 8K protocol: the AJAZZ Control Center project ([Aiacos/ajazz-control-center](https://github.com/Aiacos/ajazz-control-center), GPL-3.0), which reads the same USB id on its own AJ159 APEX unit.
- BlackShark V2 Pro 2023: the OpenRazer driver ([PR #2862](https://github.com/openrazer/openrazer/pull/2862)). Razer PIDs and transaction ids: OpenRazer and [RazerBatteryTaskbar](https://github.com/Tekk-Know/RazerBatteryTaskbar).
- MCHOSE A5 Pro Max protocol: the community web driver [z750sasr/mchose-a5-pro-max-web-driver](https://github.com/z750sasr/mchose-a5-pro-max-web-driver) (MIT), whose transport the independent [Klegus/mchose-macos](https://github.com/Klegus/mchose-macos) table agrees with; confirmed on @Pekish992's mouse ([#149](https://github.com/HeyOkay/HaloBattery/issues/149)).
- HyperX Cloud II Core Wireless protocol: @dantifrice ([#155](https://github.com/HeyOkay/HaloBattery/issues/155)), whose USBPcap capture of NGENUITY showed the same `66 89` battery / `66 8a` charging exchange as the Cloud III Wireless.
- The reference implementations behind individual devices - HeadsetControl, rivalcfg, Solaar, G-Helper, HyperHeadset, mouse.xyz, [`@openmouse/protocol`](https://github.com/OpenMouse-Project/openmouse), keychron-battery-dkms, JBL_Baterry_Monitor and others - are credited next to the device they were used for in [docs/protocols.md](protocols.md).

The BlackShark V2 Pro 2020 battery request is documented in [OpenRazer issue #1280](https://github.com/openrazer/openrazer/issues/1280) and [Modzeleczek/RazerNariBatteryLevel](https://github.com/Modzeleczek/RazerNariBatteryLevel).

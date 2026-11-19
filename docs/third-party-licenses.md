# Third-party licenses

## xiaotang-daozai office messenger windows

The DingTalk / Feishu / WeCom main-window rules and wake routes in `src-tauri/src/office_im/client.rs` (including the Feishu tray relaunch) are adapted from [Renly1994/xiaotang-daozai](https://github.com/Renly1994/xiaotang-daozai), `src/messenger/desktop.rs` and `src/messenger/windows.rs`, under the MIT License below. The DingTalk, Feishu and WeCom tile icons are taken from the same project's `assets/calendar/`.

## xiaotang-daozai OTP detection

The weighted verification-code detector in `src-tauri/src/mail/otp.rs` and its regression tests are adapted from [Renly1994/xiaotang-daozai](https://github.com/Renly1994/xiaotang-daozai), `src/otp.rs`. The reference credits pulse-mail (MIT) for keyword and shape scoring rules. Only the algorithm is reused.

The same MIT notice also covers these adapted algorithms (no source UI is reused):

- `src-tauri/src/lyrics/{qqmusic,kugou_cache,soda_cache,soda_lmdb,soda_msgpack}.rs`: QQ lyric protocol and read-only music-cache parsing, from the reference's `lyrics.rs`, `kugou_cache.rs` and `soda_cache.rs`.
- `plugins/doubao/src/main.rs`: quota parsing and private-browser login, from `doubao_quota.rs` and `doubao_login.rs`.
- `plugins/grok-bot/src/main.rs`, `plugins/zcode/src/main.rs`: local credential formats, request checksum and quota parsing, from `grok_quota.rs` and `zcode_quota.rs`.
- `plugins/gemini/src/main.rs`, `plugins/sdk/src/lib.rs`: quota response and local credential / DPAPI format references, from `gemini_quota.rs` and `native_auth.rs`.
- `plugins/office-im/src/main.rs`: window identification and shell notification algorithms, from `messenger/desktop.rs`.

插件包附带本声明；所有界面仍由宿主组件实现。Plugin archives include this notice; all UI remains implemented by host components.

```text
MIT License

Copyright (c) 2026 小唐的Token and Daozai contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

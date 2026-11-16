# 原生歌词源与逐字歌词

`get_lyrics` 继续返回增强 LRC（`[mm:ss.xx]<mm:ss.xx>字<mm:ss.xx>`），翻译单独返回 LRC。不新增命令，不改原来的歌曲校准或 SMTC 进度路径。

- 用户指定的本地 LRC 最优先；开启中文来源时，仅为当前酷狗 / 汽水会话尝试客户端本机缓存，然后才读岛屿的在线缓存与在线来源。关闭在线查找后仍可只读这两种原生缓存；关闭中文来源则不读。
- QQ 的 `QQ-` 标识既可能是数字 songid，也可能是 songmid。数字先经歌曲详情解析 mid；缺失 / 无效时按歌名、完整歌手集合和时长搜索。QQ ID 或 QQMusic AUMID 优先 QQ。先请求 `GetPlayLyricInfo` 的 QRC，失败后用带 Referer 的 web LRC。搜索保留版本信息，不混用 Live / 翻唱。
- 酷狗只读 `%APPDATA%/KuGou8/KuGou.ini` 的 UTF-8 / UTF-16 `LyricPath`，再尝试 `%SystemDrive%/KuGou/Lyric`。完整文件名匹配后，校验 `[ti]` / `[ar]` / `[total]`，应用 `[offset]`，复用 KRC 解密。配置限 64 KiB，KRC 限 2 MiB，解压正文限 1 MiB。无法确定身份时继续原有在线来源。
- 汽水只读 `%APPDATA%/SodaMusic/LunaCacheV2/entries.db`，不调用 LMDB 写入 API、不创建锁文件。复制不超过 32 MiB 的快照，再次读取两个元页核对并发提交；仅遍历最新已提交主库的 branch / leaf / overflow 页，拒绝循环和越界。MessagePack 支持 msgpackr 的 inline record 扩展；仅取匹配元数据的 `info.mediaDetail.lyrics`，支持明文 KRC 与 LRC。不读登录配置或音频。布局改变 / 缓存缺失 / 并发提交时放弃本次读取，照常在线按歌名查找。
- 网易取得歌曲 ID（播放器提供或搜索）后先查 `/api/song/lyric/v1`，解析 YRC 的绝对逐字时间与 `ytlrc`；失败继续原有 `/api/song/lyric`。开启逐字填充时继续查找逐字结果，首个行级结果作为兜底；关闭时仍使用首个结果。所有新网络请求沿用 8 秒超时及现有代理，单源失败继续后续来源。

QQ QRC 使用其历史 DES EDE 变体（32 位字节序、PC2 右半偏移、两个 S-box 值不同），再 zlib 解压；不加载 QQ DLL。实现用独立公开密文向量验证，格式核对参考 [QQMusicQrcCipher](https://github.com/EllanStudio/qqmusic-api/blob/main/src/main/java/com/coloryr/allmusic/server/core/api/qqmusic/QQMusicQrcCipher.java) 和 [协议调用](https://github.com/EllanStudio/qqmusic-api/blob/main/src/main/java/com/coloryr/allmusic/server/core/api/qqmusic/QQMusicClient.java)。

缓存仍为应用数据目录 `lyrics-cache/*.json`，旧字段继续读。新条目使用 `schemaVersion: 3`，键附加原始歌名、AUMID、歌曲 ID 和逐字查询状态；旧键作为查询失败的后备。旧结果重新尝试新来源；当前版本的行级结果和未找到结果一周后重试，逐字结果长期复用。原生缓存每次实际查询优先检查，不写入第三方目录。

## 播放位置与诊断

SMTC 会话枚举对所有播放器开放；汽水新增 `SodaMusic.exe` / `sodamusic` AUMID 识别和进程诊断。并非仅依靠名称就假定它一定提供时间线。`timeline_sample` 与 `has_timeline` 按实际 Position / EndTime / LastUpdatedTime 决定能力。

QQ 的 `needsUpdate` 只有在**已有会话、没有可信时间线、且文件版本确实低于 21.10.2962** 时出现；有时间线优先判定正常，未知版本不判旧。此提示从不拦截 `get_lyrics`。因为版本号并不能保证所有客户端环境都支持进度，文案改为检测结果与建议，避免承诺升级必定修复。

没有可信时间线时保留已有 `trackClock`：从岛看到歌曲时估算，只计播放时间，暂停冻结；支持点击歌词校准，并显示现有“估算”提示。它无法知道客户端内的 seek，不能声称精准同步。无 SMTC 歌曲元数据时无法可靠知道播放哪首歌，不尝试进程内存偏移或注入。

## 第三方算法声明

酷狗缓存路径 / 文件名匹配、汽水 LMDB 快照 / msgpackr 解码，以及 QQ 搜索 / web LRC 协议实现参考或改编自 [Renly1994/xiaotang-daozai](https://github.com/Renly1994/xiaotang-daozai)，本机只读参考副本。涉及 `lyrics/kugou_cache.rs`、`qqmusic.rs`、`soda_cache.rs`、`soda_lmdb.rs`、`soda_msgpack.rs`。未移植 UI、内存偏移、进程写入代码。

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

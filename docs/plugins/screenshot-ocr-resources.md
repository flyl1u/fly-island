# 可选 OCR 资源

默认使用 Windows.Media.Ocr，不下载模型、不上传截图。用户点击独立截图设置中的“下载模型”后，才从 [#128 的固定提交](https://github.com/Philipfanw/fly-island/tree/2b196e358404a0fca7240049edd72bef1665d720/src-tauri/resources/ocr) 下载以下四个文件。原 PR 标注为 PaddleOCR PP-OCRv4 模型，运行库文件版本为 1.22.20250702.4.89746dc。

下载验证长度与 SHA-256，完整通过后才一次发布目录；中断不会启用半包，下次重试重新下载。失败不禁用系统 OCR。目录、状态与凭据均不包含截图内容。固定上游不可用时会显示失败并允许重试；尚未改为维护者自有的 release 镜像。

| 文件 | 字节数 | SHA-256 |
| --- | ---: | --- |
| `det.onnx` | 4745517 | `d2a7720d45a54257208b1e13e36a8479894cb74155a5efe29462512d42f49da9` |
| `rec.onnx` | 10857958 | `48fc40f24f6d2a207a2b1091d3437eb3cc3eb6b676dc3ef9c37384005483683b` |
| `keys.txt` | 26250 | `a1c84d9bdb9ab29043c58896224d32941783eb821629618416dcb08f12886492` |
| `onnxruntime.dll` | 14854696 | `b7d046825412fe3d6c582145f527a197817b2ed717a3a3f21c6e81896f5fce48` |

模型相关上游：[PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR)（Apache-2.0）；运行库：[ONNX Runtime](https://github.com/microsoft/onnxruntime)（[MIT](https://github.com/microsoft/onnxruntime/blob/main/LICENSE)）。许可证文本随下载目录保存，源码副本位于 `src-tauri/src/screenshot/licenses/`。增强资源未编入宿主安装包，首次下载后可离线使用。

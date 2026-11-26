export type ScreenshotText = {
  plainLinesHint: string; bilingualResult: string; copyBilingual: string;
  resultLayout: string; readableLayout: string; sourceLayout: string; readingFontSize: string; readableHint: string;
  ocrTitle: string; ocrResult: string; editableResult: string; showOriginal: string; keepLayout: string; copyLayout: string;
  ocrLine: string; ocrLoading: string; ocrReady: string; ocrLayoutHint: string; imageLoadFailed: string;
  minimizeWindow: string; maximizeWindow: string; zoomIn: string; zoomOut: string; fitImage: string;
  resizeWheelHint: string; imageScaleLabel: string; pinHint: string;
  arrowStyle: string;
  arrowSingle: string;
  arrowDouble: string;
  arrowNone: string;
  arrowEndpointHint: string;
  resizeShapeHint: string;

  pinFailed: string;
  translationTitle: string;
  resultView: string;
  textAndImage: string;
  imageOnly: string;
  textOnly: string;
  originalImage: string;
  translatedImage: string;
  lockAspect: string;
  resetSize: string;
  originalSize: string;
  downloads: string;
  invalidFileName: string;
  overwriteHint: string;

  /** 还没框选时的提示语。 */
  hint: string;
  toolMove: string;
  toolShape: string;
  toolArrow: string;
  toolPen: string;
  toolNumber: string;
  toolText: string;
  toolMosaic: string;
  displayNotReady: string;
  fillShape: string;
  shapeRect: string;
  shapeEllipse: string;
  dashSolid: string;
  dashDashed: string;
  dashDotted: string;
  /** 线宽滑块的提示：带上当前像素值。 */
  lineWidth: (width: number) => string;
  lineWidthLabel: string;
  numberSizeLabel: string;
  /** 马赛克颗粒滑块的可见标签。 */
  grain: string;
  grainLabel: string;
  fontSizeLabel: string;
  fontFamilyLabel: string;
  formatBold: string;
  formatItalic: string;
  formatUnderline: string;
  formatStrike: string;
  recognize: string;
  translate: string;
  translateHint: string;
  undo: string;
  undoHint: string;
  pin: string;
  save: string;
  copy: string;
  copied: string;
  pinSaved: string;
  pinSaveFailed: string;
  copyFailed: string;
  copyHint: string;
  copyAndClose: string;
  cancel: string;
  cancelHint: string;
  copyOcr: string;
  close: string;
  rotate: string;
  ocrFailed: (message: string) => string;
  translateFailed: (message: string) => string;
  saveTitle: string;
  saveLocation: string;
  saveFileName: string;
  saveFormat: string;
  saveResize: string;
  saveSize: string;
  saveEstimate: string;
  saveUseDialog: string;
  saveChooseFolder: string;
  saveFailed: (message: string) => string;
  saved: (path: string) => string;
  nothingFound: string;
  translationEmpty: string;
  /** 贴图窗口右键菜单。 */
  pinMenuTextSelectable: string;
  pinMenuRecognize: string;
  pinMenuCopyImage: string;
  pinMenuSaveImage: string;
  pinMenuShadow: string;
  pinMenuAlwaysOnTop: string;
  pinMenuClose: string;
  pinMenuDestroy: string;
};

export const zhCN: ScreenshotText = {
  plainLinesHint: "按行显示，长句自动换行", bilingualResult: "原文 / 译文对照", copyBilingual: "复制对照",
  resultLayout: "文字排版", readableLayout: "阅读排版", sourceLayout: "原图排版", readingFontSize: "阅读字号", readableHint: "正常字号，可编辑；文字不会随原图缩小",
  ocrTitle: "识别文字 · 图文对照", ocrResult: "识别结果", editableResult: "可编辑", showOriginal: "显示原图", keepLayout: "还原排版", copyLayout: "复制排版",
  ocrLine: "文字行", ocrLoading: "正在识别文字…", ocrReady: "识别完成", ocrLayoutHint: "按原图位置和行高排版，Ctrl + 滚轮同步缩放", imageLoadFailed: "原图加载失败",
  minimizeWindow: "最小化", maximizeWindow: "最大化 / 还原", zoomIn: "放大", zoomOut: "缩小", fitImage: "适应窗口",
  resizeWheelHint: "在预览或尺寸区域滚动鼠标滚轮，直观调整大小", imageScaleLabel: "图像大小", pinHint: "桌面贴图\n将截图悬浮在桌面，滚轮缩放，拖动移动",
  arrowStyle: "箭头",
  arrowSingle: "单箭头 →",
  arrowDouble: "双箭头 ↔",
  arrowNone: "无箭头 —",
  arrowEndpointHint: "拖动端点：调整长度和方向",
  resizeShapeHint: "拖动控制点调整大小",

  pinFailed: "贴图失败",
  translationTitle: "截图翻译",
  resultView: "结果显示方式",
  textAndImage: "原图与中英对照",
  imageOnly: "仅原图",
  textOnly: "仅中英对照",
  originalImage: "原图",
  translatedImage: "译图",
  lockAspect: "锁定宽高比",
  resetSize: "恢复原始大小",
  originalSize: "原始大小",
  downloads: "下载",
  invalidFileName: "请输入有效的文件名",
  overwriteHint: "确认保存位置并选择是否覆盖现有文件",

  hint: "拖拽选择区域 · Ctrl+A 全屏 · Esc 取消",
  toolMove: "移动选区",
  toolShape: "框选形状",
  toolArrow: "箭头",
  toolPen: "画笔",
  toolNumber: "序号",
  toolText: "文字",
  toolMosaic: "马赛克",
  displayNotReady: "显示器缩放布局尚未就绪，请按 Esc 后重试截图",
  fillShape: "填充",
  shapeRect: "方框",
  shapeEllipse: "椭圆框",
  dashSolid: "实线",
  dashDashed: "虚线",
  dashDotted: "点线",
  lineWidth: (width) => `线宽 ${width}px`,
  lineWidthLabel: "线宽",
  numberSizeLabel: "序号字号",
  grain: "颗粒",
  grainLabel: "马赛克颗粒",
  fontSizeLabel: "字号",
  fontFamilyLabel: "字体",
  formatBold: "加粗",
  formatItalic: "斜体",
  formatUnderline: "下划线",
  formatStrike: "删除线",
  recognize: "识别文字 · 图文对照",
  translate: "翻译",
  translateHint: "截图翻译 (Ctrl+Q)：图文对照，切换原图与译图",
  undo: "撤销",
  undoHint: "撤销 (Ctrl+Z)",
  pin: "桌面贴图",
  save: "保存图片",
  copy: "复制图片",
  copied: "已复制",
  pinSaved: "已保存",
  pinSaveFailed: "保存失败",
  copyFailed: "复制失败",
  copyHint: "复制图片 (Enter)",
  copyAndClose: "复制并关闭",
  cancel: "取消",
  cancelHint: "取消 (Esc)",
  copyOcr: "复制识别结果",
  close: "关闭",
  rotate: "拖动旋转",
  ocrFailed: (message) => `识别失败：${message}`,
  translateFailed: (message) => `翻译失败：${message}`,
  saveTitle: "保存图像",
  saveLocation: "保存位置",
  saveFileName: "文件名",
  saveFormat: "格式",
  saveResize: "调整大小",
  saveSize: "尺寸",
  saveEstimate: "预估文件大小",
  saveUseDialog: "使用系统保存对话框",
  saveChooseFolder: "选择文件夹",
  saveFailed: (message) => `保存失败：${message}`,
  saved: (path) => `已保存到：${path}`,
  nothingFound: "没有识别到文字",
  translationEmpty: "翻译没有返回结果，请检查翻译服务是否已配置",
  pinMenuTextSelectable: "文本可选择",
  pinMenuRecognize: "识别并复制文字",
  pinMenuCopyImage: "复制图像",
  pinMenuSaveImage: "保存图像",
  pinMenuShadow: "窗口阴影",
  pinMenuAlwaysOnTop: "窗口置顶",
  pinMenuClose: "关闭",
  pinMenuDestroy: "销毁",
};

export const en: ScreenshotText = {
  plainLinesHint: "Line by line, with automatic wrapping", bilingualResult: "Original / Translation", copyBilingual: "Copy bilingual text",
  resultLayout: "Text layout", readableLayout: "Reading layout", sourceLayout: "Original layout", readingFontSize: "Reading font size", readableHint: "Readable, editable text; image zoom does not shrink text",
  ocrTitle: "Recognize text · Image comparison", ocrResult: "Recognized text", editableResult: "Editable", showOriginal: "Show original", keepLayout: "Preserve layout", copyLayout: "Copy formatting",
  ocrLine: "Text line", ocrLoading: "Recognizing text…", ocrReady: "Recognition complete", ocrLayoutHint: "Positions and line heights follow the image. Ctrl + wheel zooms both panels.", imageLoadFailed: "Unable to load the original image",
  minimizeWindow: "Minimize", maximizeWindow: "Maximize / restore", zoomIn: "Zoom in", zoomOut: "Zoom out", fitImage: "Fit to window",
  resizeWheelHint: "Scroll over the preview or size controls to resize visually", imageScaleLabel: "Image size", pinHint: "Pin to desktop\nKeep the image floating; wheel to zoom, drag to move",
  arrowStyle: "Arrow",
  arrowSingle: "Single →",
  arrowDouble: "Double ↔",
  arrowNone: "No heads —",
  arrowEndpointHint: "Drag endpoint to adjust length and direction",
  resizeShapeHint: "Drag handle to resize",

  pinFailed: "Unable to pin image",
  translationTitle: "Screenshot translation",
  resultView: "Result view",
  textAndImage: "Original and bilingual text",
  imageOnly: "Original only",
  textOnly: "Bilingual text only",
  originalImage: "Original",
  translatedImage: "Translation",
  lockAspect: "Lock aspect ratio",
  resetSize: "Reset size",
  originalSize: "Original size",
  downloads: "Downloads",
  invalidFileName: "Enter a valid file name",
  overwriteHint: "Confirm location and choose whether to overwrite",

  hint: "Drag to select · Ctrl+A full screen · Esc cancel",
  toolMove: "Move selection",
  toolShape: "Shapes",
  toolArrow: "Arrow",
  toolPen: "Pen",
  toolNumber: "Number",
  toolText: "Text",
  toolMosaic: "Mosaic",
  displayNotReady: "Display scaling is not ready. Press Esc and try capturing again.",
  fillShape: "Fill",
  shapeRect: "Rectangle",
  shapeEllipse: "Ellipse",
  dashSolid: "Solid",
  dashDashed: "Dashed",
  dashDotted: "Dotted",
  lineWidth: (width) => `Line width ${width}px`,
  lineWidthLabel: "Line width",
  numberSizeLabel: "Number size",
  grain: "Grain",
  grainLabel: "Mosaic grain",
  fontSizeLabel: "Font size",
  fontFamilyLabel: "Font family",
  formatBold: "Bold",
  formatItalic: "Italic",
  formatUnderline: "Underline",
  formatStrike: "Strikethrough",
  recognize: "Recognize text · Compare with image",
  translate: "Translate",
  translateHint: "Screenshot translation (Ctrl+Q): compare text, original and translated image",
  undo: "Undo",
  undoHint: "Undo (Ctrl+Z)",
  pin: "Pin to desktop",
  save: "Save image",
  copy: "Copy image",
  copied: "Copied",
  pinSaved: "Saved",
  pinSaveFailed: "Save failed",
  copyFailed: "Copy failed",
  copyHint: "Copy image (Enter)",
  copyAndClose: "Copy and close",
  cancel: "Cancel",
  cancelHint: "Cancel (Esc)",
  copyOcr: "Copy recognized text",
  close: "Close",
  rotate: "Drag to rotate",
  ocrFailed: (message) => `Text recognition failed: ${message}`,
  translateFailed: (message) => `Translation failed: ${message}`,
  saveTitle: "Save image",
  saveLocation: "Save location",
  saveFileName: "File name",
  saveFormat: "Format",
  saveResize: "Resize",
  saveSize: "Size",
  saveEstimate: "Estimated file size",
  saveUseDialog: "Use system save dialog",
  saveChooseFolder: "Choose folder",
  saveFailed: (message) => `Save failed: ${message}`,
  saved: (path) => `Saved to: ${path}`,
  nothingFound: "No text was recognized",
  translationEmpty: "The translation service returned nothing; check that it is configured",
  pinMenuTextSelectable: "Text selectable",
  pinMenuRecognize: "Recognize & copy text",
  pinMenuCopyImage: "Copy image",
  pinMenuSaveImage: "Save image",
  pinMenuShadow: "Window shadow",
  pinMenuAlwaysOnTop: "Always on top",
  pinMenuClose: "Close",
  pinMenuDestroy: "Destroy",
};

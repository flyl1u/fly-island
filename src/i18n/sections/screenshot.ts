export type ScreenshotText = {
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
  pinFailed: "贴图失败",
  translationTitle: "截图翻译",
  resultView: "结果显示方式",
  textAndImage: "显示文本和图片",
  imageOnly: "仅显示图片",
  textOnly: "仅显示文本",
  originalImage: "原图",
  translatedImage: "译图",
  lockAspect: "锁定宽高比",
  resetSize: "恢复原始大小",
  originalSize: "原始大小",
  downloads: "下载",
  invalidFileName: "请输入有效的文件名",
  overwriteHint: "确认保存位置并选择是否覆盖现有文件",

  hint: "拖拽选择区域，Esc 取消",
  toolMove: "移动选区",
  toolShape: "框选形状",
  toolArrow: "箭头",
  toolPen: "画笔",
  toolNumber: "序号",
  toolText: "文字",
  toolMosaic: "马赛克",
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
  formatBold: "加粗",
  formatItalic: "斜体",
  formatUnderline: "下划线",
  formatStrike: "删除线",
  recognize: "识别文字",
  translate: "翻译",
  translateHint: "截图翻译 (Ctrl+Q)：图文对照，切换原图与译图",
  undo: "撤销",
  undoHint: "撤销 (Ctrl+Z)",
  pin: "贴图到桌面",
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
  pinFailed: "Unable to pin image",
  translationTitle: "Screenshot translation",
  resultView: "Result view",
  textAndImage: "Show text and image",
  imageOnly: "Show image only",
  textOnly: "Show text only",
  originalImage: "Original",
  translatedImage: "Translation",
  lockAspect: "Lock aspect ratio",
  resetSize: "Reset size",
  originalSize: "Original size",
  downloads: "Downloads",
  invalidFileName: "Enter a valid file name",
  overwriteHint: "Confirm location and choose whether to overwrite",

  hint: "Drag to select an area, Esc to cancel",
  toolMove: "Move selection",
  toolShape: "Shapes",
  toolArrow: "Arrow",
  toolPen: "Pen",
  toolNumber: "Number",
  toolText: "Text",
  toolMosaic: "Mosaic",
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
  formatBold: "Bold",
  formatItalic: "Italic",
  formatUnderline: "Underline",
  formatStrike: "Strikethrough",
  recognize: "Recognize text",
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

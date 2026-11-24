export type ScreenshotText = {
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
  save: string;
  copy: string;
  copyHint: string;
  cancel: string;
  cancelHint: string;
  copyOcr: string;
  close: string;
  rotate: string;
  ocrFailed: (message: string) => string;
  translateFailed: (message: string) => string;
  nothingFound: string;
  translationEmpty: string;
};

export const zhCN: ScreenshotText = {
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
  translateHint: "划词翻译：把译文画在原文下面",
  undo: "撤销",
  undoHint: "撤销 (Ctrl+Z)",
  save: "保存图片",
  copy: "复制图片",
  copyHint: "复制图片 (Enter)",
  cancel: "取消",
  cancelHint: "取消 (Esc)",
  copyOcr: "复制识别结果",
  close: "关闭",
  rotate: "拖动旋转",
  ocrFailed: (message) => `识别失败：${message}`,
  translateFailed: (message) => `翻译失败：${message}`,
  nothingFound: "没有识别到文字",
  translationEmpty: "翻译没有返回结果，请检查翻译服务是否已配置",
};

export const en: ScreenshotText = {
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
  translateHint: "Translate in place: the translation is drawn under the original text",
  undo: "Undo",
  undoHint: "Undo (Ctrl+Z)",
  save: "Save image",
  copy: "Copy image",
  copyHint: "Copy image (Enter)",
  cancel: "Cancel",
  cancelHint: "Cancel (Esc)",
  copyOcr: "Copy recognized text",
  close: "Close",
  rotate: "Drag to rotate",
  ocrFailed: (message) => `Text recognition failed: ${message}`,
  translateFailed: (message) => `Translation failed: ${message}`,
  nothingFound: "No text was recognized",
  translationEmpty: "The translation service returned nothing; check that it is configured",
};

// 标注的数据结构、绘制与编辑操作。纯逻辑，不含 React，便于单测。
// 所有坐标都是「选区内的 CSS 像素」，绘制时统一乘 scale（物理像素 / CSS 像素）。

export type Point = { x: number; y: number };

export type Tool = "move" | "shape" | "arrow" | "pen" | "text" | "number" | "mosaic";
export type Shape = "rect" | "ellipse";
export type Dash = "solid" | "dashed" | "dotted";
export type NumberStyle = "arabic" | "alpha" | "roman";

/** 序号显示：1,2,3 / a,b,c / i,ii,iii。 */
export function formatNumber(value: number, style: NumberStyle): string {
  if (style === "alpha") {
    let text = "";
    let current = value;
    while (current > 0) {
      const remainder = (current - 1) % 26;
      text = String.fromCharCode(97 + remainder) + text;
      current = Math.floor((current - 1) / 26);
    }
    return text;
  }
  if (style === "roman") {
    const table: [number, string][] = [
      [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"],
    ];
    let text = "";
    let current = value;
    for (const [unit, symbol] of table) {
      while (current >= unit) {
        text += symbol;
        current -= unit;
      }
    }
    return text;
  }
  return String(value);
}

/** 按线型设置虚线样式；宽度越大，间隔跟着放大，视觉才一致。 */
export function applyDash(context: CanvasRenderingContext2D, dash: Dash | undefined, width: number) {
  if (dash === "dashed") context.setLineDash([width * 3, width * 2]);
  else if (dash === "dotted") context.setLineDash([width * 0.1, width * 2]);
  else context.setLineDash([]);
}

export type Annotation =
  | { kind: "rect"; color: string; width: number; dash?: Dash; from: Point; to: Point }
  | { kind: "ellipse"; color: string; width: number; dash?: Dash; from: Point; to: Point }
  | { kind: "arrow"; color: string; width: number; dash?: Dash; from: Point; to: Point }
  | { kind: "pen"; color: string; width: number; dash?: Dash; points: Point[] }
  | { kind: "text"; color: string; size: number; font: string; at: Point; text: string; bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean; w?: number; h?: number; angle?: number }
  | { kind: "number"; color: string; size: number; at: Point; value: number; style: NumberStyle }
  | { kind: "mosaic"; size: number; from: Point; to: Point };

/** 多巴胺配色：高饱和、明亮，标注在亮背景上也够显眼。 */
export const COLORS = [
  "#FF5E5B",
  "#FF9F45",
  "#FFD93D",
  "#4CD964",
  "#00C2A8",
  "#4D96FF",
  "#B983FF",
  "#FF7AC6",
  "#111111",
  "#FFFFFF",
];

/** 每个工具默认的线宽/字号（CSS 像素）。 */
export function defaultWidth(tool: Tool): number {
  return tool === "text" || tool === "number" ? 18 : tool === "mosaic" ? 12 : 3;
}

function bound(a: Point, b: Point) {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

/** 把一条标注画到 2D 上下文里。
 *
 * `source` / `sourceOffset` 只给马赛克用：它必须从**已经画了图的那块画布**取像素，
 * 否则取到的是透明的标注层，看起来就像"没打上"。
 */
export function drawAnnotation(
  context: CanvasRenderingContext2D,
  item: Annotation,
  scale: number,
  source?: HTMLCanvasElement,
  sourceOffset?: Point,
) {
  const s = scale;
  context.save();
  context.lineJoin = "round";
  context.lineCap = "round";
  if (item.kind !== "mosaic") {
    context.strokeStyle = item.color;
    context.fillStyle = item.color;
  }
  switch (item.kind) {
    case "rect": {
      const box = bound(item.from, item.to);
      context.lineWidth = item.width * s;
      applyDash(context, item.dash, item.width * s);
      context.strokeRect(box.x * s, box.y * s, box.width * s, box.height * s);
      break;
    }
    case "ellipse": {
      const box = bound(item.from, item.to);
      context.lineWidth = item.width * s;
      applyDash(context, item.dash, item.width * s);
      context.beginPath();
      context.ellipse(
        (box.x + box.width / 2) * s,
        (box.y + box.height / 2) * s,
        (box.width / 2) * s,
        (box.height / 2) * s,
        0,
        0,
        Math.PI * 2,
      );
      context.stroke();
      break;
    }
    case "arrow": {
      const width = item.width * s;
      context.lineWidth = width;
      applyDash(context, item.dash, width);
      const dx = item.to.x * s - item.from.x * s;
      const dy = item.to.y * s - item.from.y * s;
      const length = Math.hypot(dx, dy);
      // 头部跟线宽走，但限制在合理范围，短箭头也不会顶出一个大三角。
      const head = Math.min(Math.max(width * 3.5, 9), length * 0.6);
      const angle = Math.atan2(dy, dx);
      const tipX = item.to.x * s;
      const tipY = item.to.y * s;
      // 线画到箭头根部，避免线尖顶着三角形看起来分叉。
      context.beginPath();
      context.moveTo(item.from.x * s, item.from.y * s);
      context.lineTo(tipX - Math.cos(angle) * head * 0.85, tipY - Math.sin(angle) * head * 0.85);
      context.stroke();
      context.beginPath();
      context.moveTo(tipX, tipY);
      context.lineTo(tipX - head * Math.cos(angle - 0.38), tipY - head * Math.sin(angle - 0.38));
      context.lineTo(tipX - head * Math.cos(angle + 0.38), tipY - head * Math.sin(angle + 0.38));
      context.closePath();
      context.fill();
      break;
    }
    case "pen": {
      context.lineWidth = item.width * s;
      applyDash(context, item.dash, item.width * s);
      context.beginPath();
      item.points.forEach((point, index) =>
        index === 0 ? context.moveTo(point.x * s, point.y * s) : context.lineTo(point.x * s, point.y * s),
      );
      context.stroke();
      break;
    }
    case "text": {
      const fontSize = Math.round(item.size * s);
      context.font = `${item.italic ? "italic " : ""}${item.bold ? "bold " : ""}${fontSize}px ${item.font}`;
      context.textBaseline = "top";
      // 旋转以文字框中心为原点，360° 任意角度。
      const angle = ((item.angle ?? 0) * Math.PI) / 180;
      const boxWidth = (item.w ?? 10) * s;
      const boxHeight = (item.h ?? item.size * 1.4) * s;
      context.save();
      if (angle !== 0) {
        context.translate(item.at.x * s + boxWidth / 2, item.at.y * s + boxHeight / 2);
        context.rotate(angle);
        context.translate(-boxWidth / 2, -boxHeight / 2);
      }
      const x = angle === 0 ? item.at.x * s : 0;
      const y = angle === 0 ? item.at.y * s : 0;
      const lines = item.text.split("\n");
      const lineHeight = fontSize * 1.4;
      let textWidth = 0;
      lines.forEach((line, index) => {
        context.fillText(line, x, y + index * lineHeight);
        textWidth = Math.max(textWidth, context.measureText(line).width);
      });
      context.strokeStyle = item.color;
      context.lineWidth = Math.max(1, fontSize * 0.06);
      lines.forEach((line, index) => {
        const lineWidth = context.measureText(line).width;
        const top = y + index * lineHeight;
        if (item.underline) {
          context.beginPath();
          context.moveTo(x, top + fontSize * 1.06);
          context.lineTo(x + lineWidth, top + fontSize * 1.06);
          context.stroke();
        }
        if (item.strike) {
          context.beginPath();
          context.moveTo(x, top + fontSize * 0.56);
          context.lineTo(x + lineWidth, top + fontSize * 0.56);
          context.stroke();
        }
      });
      if (angle !== 0) context.restore();
      break;
    }
    case "number": {
      const radius = (item.size / 2) * s;
      const center = { x: item.at.x * s + radius, y: item.at.y * s + radius };
      context.beginPath();
      context.arc(center.x, center.y, radius, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = "#fff";
      context.font = `bold ${Math.round(radius)}px system-ui, sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(String(item.value), center.x, center.y);
      break;
    }
    case "mosaic": {
      // 真马赛克：从底图取这块区域，缩小再放大，像素块化。
      const box = bound(item.from, item.to);
      const block = Math.max(2, Math.round(item.size * s));
      const origin = sourceOffset ?? { x: 0, y: 0 };
      const sourceCanvas = source ?? context.canvas;
      const sourceX = Math.round((origin.x + box.x) * s);
      const sourceY = Math.round((origin.y + box.y) * s);
      const sourceWidth = Math.max(1, Math.round(box.width * s));
      const sourceHeight = Math.max(1, Math.round(box.height * s));
      const small = document.createElement("canvas");
      small.width = Math.max(1, Math.round(sourceWidth / block));
      small.height = Math.max(1, Math.round(sourceHeight / block));
      const smallContext = small.getContext("2d");
      if (smallContext) {
        smallContext.drawImage(sourceCanvas, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, small.width, small.height);
        context.imageSmoothingEnabled = false;
        context.drawImage(small, 0, 0, small.width, small.height, Math.round(box.x * s), Math.round(box.y * s), sourceWidth, sourceHeight);
        context.imageSmoothingEnabled = true;
      }
      break;
    }
  }
  context.restore();
}

/** 依次重绘所有标注（撤销靠重绘整块画布）。 */
export function redraw(
  context: CanvasRenderingContext2D,
  items: Annotation[],
  scale: number,
  source?: HTMLCanvasElement,
  sourceOffset?: Point,
) {
  for (const item of items) drawAnnotation(context, item, scale, source, sourceOffset);
}

/** 文本框的近似边界（用于点击进入编辑）。 */
export function textBounds(item: Extract<Annotation, { kind: "text" }>): { x: number; y: number; width: number; height: number } {
  // 优先用提交时量出来的真实宽高；老数据没有就用估算兜底。
  const longest = item.text.split("\n").reduce((max, line) => Math.max(max, line.length), 1);
  const lines = item.text.split("\n").length;
  const width = item.w ?? Math.max(24, longest * item.size * 0.6);
  const height = item.h ?? lines * item.size * 1.4;
  return { x: item.at.x, y: item.at.y, width, height };
}

/** 命中哪一条文字标注；没有则返回 null。 */
export function hitText(items: Annotation[], point: Point): number | null {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item.kind !== "text") continue;
    const box = textBounds(item);
    // 把点击点绕文字中心反向旋转，再按未旋转的矩形判断。
    const angle = ((item.angle ?? 0) * Math.PI) / 180;
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    const dx = point.x - centerX;
    const dy = point.y - centerY;
    const localX = centerX + dx * Math.cos(-angle) - dy * Math.sin(-angle);
    const localY = centerY + dx * Math.sin(-angle) + dy * Math.cos(-angle);
    if (localX >= box.x && localX <= box.x + box.width && localY >= box.y && localY <= box.y + box.height) {
      return index;
    }
  }
  return null;
}
/** 命中线框类标注（矩形/椭圆/箭头），返回下标；没有则 null。 */
export function hitStroke(items: Annotation[], point: Point): number | null {
  const near = 8;
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item.kind === "rect" || item.kind === "ellipse") {
      const box = bound(item.from, item.to);
      const inside =
        point.x >= box.x - near &&
        point.x <= box.x + box.width + near &&
        point.y >= box.y - near &&
        point.y <= box.y + box.height + near;
      if (inside) return index;
    } else if (item.kind === "arrow") {
      if (distanceToSegment(point, item.from, item.to) <= near) return index;
    }
  }
  return null;
}

function distanceToSegment(point: Point, from: Point, to: Point): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - from.x, point.y - from.y);
  const t = Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (from.x + t * dx), point.y - (from.y + t * dy));
}
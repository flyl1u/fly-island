// The tucked looks for island-tour.tsx: tucking from the open island and coming back out.
// Line shrinks the shape itself into a 72 x 5 bar and hidden fades it out; sampled halfway, neither
// has jumped to its end, and both cover Rust's hot zone so the page's mouseenter still reveals.
import { act } from "react";

type TuckTour = {
  tuckStyle: string;
  island: () => HTMLElement;
  check: (condition: unknown, message: string) => void;
  settle: (ms: number) => Promise<void>;
  interaction: () => Record<string, unknown>;
  click: (selector: string) => Promise<void>;
  checkShapeMotion: (expectedSeconds: number) => void;
};

/**
 * A click outside act(): inside it the island's class change starts no CSS transition in headless
 * Chrome (the tour's other checks read end values straight away), so motion sampled halfway needs this.
 */
async function clickLive(selector: string) {
  document.querySelector<HTMLElement>(selector)!.click();
  await act(async () => {});
}

/** From the open island: tuck it to the top edge, then open it again from there. */
export async function checkTuckMorph({ tuckStyle, island, check, settle, interaction, click, checkShapeMotion }: TuckTour) {
  const morphs = tuckStyle !== "edge";
  const expandedWidth = Number.parseFloat(getComputedStyle(island()).width);
  await (morphs ? clickLive : click)('[aria-label="收起到屏幕顶部"]');
  checkShapeMotion(0.38);
  check(interaction().isTucked === true, "贴边收起请求保留位置动画");
  if (!morphs) {
    check(interaction().tuckStyle === "edge" && !/island--tuck-/.test(island().className), "贴边样式 edge：传给原生窗口，岛屿保持原样");
    await settle(450);
    check(getComputedStyle(island().querySelector(".island__shoulders")!).opacity === "0", "默认贴边样式也隐藏肩膀");
    await click(".island__open-button");
    return;
  }
  const scale = Number.parseFloat(getComputedStyle(island()).getPropertyValue("--island-collapsed-scale")) || 1;
  await settle(120);
  let mid = getComputedStyle(island());
  check(tuckStyle === "line"
    ? Number.parseFloat(mid.width) > 72 * scale + 2 && Number.parseFloat(mid.width) < expandedWidth - 2
    : Number.parseFloat(mid.opacity) > 0.02 && Number.parseFloat(mid.opacity) < 0.98,
  `贴边样式 ${tuckStyle}：收起过程中途是连续变形，不是瞬间切换（${mid.width} / ${mid.opacity}）`);
  await settle(450);
  const style = getComputedStyle(island());
  const shoulders = island().querySelector<HTMLElement>(".island__shoulders")!;
  check(getComputedStyle(shoulders).opacity === "0", "任何贴边样式收回时不留肩膀");
  const endOk = tuckStyle === "line"
    ? Math.abs(Number.parseFloat(style.width) - 72 * scale) < 0.5 && Math.abs(Number.parseFloat(style.height) - 5 * scale) < 0.5
      && style.backgroundColor !== "rgba(0, 0, 0, 0)" && style.transform === "none"
    : style.opacity === "0";
  const zone = getComputedStyle(island(), "::before");
  const zoneOk = Math.abs(Number.parseFloat(zone.width) - (tuckStyle === "line" ? 140 : 160) * scale) < 0.5
    && Math.abs(Number.parseFloat(zone.height) - (tuckStyle === "line" ? 14 : 6) * scale) < 0.5;
  check(interaction().tuckStyle === tuckStyle && endOk && zoneOk && island().classList.contains(`island--tuck-${tuckStyle}`),
    `贴边样式 ${tuckStyle}：传给原生窗口，${tuckStyle === "line" ? "岛屿缩成短横线" : "岛屿完全透明"}，命中区与原生热区一致（${style.width}×${style.height} / ${style.opacity} / ${zone.width}×${zone.height}）`);

  const samples: number[] = [island().getBoundingClientRect().top];
  const started = performance.now();
  const measured = new Promise<void>((resolve) => {
    const frame = () => {
      samples.push(island().getBoundingClientRect().top);
      if (performance.now() - started < 620) requestAnimationFrame(frame);
      else resolve();
    };
    requestAnimationFrame(frame);
  });
  await clickLive(".island__open-button");
  await settle(120);
  mid = getComputedStyle(island());
  check(tuckStyle === "line"
    ? Number.parseFloat(mid.height) > 5 * scale + 2 && island().classList.contains("island--untuck-line") && mid.transform === "none"
    : Number.parseFloat(mid.opacity) > 0.02 && Number.parseFloat(mid.opacity) < 0.98 && island().classList.contains("island--untuck-hidden"),
  `贴边样式 ${tuckStyle}：从边缘出来的中途在变形，不是闪现（${mid.height} / ${mid.opacity} / ${mid.transform}）`);
  await settle(600);
  await measured;
  check(samples.length >= 3 && samples.every((y, i) => i === 0 || y >= samples[i - 1] - 0.01),
    `贴边样式 ${tuckStyle}：逐帧顶边不向上（${samples.length} 帧，y=${Math.min(...samples).toFixed(2)}…${Math.max(...samples).toFixed(2)}）`);
  check(!/island--untuck-/.test(island().className) && getComputedStyle(island()).opacity === "1", `贴边样式 ${tuckStyle}：出来后恢复完整岛屿`);
  if (island().classList.contains("island--shoulders")) {
    const shoulderStyle = getComputedStyle(shoulders);
    const rect = shoulders.getBoundingClientRect();
    const body = island().getBoundingClientRect();
    check(shoulderStyle.opacity === "1" && shoulderStyle.pointerEvents === "none"
      && rect.left < body.left && rect.right > body.right && rect.width <= 820 && rect.left >= 0 && rect.right <= innerWidth,
    "贴顶圆角随岛身宽度展开，留在舞台内且不拦截点击");
    document.documentElement.dataset.islandTopEdge = "detached";
    await settle(650);
    check(getComputedStyle(shoulders).opacity === "0", "拖离顶边后隐藏肩膀");
    document.documentElement.dataset.islandTopEdge = "attached";
    await settle(650);
    check(getComputedStyle(shoulders).opacity === "1", "重新贴顶后恢复肩膀");
  }
}

// The collapsed island's shape for island-tour.tsx: the notch flush with the top edge, or with
// ?capsule=1 a pill floating below it (features/appearance/islandShape.ts).
import { CAPSULE_SHAPE_ENABLED } from "../../src/features/appearance/islandShape";

export function checkIslandShapeMotion(expectedSeconds: number, interaction: Record<string, unknown>, check: ShapeTour["check"]) {
  const island = document.querySelector<HTMLElement>(".island")!;
  const style = getComputedStyle(island);
  const properties = style.transitionProperty.split(",").map((value) => value.trim());
  const durations = style.transitionDuration.split(",").map(Number.parseFloat);
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  check(["width", "height", "border-radius"].every((property) => {
    const index = properties.indexOf(property);
    return index >= 0 && durations[index % durations.length] === (property === "width" && island.classList.contains("island--width-motion") ? 0.4 : expectedSeconds);
  }), `岛屿形状完整过渡（reduce=${reduce}; property=${style.transitionProperty}; duration=${style.transitionDuration}）`);
  check(interaction.animatePosition === true, `贴边收起与滑出始终请求位置动画（reduce=${reduce}）`);
}

type ShapeTour = {
  island: HTMLElement;
  expectedHeight: number;
  interaction: Record<string, unknown>;
  check: (condition: unknown, message: string) => void;
};

export function checkCollapsedShape(capsule: boolean, { island, expectedHeight, interaction, check }: ShapeTour) {
  const style = getComputedStyle(island);
  const height = island.getBoundingClientRect().height;
  const renderedAsCapsule = island.classList.contains("island--capsule");
  const bottom = Number.parseFloat(style.borderBottomLeftRadius);
  if (capsule && !CAPSULE_SHAPE_ENABLED) {
    check(!renderedAsCapsule && island.classList.contains("island--shoulders"),
      "胶囊功能关闭时存档回退刘海，浅色主题仍绘制 20px 肩部");
  }
  if (!renderedAsCapsule) {
    check(height === expectedHeight && bottom >= 16 && style.borderTopLeftRadius === "0px",
      `收起的岛贴着顶边：上边是平的，下面两个角是大圆角（${height}px / ${bottom}px / ${style.borderTopLeftRadius}）`);
    return;
  }
  const top = Number.parseFloat(style.borderTopLeftRadius);
  check(height === expectedHeight && top === expectedHeight / 2 && bottom === expectedHeight / 2
    && style.getPropertyValue("--island-corner-shape").trim() === "round",
  `胶囊收起时是一颗药丸：四角都是条高的一半，两端是圆弧（${height}px / ${top}px / ${bottom}px）`);
  check(renderedAsCapsule && island.classList.contains("island--detached")
    && !island.classList.contains("island--shoulders"), "胶囊浮起，没有贴边圆角");
  check(interaction.marginY === 8 && interaction.collapsedCornerRadius === expectedHeight / 2,
    "胶囊悬在顶边下方 8px，原生点击范围同样是药丸");
}

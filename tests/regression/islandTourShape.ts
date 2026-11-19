// The collapsed island's shape for island-tour.tsx: the notch flush with the top edge, or with
// ?capsule=1 a pill floating below it (features/appearance/islandShape.ts).
type ShapeTour = {
  island: HTMLElement;
  expectedHeight: number;
  interaction: Record<string, unknown>;
  check: (condition: unknown, message: string) => void;
};

export function checkCollapsedShape(capsule: boolean, { island, expectedHeight, interaction, check }: ShapeTour) {
  const style = getComputedStyle(island);
  const height = island.getBoundingClientRect().height;
  const bottom = Number.parseFloat(style.borderBottomLeftRadius);
  if (!capsule) {
    check(height === expectedHeight && bottom >= 16 && style.borderTopLeftRadius === "0px",
      `收起的岛贴着顶边：上边是平的，下面两个角是大圆角（${height}px / ${bottom}px / ${style.borderTopLeftRadius}）`);
    return;
  }
  const top = Number.parseFloat(style.borderTopLeftRadius);
  check(height === expectedHeight && top === expectedHeight / 2 && bottom === expectedHeight / 2
    && style.getPropertyValue("--island-corner-shape").trim() === "round",
  `胶囊收起时是一颗药丸：四角都是条高的一半，两端是圆弧（${height}px / ${top}px / ${bottom}px）`);
  check(island.classList.contains("island--capsule") && island.classList.contains("island--detached")
    && !island.classList.contains("island--shoulders"), "胶囊浮起，没有贴边圆角");
  check(interaction.marginY === 8 && interaction.collapsedCornerRadius === expectedHeight / 2,
    "胶囊悬在顶边下方 8px，原生点击范围同样是药丸");
}

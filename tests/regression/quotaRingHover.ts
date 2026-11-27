import { act } from "react";

export async function checkQuotaHover(ring: HTMLElement, check: (condition: unknown, message: string) => void) {
  const bounds = ring.getBoundingClientRect();
  const top = ring.querySelector(".quota-rings__half--top")!;
  const bottom = ring.querySelector(".quota-rings__half--bottom")!;
  const arcs = [...ring.querySelectorAll<SVGPathElement>(".quota-rings__track")];
  check(arcs.every((arc) => arc.getPointAtLength(0).x < arc.getPointAtLength(arc.getTotalLength()).x), "上下弧均从左端起画，剩余额度从右端向左耗尽");
  const enter = (target: Element) => act(async () => {
    target.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
  });
  const leave = (target: Element) => act(async () => {
    target.dispatchEvent(new PointerEvent("pointerout", { bubbles: true, relatedTarget: document.body }));
  });
  const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 260)); });
  await enter(top);
  await settle();
  const card = document.querySelector<HTMLElement>(".island-hover-card");
  check(card?.textContent === "5 小时 · 剩余 73%" && card.getBoundingClientRect().left >= bounds.right,
    `上半区只在右侧显示短提示：${card?.textContent}`);
  await leave(top);
  await enter(bottom);
  await settle();
  check(document.querySelector(".island-hover-card")?.textContent === "每周 · 剩余 38%", "下半区切换为每周，提示不包含来源和重置说明");
  await leave(bottom);
  const upper = ring.querySelector(".quota-rings__arc--top")!;
  const lower = ring.querySelector(".quota-rings__arc--bottom")!;
  await act(async () => (top.querySelector("button") as HTMLButtonElement).focus());
  await settle();
  check(getComputedStyle(upper).transform !== "none" && getComputedStyle(lower).transform === "none"
    && getComputedStyle(ring).backgroundColor === "rgba(0, 0, 0, 0)", "聚焦上半环只抬起上弧，背后不铺底色");
  await act(async () => (bottom.querySelector("button") as HTMLButtonElement).focus());
  await settle();
  check(getComputedStyle(lower).transform !== "none" && getComputedStyle(upper).transform === "none", "聚焦下半环只抬起下弧");
  await act(async () => (document.activeElement as HTMLElement).blur());
}

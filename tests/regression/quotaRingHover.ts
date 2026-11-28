import { act } from "react";

export async function checkQuotaHover(ring: HTMLElement, check: (condition: unknown, message: string) => void) {
  const bounds = ring.getBoundingClientRect();
  const targets = ring.querySelectorAll<HTMLButtonElement>(".quota-rings__target");
  const anchor = ring.querySelector(".quota-rings__hover")!;
  const area = anchor.getBoundingClientRect();
  const size = ring.querySelector(".quota-rings")!.getBoundingClientRect();
  check(targets.length === 1 && area.width === size.width && area.height === size.height, "整个环是一个感应区，不再分上下两半");
  const arcs = [...ring.querySelectorAll<SVGPathElement>(".quota-rings__track")];
  check(arcs.every((arc) => arc.getPointAtLength(0).x < arc.getPointAtLength(arc.getTotalLength()).x), "上下弧均从左端起画，剩余额度从右端向左耗尽");
  const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 260)); });
  await act(async () => { anchor.dispatchEvent(new PointerEvent("pointerover", { bubbles: true })); });
  await settle();
  const card = document.querySelector<HTMLElement>(".island-hover-card");
  const lines = [...(card?.querySelectorAll(".island-hover-card__line") ?? [])].map((line) => line.textContent);
  check(lines.join("|") === "5 小时 · 剩余 73%|每周 · 剩余 38%" && card!.getBoundingClientRect().left >= bounds.right,
    `悬停在右侧一次显示两项额度，不含来源和重置说明：${lines.join("|")}`);
  await act(async () => { anchor.dispatchEvent(new PointerEvent("pointerout", { bubbles: true, relatedTarget: document.body })); });
  const agent = () => getComputedStyle(ring).backgroundColor;
  const resting = agent();
  await act(async () => targets[0].focus());
  await settle();
  check(agent() !== resting && getComputedStyle(ring.querySelector(".quota-rings > svg")!).transform === "none"
    && getComputedStyle(ring.querySelector(".quota-rings")!, "::before").content === "none",
    "聚焦时沿用 3.4.3 的底色高亮，环不抬起、没有阴影");
  await act(async () => targets[0].blur());
}

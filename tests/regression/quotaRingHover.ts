import { act } from "react";

export async function checkQuotaHover(ring: HTMLElement, check: (condition: unknown, message: string) => void) {
  const bounds = ring.getBoundingClientRect();
  const top = ring.querySelector(".quota-rings__half--top")!;
  const bottom = ring.querySelector(".quota-rings__half--bottom")!;
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
}

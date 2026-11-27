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
  const body = ring.querySelector<HTMLElement>(".quota-rings__body")!;
  const tracks = [...body.querySelectorAll(".quota-rings__track")];
  const logo = body.querySelector(".quota-rings__logo")!;
  const widths = () => tracks.map((track) => track.getBoundingClientRect().width);
  const shadow = () => getComputedStyle(ring.querySelector(".quota-rings") ?? ring, "::before").boxShadow;
  const restingShadow = shadow();
  const restingLogo = logo.getBoundingClientRect().top;
  const restingTarget = top.getBoundingClientRect().top;
  check(restingShadow !== "none", "整个额度环常驻一层浅阴影");
  await act(async () => (top.querySelector("button") as HTMLButtonElement).focus());
  await settle();
  const [upperNear, lowerFar] = widths();
  check(upperNear > lowerFar + 1 && logo.getBoundingClientRect().top < restingLogo, `聚焦上半区：上沿靠近用户，图标跟着环一起抬起（${upperNear.toFixed(1)} / ${lowerFar.toFixed(1)}）`);
  check(shadow() === restingShadow && top.getBoundingClientRect().top === restingTarget
    && getComputedStyle(ring).backgroundColor === "rgba(0, 0, 0, 0)", "阴影和感应区不动，背后不铺底色");
  await act(async () => (bottom.querySelector("button") as HTMLButtonElement).focus());
  await settle();
  const [upperFar, lowerNear] = widths();
  check(lowerNear > upperFar + 1, `聚焦下半区：下沿靠近用户（${upperFar.toFixed(1)} / ${lowerNear.toFixed(1)}）`);
  await act(async () => (document.activeElement as HTMLElement).blur());
}

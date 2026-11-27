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
  const body = ring.querySelector<HTMLElement>(".quota-rings__body")!;
  const shadow = () => getComputedStyle(ring.querySelector(".quota-rings")!, "::before").boxShadow;
  const restingShadow = shadow();
  // "rgba(…) 0px 1px 3px 0px": what reaches below the ring has to fit the row's padding, or it is cut.
  const [, offsetY, blur, spread] = (restingShadow.match(/(-?[\d.]+)px/g) ?? []).map(parseFloat);
  const padding = parseFloat(getComputedStyle(ring.closest(".agent-quota")!).paddingBottom);
  check(restingShadow !== "none" && offsetY + blur + spread <= padding
    && getComputedStyle(ring.querySelector(".quota-rings")!, "::before").backgroundColor === "rgba(0, 0, 0, 0)",
    `整个额度环常驻一层不带底色、不被裁掉的浅阴影：${restingShadow}`);
  const restingTarget = targets[0].getBoundingClientRect().top;
  await act(async () => targets[0].focus());
  await settle();
  const lifted = new DOMMatrix(getComputedStyle(body).transform);
  check(lifted.is2D && lifted.m42 < 0 && lifted.m42 >= -1 && lifted.m11 > 1 && lifted.m11 <= 1.06 && lifted.m11 === lifted.m22
    && body.querySelector(".quota-rings__logo") && body.querySelectorAll(".quota-rings__track").length === 2,
    `聚焦时环和图标整体轻微抬起，不倾斜、不变形：${lifted.toString()}`);
  check([...body.querySelectorAll("svg path")].every((arc) => getComputedStyle(arc).opacity === "1")
    && shadow() === restingShadow && targets[0].getBoundingClientRect().top === restingTarget
    && getComputedStyle(ring).backgroundColor === "rgba(0, 0, 0, 0)", "两段弧不变暗，阴影和感应区不动，背后不铺底色");
  await act(async () => targets[0].blur());
}

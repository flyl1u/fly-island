import { act } from "react";
import { TRANSLATIONS } from "../../src/i18n";

type Tour = {
  mount: () => void;
  click: (selector: string) => Promise<void>;
  settle: (ms: number) => Promise<void>;
  check: (condition: unknown, message: string) => void;
  results: HTMLElement;
  messages: string[];
};

function visibleNames(row: HTMLElement) {
  return [...row.querySelectorAll<HTMLElement>(".page-button-content__text")].filter((text) =>
    text.clientWidth > 0 && text.getClientRects().length > 0 && getComputedStyle(text).visibility === "visible");
}

function rowFits(row: HTMLElement, actions: Element) {
  const { left, right, top, bottom } = row.getBoundingClientRect();
  return right <= actions.getBoundingClientRect().left + 0.25
    && [...row.querySelectorAll("[data-page-button]")].every((button) => {
      const box = button.getBoundingClientRect();
      return box.left >= left - 0.25 && box.right <= right + 0.25 && box.top >= top - 0.25 && box.bottom <= bottom + 0.25;
    });
}

function allNamesFit(row: HTMLElement, expected: readonly string[]) {
  const names = visibleNames(row);
  return names.length === expected.length && names.every((text, index) => {
    const style = getComputedStyle(text);
    const button = text.closest("[data-page-button]")!.getBoundingClientRect();
    return text.textContent === expected[index] && text.scrollWidth <= text.clientWidth
      && style.whiteSpace === "nowrap" && style.textOverflow !== "ellipsis"
      && text.getBoundingClientRect().right <= button.right + 0.25;
  });
}

export async function checkIslandTourPageButtons({ mount, click, settle, check, results, messages }: Tour) {
  const locale = new URLSearchParams(location.search).get("lang") === "en" ? "en" : "zh-CN";
  const t = TRANSLATIONS[locale];
  const { todo, music, clipboard, shelf, translation } = t.island.pageNames;
  const expected = [t.island.agentPage, todo, music, clipboard, shelf, translation, t.messages.title];

  try {
    await act(async () => { mount(); });
    await settle(300);
    await click(".island__open-button");
    await click(".island__agent-button");
    const panel = document.querySelector<HTMLElement>(".island__expanded")!;
    const row = panel.querySelector<HTMLElement>(".editor-dots--icon-label")!;
    const actions = panel.querySelector(".window-actions")!;
    const verifyFullRow = (message: string) => check(allNamesFit(row, expected) && rowFits(row, actions),
      `${locale} ${message}（${row.dataset.pageLabelMode}，${row.clientWidth}px）`);

    check(document.querySelector<HTMLElement>(".island")!.offsetWidth === 560 && panel.offsetWidth === 560
      && actions.querySelectorAll(".icon-button").length === 3, "560px 默认展开岛的 Agent 顶栏含三个操作按钮");
    verifyFullRow("默认宽度下七个页名全部显示，文字和整行均不溢出");

    await click(".dot-button--clipboard");
    verifyFullRow("切到剪贴板后其他页名仍全部显示");
    await click(".island-settings-button");
    await click(".settings-sidebar__item[data-category='appearance']");
    const preview = panel.querySelector<HTMLElement>(".agent-page-preview__dots--icon-label")!;
    check(allNamesFit(preview, expected) && rowFits(preview, preview.nextElementSibling!),
      `${locale} 外观预览的七个页名也全部显示且无溢出`);

    await click(".island__agent-button");
    panel.style.setProperty("--island-font-scale", "1.25");
    panel.style.width = "350px";
    await settle(100);
    check(row.dataset.pageLabelMode === "current" && visibleNames(row).map((text) => text.textContent).join() === t.island.agentPage
      && rowFits(row, actions), `${locale} 大字号和极窄顶栏仅保留当前 Agent 页名`);
    panel.style.width = "290px";
    await settle(100);
    check(row.dataset.pageLabelMode === "icons" && visibleNames(row).length === 0 && rowFits(row, actions)
      && row.querySelectorAll("[data-page-button] svg").length === 7,
    `${locale} 继续缩窄后七个图标都保留`);
    panel.style.removeProperty("--island-font-scale");
    panel.style.removeProperty("width");
    await settle(100);
    verifyFullRow("恢复默认宽度与字号后七个页名全部恢复");

    results.textContent = `${messages.join("\n")}\n\n全部 ${messages.length} 项检查通过。`;
    results.dataset.result = "passed";
  } catch (error) {
    results.textContent = `${messages.join("\n")}\nFAIL ${String(error)}`;
    results.dataset.result = "failed";
  }
}

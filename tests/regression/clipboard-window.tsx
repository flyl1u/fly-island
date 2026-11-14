import "../../src/styles/tokens.css";
import "../../src/styles/base.css";
import { act } from "react";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { createRoot } from "react-dom/client";
import { I18nProvider } from "../../src/i18n";
import { ClipboardWindow } from "../../src/windows/clipboard/ClipboardWindow";
import { DEFAULT_CLIPBOARD_HISTORY } from "../../src/features/clipboard/settings";
import type { ClipboardHistoryItem } from "../../src/features/clipboard/api";

// The standalone clipboard window: own title bar with the pin (on by default), the shared panel filling it.
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const PINNED_KEY = "focusd-island-clipboard-window-pinned";
const automated = new URLSearchParams(location.search).has("test");
localStorage.removeItem(PINNED_KEY);
const items: ClipboardHistoryItem[] = Array.from({ length: 50 }, (_, i) => ({
  id: `item-${i}`, hash: `hash-${i}`, kind: "text", preview: i % 3 === 0 ? `https://example.com/very/long/link/${i}` : `复制的文字 ${i}`,
  createdAt: 0, copiedAt: 0, favorite: i % 7 === 0,
}));
const alwaysOnTop: boolean[] = [];
let shown = 0;
mockWindows("clipboard");
mockIPC((command, payload) => {
  const args = (payload ?? {}) as Record<string, unknown>;
  switch (command) {
    case "get_clipboard_history": return { ...DEFAULT_CLIPBOARD_HISTORY, items };
    case "get_clipboard_shortcut_error": return null;
    case "show_clipboard_window": shown++; return null;
    case "plugin:window|set_always_on_top": alwaysOnTop.push(args.value as boolean); return null;
    case "plugin:window|set_title": return null;
    default: return null;
  }
}, { shouldMockEvents: true });

const messages: string[] = [];
const check = (ok: unknown, label: string) => { messages.push(`${ok ? "PASS" : "FAIL"} ${label}`); };
const frames = (count = 3) => new Promise<void>((resolve) => {
  const step = (left: number) => (left <= 0 ? resolve() : requestAnimationFrame(() => step(left - 1)));
  step(count);
});

const root = createRoot(document.getElementById("root")!);
await act(async () => root.render(<I18nProvider><ClipboardWindow /></I18nProvider>));
await act(async () => { await frames(4); });

if (automated) {
  const pin = () => document.querySelector<HTMLButtonElement>(".clipboard-window__titlebar .clipboard-window__button")!;
  check(alwaysOnTop[0] === true && shown === 1, "打开时先按保存的状态置顶（默认置顶），再显示窗口");
  check(pin().getAttribute("aria-pressed") === "true" && pin().classList.contains("clipboard-window__button--pinned"), "左上角图钉默认是按下的强调色");
  check(document.querySelector(".clipboard-panel--window") && document.querySelectorAll(".clipboard-item").length > 0, "窗口里是同一个剪贴板面板（独立窗口样式）");
  const list = document.querySelector<HTMLElement>(".clipboard-list")!;
  const rootRect = document.getElementById("root")!.getBoundingClientRect();
  check(list.getBoundingClientRect().bottom <= rootRect.bottom + 0.5 && list.scrollHeight > list.clientHeight, "列表在窗口内滚动，不撑出窗口");
  await act(async () => { pin().click(); await frames(2); });
  check(alwaysOnTop[alwaysOnTop.length - 1] === false && localStorage.getItem(PINNED_KEY) === "false" && pin().getAttribute("aria-pressed") === "false", "点图钉取消置顶并记住");
  await act(async () => { pin().click(); await frames(2); });
  check(alwaysOnTop[alwaysOnTop.length - 1] === true && localStorage.getItem(PINNED_KEY) === "true", "再点恢复置顶");
  const results = document.getElementById("results")!;
  const failed = messages.some((line) => line.startsWith("FAIL"));
  results.textContent = `${messages.join("\n")}\n${failed ? "FAILED" : "ALL PASS"}`;
  document.documentElement.dataset.testResult = failed ? "failed" : "passed";
}

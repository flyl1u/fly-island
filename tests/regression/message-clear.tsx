import "../../src/styles/tokens.css";
import "../../src/styles/base.css";
import "../../src/windows/island/IslandApp.css";
import { act, StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import { emit } from "@tauri-apps/api/event";
import { I18nProvider } from "../../src/i18n";
import { MessagesPanel } from "../../src/features/messages/Messages";
import type { MessageSource } from "../../src/features/messages/messagePreview";
import { useMail, type MailController } from "../../src/features/messages/mail/useMail";
import type { MailSnapshot } from "../../src/features/messages/mail/api";
import { useQQNotifications } from "../../src/features/messages/qq-notifications/useQQNotifications";
import { useWeChatReminders } from "../../src/features/messages/wechat/useWeChatReminders";

Object.assign(globalThis, { isTauri: true, IS_REACT_ACT_ENVIRONMENT: true });
const query = new URLSearchParams(location.search);
const en = query.get("lang") === "en";
const preview = query.has("view");
const keys = ["focusd-island-locale", "focusd-island-qq-mail-settings", "focusd-island-qq-notification-access-requested"];
const original = keys.map((key) => localStorage.getItem(key));
window.addEventListener("beforeunload", () => keys.forEach((key, index) => {
  if (original[index] === null) localStorage.removeItem(key); else localStorage.setItem(key, original[index]!);
}));
localStorage.setItem(keys[0], en ? "en" : "zh-CN");
localStorage.setItem(keys[1], JSON.stringify({ accounts: [] }));
localStorage.setItem(keys[2], "true");
let revision = 1;
let qq = { revision, enabled: true, status: "listening", error: null,
  items: [{ id: "qq-1", title: "项目群", body: "请看最新安排", createdAt: Date.now() }] };
let wechat = { revision, enabled: true, status: "listening", pending: true, lastAttentionAt: Date.now(), error: null,
  previewEnabled: true, previewStatus: "ready", hideMinimizedTaskbar: false,
  messages: [{ id: "wechat-1", contact: "协作群", body: "小林：下午开会", receivedAt: Date.now() }] };
let mailState: MailSnapshot = { revision, email: "demo@qq.com", configured: true, enabled: true, syncing: false,
  status: "connected", error: null, unreadCount: 3, lastSyncedAt: Date.now(),
  items: ["a", "b", "c", "read"].map((id, uid) => ({ id, uid, sender: "团队", subject: `工作安排 ${id}`,
    receivedAt: Date.now(), unread: id !== "read" })) };
let failMail = true;
const marked: string[] = [];
let concurrent = 0;
let maxConcurrent = 0;
mockIPC(async (command, payload) => {
  const args = (payload ?? {}) as Record<string, unknown>;
  if (command === "request_qq_notification_access") return "allowed";
  if (command === "set_qq_notifications_enabled" || command === "get_qq_notification_state") return qq;
  if (command === "set_wechat_reminders_enabled" || command === "get_wechat_reminder_state") return wechat;
  if (command === "open_qq" || command === "open_wechat_conversation") return command === "open_qq" ? null : true;
  if (command === "dismiss_qq_contact") return (qq = { ...qq, revision: ++revision, items: qq.items.filter((item) => item.title !== args.title) });
  if (command === "dismiss_wechat_conversation") {
    const contact = wechat.messages.find((item) => item.id === args.messageId)?.contact;
    return (wechat = { ...wechat, revision: ++revision, messages: wechat.messages.filter((item) => item.contact !== contact) });
  }
  if (command === "clear_qq_notifications") return (qq = { ...qq, revision: ++revision, items: [] });
  if (command === "clear_wechat_reminders") return (wechat = { ...wechat, revision: ++revision, pending: false, messages: [] });
  if (command === "get_qq_mail_state") return [mailState];
  if (command === "mark_qq_mail_read") {
    const id = String(args.messageId);
    marked.push(id);
    maxConcurrent = Math.max(maxConcurrent, ++concurrent);
    await Promise.resolve();
    concurrent--;
    if (id === "b" && failMail) throw new Error("mail fixture failure");
    mailState = { ...mailState, revision: ++revision, unreadCount: (mailState.unreadCount ?? 1) - 1,
      items: mailState.items.map((item) => item.id === id ? { ...item, unread: false } : item) };
    return mailState;
  }
  return null;
}, { shouldMockEvents: true });
let setSource: (source: MessageSource) => void;
let mail: MailController;
function Fixture() {
  const [source, changeSource] = useState<MessageSource>((query.get("view") ?? "qq") as MessageSource);
  setSource = changeSource;
  mail = useMail(false);
  const qqController = useQQNotifications(false);
  const wechatController = useWeChatReminders(false);
  return <MessagesPanel source={source} enabledSources={{ qq: true, wechat: true, qqMail: true }}
    onSourceChange={changeSource} qqMail={mail} qqNotifications={qqController} wechatReminders={wechatController} />;
}
const root = createRoot(document.getElementById("fixture")!);
const results = document.getElementById("results")!;
const passed: string[] = [];
const check = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
  passed.push(`PASS ${message}`);
};
const clearLabel = en ? "Mark all read and clear" : "全部已读并清空";
const readLabel = en ? "Mark all read" : "全部标为已读";
const action = (label: string) => document.querySelector<HTMLButtonElement>(`.qq-panel__toolbar button[aria-label="${label}"]`)!;
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 220)); });
try {
  await act(async () => root.render(<StrictMode><I18nProvider><Fixture /></I18nProvider></StrictMode>));
  if (!preview) {
    const fixture = document.getElementById("fixture")!;
    for (const source of ["qq", "wechat", "qqMail"] as const) {
      await act(async () => setSource(source));
      for (const width of [300, 400, 520]) {
        fixture.style.width = `${width}px`;
        const header = document.querySelector<HTMLElement>(".qq-panel__header")!;
        const rect = header.getBoundingClientRect();
        const buttons = [...header.querySelectorAll<HTMLButtonElement>(".qq-panel__toolbar button")];
        check(buttons.every((button) => {
          const box = button.getBoundingClientRect();
          return box.width === 28 && box.height === 28 && box.left >= rect.left && box.right <= rect.right + 1
            && Math.abs(box.top - buttons[0].getBoundingClientRect().top) < 1;
        }) && header.scrollWidth <= header.clientWidth, `${source} ${width}px: 28px actions stay on one line without overflow`);
        const bulk = action(source === "qqMail" ? readLabel : clearLabel);
        const power = header.querySelector(".message-receiver-toggle")!;
        check(Boolean(bulk.compareDocumentPosition(power) & Node.DOCUMENT_POSITION_FOLLOWING)
          && bulk.title === bulk.getAttribute("aria-label"), `${source}: bulk action sits left of Power with localized name`);
      }
    }
    fixture.style.width = "300px";
    const card = (id: string) => document.querySelector<HTMLButtonElement>(`[data-message-id="${id}"] .message-card__surface`);
    const shown = () => [...document.querySelectorAll<HTMLElement>("[data-message-id]")].map((item) => item.dataset.messageId).join();
    await act(async () => setSource("qq"));
    await act(async () => {
      const at = Date.now();
      qq = { ...qq, revision: ++revision, items: [["m3", "小明"], ["h2", "小红"], ["m2", "小明"], ["h1", "小红"], ["m1", "小明"]]
        .map(([id, title], index) => ({ id, title, body: "消息", createdAt: at - index })) };
      await emit("qq-notifications-changed", { snapshot: qq, newestId: null, windowVisible: true });
    });
    await act(async () => card("m2")!.click());
    check(shown() === "h2,h1", "Opening one QQ contact clears that contact's three messages and keeps the other's two");
    await act(async () => setSource("wechat"));
    await act(async () => {
      const at = Date.now();
      wechat = { ...wechat, revision: ++revision, pending: false, messages: [["w3", "小明"], ["w2", "小红"], ["w1", "小明"]]
        .map(([id, contact], index) => ({ id, contact, body: "消息", receivedAt: at - index })) };
      await emit("wechat-reminder-changed", { snapshot: wechat, windowVisible: true });
    });
    await act(async () => card("w1")!.click());
    check(shown() === "w2", "Opening one WeChat conversation clears all of its previews and keeps the others");
    await act(async () => setSource("qq"));
    await act(async () => action(clearLabel).click());
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) check(document.querySelector(".message-card--leaving"), "QQ cards play their exit before removal");
    await act(async () => {
      qq = { ...qq, revision: ++revision, items: [{ id: "qq-new", title: "新通知", body: "清空期间新到消息", createdAt: Date.now() }] };
      await emit("qq-notifications-changed", { snapshot: qq, newestId: null, windowVisible: true });
    });
    await settle();
    check(document.querySelector('[data-message-id="qq-new"]') && !document.querySelector(".message-card--leaving"), "A new QQ notification arriving during exit stays visible");
    await act(async () => action(clearLabel).click());
    await settle();
    check(action(clearLabel).disabled && document.querySelector(".qq-panel__empty") && !document.querySelector(".lucide-trash-2"), "QQ clears to its empty state with a single disabled bulk action");
    await act(async () => setSource("wechat"));
    await act(async () => action(clearLabel).click());
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) check(document.querySelector(".message-card--leaving"), "WeChat preview cards play their exit");
    await settle();
    check(action(clearLabel).disabled && document.querySelector(".wechat-launch"), "WeChat clears pending reminder and previews");
    await act(async () => {
      wechat = { ...wechat, revision: ++revision, pending: true, lastAttentionAt: Date.now() + 1 };
      await emit("wechat-reminder-changed", { snapshot: wechat, windowVisible: true });
    });
    check(!action(clearLabel).disabled && document.querySelector(".message-card"), "WeChat content-free reminder also enables clearing");
    await act(async () => action(clearLabel).click());
    await settle();
    check(action(clearLabel).disabled && !document.querySelector(".message-card"), "WeChat content-free reminder clears");
    await act(async () => setSource("qqMail"));
    await act(async () => action(readLabel).click());
    check(marked.join() === "a,b,c" && maxConcurrent === 1, "Mail marks only unread messages serially and continues after a failure");
    check(mail!.snapshot.items.length === 4 && mail!.snapshot.items.filter((item) => item.unread).map((item) => item.id).join() === "b"
      && document.querySelector("[role=alert]")?.textContent && !action(readLabel).disabled,
      "Mail keeps the list and failed unread message, and shows an error");
    failMail = false;
    await act(async () => action(readLabel).click());
    check(action(readLabel).disabled && marked.join() === "a,b,c,b" && mail!.snapshot.items.length === 4,
      "Retry marks only the remaining unread message and leaves the list intact");
    results.dataset.result = "passed";
    results.textContent = passed.join("\n");
  } else {
    document.getElementById("fixture")!.style.width = `${query.get("width") ?? 300}px`;
    results.textContent = "消息工具栏预览";
  }
} catch (error) {
  results.dataset.result = "failed";
  results.textContent = `${passed.join("\n")}\nFAIL ${String(error)}`;
}

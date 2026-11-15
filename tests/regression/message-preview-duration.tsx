import { act } from "react";
import { createRoot } from "react-dom/client";
import { emit } from "@tauri-apps/api/event";
import { mockIPC } from "@tauri-apps/api/mocks";
import { I18nProvider } from "../../src/i18n";
import { DEFAULT_SETTINGS } from "../../src/features/appearance/settings";
import { useIslandNotices } from "../../src/windows/island/useIslandNotices";

Object.assign(globalThis, { isTauri: true, IS_REACT_ACT_ENVIRONMENT: true });
let seconds = 10;
let now = 1000;
let revision = 0;
let notice!: ReturnType<typeof useIslandNotices>;
const calls: string[] = [];
const realNow = Date.now;
const realTimeout = window.setTimeout;
const realClear = window.clearTimeout;
const timers = new Map<number, { at: number; callback: () => void }>();
let timerId = 0;
Date.now = () => now;
window.setTimeout = ((callback: () => void, delay = 0) => {
  if (delay <= 0) return realTimeout(callback, delay);
  const id = --timerId;
  timers.set(id, { at: now + delay, callback });
  return id;
}) as typeof window.setTimeout;
window.clearTimeout = (id) => { if (id !== undefined) timers.delete(id); realClear(id); };
const wechat = (pending = false) => ({ revision: ++revision, enabled: true, status: "listening", pending,
  lastAttentionAt: pending ? now : null, error: null, previewEnabled: false, previewStatus: "off", hideMinimizedTaskbar: false, messages: [] });
const mail = (id = "") => ({ revision: ++revision, email: "test@qq.com", configured: true, enabled: true, syncing: false,
  status: "connected", unreadCount: id ? 1 : 0, items: id ? [{ id, uid: revision, sender: "Mail", subject: id, receivedAt: now, unread: true }] : [], lastSyncedAt: now, error: null });
mockIPC((command) => {
  calls.push(command);
  if (command === "set_qq_notifications_enabled") return { revision: ++revision, enabled: true, status: "listening", items: [], error: null };
  if (command === "set_wechat_reminders_enabled") return wechat();
  if (command === "get_qq_mail_state") return [mail()];
  if (command === "request_qq_notification_access") return "allowed";
  return null;
}, { shouldMockEvents: true });
function Fixture() {
  notice = useIslandNotices({ ...DEFAULT_SETTINGS, messagePreviewSeconds: seconds }, { mode: "collapsed", isTucked: false, quiet: false });
  return <div>{notice.qqNotifications.preview?.title}{notice.wechatReminders.preview?.source}{notice.qqMail.preview?.subject}</div>;
}
const root = createRoot(document.getElementById("root")!);
const render = () => act(async () => root.render(<I18nProvider><Fixture /></I18nProvider>));
async function notify() {
  await act(async () => {
    await emit("qq-notifications-changed", { snapshot: { revision: ++revision, enabled: true, status: "listening", items: [{ id: String(now), title: "QQ", body: "test", createdAt: now }], error: null }, newestId: String(now), windowVisible: true });
    await emit("wechat-reminder-changed", { snapshot: wechat(true), windowVisible: true });
    await emit("qq-mail-changed", { snapshot: mail(String(now)), newestId: String(now), windowVisible: true });
  });
}
const shown = () => [!!notice.qqNotifications.preview, !!notice.wechatReminders.preview, !!notice.qqMail.preview];
async function advance(ms: number) {
  now += ms;
  await act(async () => {
    for (const [id, timer] of timers) if (timer.at <= now) { timers.delete(id); timer.callback(); }
  });
}
const checks: string[] = [];
const check = (value: unknown, text: string) => { if (!value) throw new Error(text); checks.push(`PASS ${text}`); };
try {
  await render();
  await notify();
  check(shown().every(Boolean), "all three sources accept a preview");
  await advance(5000);
  check(shown().every(Boolean), "ten-second previews remain after the old five-second deadline");
  await advance(4999);
  check(shown().every(Boolean), "all sources remain until ten seconds");
  await advance(1);
  check(shown().every(value => !value), "all sources restore other content at ten seconds");
  await advance(1);
  await notify();
  await advance(9000);
  await notify();
  await advance(9000);
  await notify();
  await advance(2000);
  check(!notice.qqNotifications.preview && !notice.qqMail.preview && !!notice.wechatReminders.preview,
    "QQ and mail stop at twice the duration while WeChat restarts per reminder");
  const connectionCount = calls.length;
  seconds = 3;
  await render();
  check(calls.length === connectionCount, "editing duration does not reconnect clients");
  await notify();
  await advance(3000);
  check(shown().every(value => !value), "all sources use the new duration on their next notification");
  document.documentElement.dataset.testResult = "passed";
} catch (error) {
  checks.push(`FAIL ${String(error)}`);
  document.documentElement.dataset.testResult = "failed";
} finally {
  await act(async () => root.unmount());
  Date.now = realNow;
  window.setTimeout = realTimeout;
  window.clearTimeout = realClear;
  document.getElementById("results")!.textContent = checks.join("\n");
}

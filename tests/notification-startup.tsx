// Open /tests/notification-startup.html with pnpm dev to run the browser regression checks.
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import { QQNotificationControls, useQQNotifications, type QQNotificationsController } from "../src/features/messages/qq-notifications/QQNotifications";
import { WeChatReminderControls, useWeChatReminders, type WeChatRemindersController } from "../src/features/messages/wechat/WeChatReminders";

Object.assign(globalThis, { isTauri: true, IS_REACT_ACT_ENVIRONMENT: true });
const keys = ["focusd-island-qq-notifications-enabled", "focusd-island-wechat-reminders-enabled", "focusd-island-qq-notification-access-requested"];
const original = keys.map((key) => localStorage.getItem(key));
const messages: string[] = [];
const calls: { command: string; args: Record<string, unknown> }[] = [];
let permission = "allowed";
let revision = 0;
let qq: QQNotificationsController;
let wechat: WeChatRemindersController;
let root: Root | undefined;

mockIPC((command, payload) => {
  const args = (payload ?? {}) as Record<string, unknown>;
  calls.push({ command, args });
  if (command === "request_qq_notification_access") return permission;
  if (command === "set_qq_notifications_enabled") return {
    revision: ++revision, enabled: args.enabled,
    status: !args.enabled ? "disabled" : permission === "allowed" ? "listening" : permission === "denied" ? "permissionDenied" : "permissionRequired",
    items: [], error: null,
  };
  if (command === "set_wechat_reminders_enabled") return {
    revision: ++revision, enabled: args.enabled, status: args.enabled ? "listening" : "disabled",
    pending: false, lastAttentionAt: null, error: null,
  };
}, { shouldMockEvents: true });

function Fixture() {
  qq = useQQNotifications(true);
  wechat = useWeChatReminders(true);
  return <><QQNotificationControls controller={qq} /><WeChatReminderControls controller={wechat} /></>;
}

async function mount() {
  if (root) await act(async () => root!.unmount());
  root = createRoot(document.getElementById("fixture")!);
  await act(async () => { root!.render(<StrictMode><Fixture /></StrictMode>); });
}

function reset(access: string) {
  keys.forEach((key) => localStorage.removeItem(key));
  calls.length = 0;
  permission = access;
}

function check(condition: unknown, label: string) {
  if (!condition) throw new Error(label);
  messages.push(`PASS ${label}`);
}

const requests = () => calls.filter((call) => call.command === "request_qq_notification_access").length;

try {
  reset("allowed");
  await mount();
  check(qq!.snapshot.enabled && wechat!.snapshot.enabled, "首次启动 QQ 与微信均默认开启");
  check(requests() === 1, "StrictMode 初始化只请求一次通知访问");
  await mount();
  check(requests() === 1, "后续启动不会重复发起授权请求");

  await act(async () => { await qq!.setEnabled(false); await wechat!.setEnabled(false); });
  check(keys.slice(0, 2).every((key) => localStorage.getItem(key) === "false"), "关闭偏好持久化到原有存储键");
  await mount();
  check(!qq!.snapshot.enabled && !wechat!.snapshot.enabled && requests() === 1, "关闭后重启仍关闭，不申请授权");

  reset("allowed");
  localStorage.setItem(keys[0], "false");
  localStorage.setItem(keys[1], "false");
  await mount();
  check(!qq!.snapshot.enabled && !wechat!.snapshot.enabled && requests() === 0, "升级保留已有关闭偏好");
  await act(async () => { await qq!.setEnabled(true); });
  check(qq!.snapshot.enabled && !wechat!.snapshot.enabled && requests() === 1, "重新启用 QQ 不影响微信开关");

  reset("denied");
  await mount();
  check(qq!.snapshot.enabled && qq!.snapshot.status === "permissionDenied" && !qq!.busy, "拒绝授权后保留接收偏好并显示权限状态");
  await mount();
  check(requests() === 1, "拒绝授权后重启不会重复请求");
  await act(async () => { await qq!.openSettings(); });
  check(calls.some((call) => call.command === "open_qq_notification_settings" && call.args.access === true), "权限被拒时打开对应 Windows 权限设置");

  reset("unspecified");
  await mount();
  await mount();
  check(requests() === 1 && qq!.snapshot.status === "permissionRequired", "关闭授权弹窗后不重复请求，并保留手动授权入口");
  await act(async () => { await qq!.requestAccess(); });
  check(requests() === 2, "用户可手动重新发起授权");

  document.getElementById("results")!.textContent = `${messages.join("\n")}\n\n全部 ${messages.length} 项检查通过。`;
} catch (error) {
  document.getElementById("results")!.textContent = `${messages.join("\n")}\nFAIL ${String(error)}`;
  console.error(error);
} finally {
  keys.forEach((key, index) => original[index] === null ? localStorage.removeItem(key) : localStorage.setItem(key, original[index]!));
}

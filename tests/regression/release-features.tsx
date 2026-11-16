import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import { I18nProvider } from "../../src/i18n";
import { PLUGINS_ENABLED, MAIL_OTP_ENABLED } from "../../src/features/releaseFlags.ts";
import { usePlugins, refreshPlugins } from "../../src/features/plugins/usePlugins";
import { useEffortLabels } from "../../src/features/agent-status/useEffortLabels";
import { useMailOtp } from "../../src/features/messages/mail/useMailOtp";
import type { MailEvent } from "../../src/features/messages/mail/api";
import "../../src/styles/tokens.css";

Object.assign(globalThis, { isTauri: true, IS_REACT_ACT_ENVIRONMENT: true });
const calls: string[] = [];
const errors: string[] = [];
mockIPC((command) => { calls.push(command); return null; }, { shouldMockEvents: true });
let otp: ReturnType<typeof useMailOtp>;
function Probe() {
  const plugins = usePlugins();
  const labels = useEffortLabels();
  otp = useMailOtp(true, (message) => errors.push(message));
  return <output>{JSON.stringify({ plugins, labels })}</output>;
}
const messages: string[] = [];
function check(condition: unknown, label: string) {
  if (!condition) throw new Error(label);
  messages.push(`PASS ${label}`);
}
const root = createRoot(document.getElementById("fixture")!);
try {
  check(!PLUGINS_ENABLED && !MAIL_OTP_ENABLED, "正式构建的两个开关关闭");
  await act(async () => root.render(<StrictMode><I18nProvider><Probe /></I18nProvider></StrictMode>));
  await act(async () => { await refreshPlugins(); });
  check(calls.length === 0, "岛上挂载插件消费者不会请求宿主、索引或订阅事件");
  check(document.querySelector("output")?.textContent?.includes('"installed":{}'), "插件快照为空，不产生会话、额度和消息入口");
  const event: MailEvent = {
    snapshot: { email: "test@example.com", configured: true, enabled: true, syncing: false,
      revision: 1, status: "connected", unreadCount: 1, lastSyncedAt: Date.now(), error: null,
      items: [{ id: "7:2", uid: 2, sender: "security@example.com", subject: "Verification code",
        receivedAt: Date.now(), unread: true, otpCode: "834921" }] },
    newestId: "7:2", otpMessageId: "7:2", windowVisible: true,
  };
  await act(async () => {
    otp!.copyArrival(event);
    check(await otp!.copyOtp("834921") === false, "关闭时手动复制也不会写剪贴板");
  });
  check(!calls.includes("copy_mail_otp") && errors.length === 0 && otp!.copiedOtp === null,
    "旧设置启用自动复制且收到带验证码的旧快照时，不复制、不报错");
  await act(async () => root.unmount());
  document.documentElement.dataset.testResult = "passed";
} catch (error) {
  messages.push(`FAIL ${String(error)}`);
  document.documentElement.dataset.testResult = "failed";
}
document.getElementById("results")!.textContent = messages.join("\n");

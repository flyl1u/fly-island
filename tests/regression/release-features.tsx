import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import { I18nProvider } from "../../src/i18n";
import { PLUGINS_ENABLED, MAIL_OTP_ENABLED, PLUGIN_MARKET_ENABLED } from "../../src/features/releaseFlags.ts";
import { NATIVE_PLUGINS_KEY, useNativePlugins } from "../../src/features/plugins/native";
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
let nativeInstalled: ReturnType<typeof useNativePlugins> | null = null;
function Probe() {
  const plugins = usePlugins();
  nativeInstalled = useNativePlugins();
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
  // The plugin market is open in stable builds from 3.2.8 on; plugins and the mail OTP stay off.
  check(!PLUGINS_ENABLED && !MAIL_OTP_ENABLED && PLUGIN_MARKET_ENABLED, "正式构建开放审核过的市场包，开发者模式与验证码复制关闭");
  // A beta's installs stay saved but count for nothing in a stable build.
  localStorage.setItem(NATIVE_PLUGINS_KEY, JSON.stringify(["dingtalk", "zcode"]));
  await act(async () => root.render(<StrictMode><I18nProvider><Probe /></I18nProvider></StrictMode>));
  await act(async () => { await refreshPlugins(); });
  check(calls.includes("get_plugins") && !calls.includes("get_plugins_index") && !calls.includes("configure_plugins"), "正式版读取市场包状态，启动时不请求索引或打开开发者模式");
  const installed = nativeInstalled as ReturnType<typeof useNativePlugins> | null;
  check(installed?.dingtalk && installed.zcode && !installed.cursor, "测试版装过的内置插件在正式版里仍算已安装");
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

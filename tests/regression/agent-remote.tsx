// pnpm dev, then open /tests/regression/agent-remote.html. Settings → AI Agent → Remote computers
// on its own, against an in-memory native side: Hosts from ~/.ssh/config, adding and removing a
// computer by address, refreshing, and the empty page. ?empty shows the page with no hosts.
import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import "../../src/styles/tokens.css";
import "../../src/components/settings/SettingsGroup.css";
import { I18nProvider, LOCALE_STORAGE_KEY } from "../../src/i18n";
import { AgentRemoteHostsSettings } from "../../src/features/agent-status/AgentRemoteHostsSettings";
import type { CustomRemoteHost, RemoteHostStatus } from "../../src/features/agent-status/api";

const savedLocale = localStorage.getItem(LOCALE_STORAGE_KEY);
localStorage.setItem(LOCALE_STORAGE_KEY, "zh-CN");
window.addEventListener("beforeunload", () => {
  if (savedLocale === null) localStorage.removeItem(LOCALE_STORAGE_KEY);
  else localStorage.setItem(LOCALE_STORAGE_KEY, savedLocale);
});
Object.assign(globalThis, { isTauri: true, IS_REACT_ACT_ENVIRONMENT: true });

let configHosts = ["devbox", "nas"];
let custom: CustomRemoteHost[] = [];
let chosen = ["devbox"];
const calls: { command: string; args: Record<string, unknown> }[] = [];
const status = (host: string): RemoteHostStatus =>
  host === "devbox" ? { host, fetchedAt: Date.UTC(2026, 10, 7, 8), error: null, fetching: false, sessions: 3 }
    : host === "nas" ? { host, fetchedAt: null, error: "Permission denied (publickey)", fetching: false, sessions: 0 }
    : { host, fetchedAt: null, error: null, fetching: true };
mockIPC((command, payload) => {
  const args = (payload ?? {}) as Record<string, unknown>;
  calls.push({ command, args });
  switch (command) {
    case "list_ssh_hosts": return configHosts;
    case "get_agent_custom_hosts": return custom;
    case "get_agent_remote_hosts": return chosen.map(status);
    case "set_agent_remote_hosts": chosen = args.hosts as string[]; return chosen;
    case "add_agent_remote_host": {
      const added = args.host as CustomRemoteHost;
      const name = added.name || added.host;
      custom = [...custom.filter((known) => known.name !== name), { ...added, name }];
      if (!chosen.includes(name)) chosen = [...chosen, name];
      return custom;
    }
    case "remove_agent_remote_host":
      custom = custom.filter((known) => known.name !== args.name);
      chosen = chosen.filter((host) => host !== args.name);
      return custom;
    case "refresh_agent_remote_hosts": return null;
    default: throw new Error(`Unexpected command ${command}`);
  }
});

const messages: string[] = [];
const check = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
  messages.push(`PASS ${message}`);
};
const host = document.getElementById("page")!;
const root = createRoot(host);
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
const mount = async () => {
  await act(async () => { root.render(<StrictMode><I18nProvider><AgentRemoteHostsSettings /></I18nProvider></StrictMode>); });
  await settle();
};
const rows = () => [...host.querySelectorAll<HTMLElement>(".settings-row")];
const row = (name: string) => rows().find((found) => found.querySelector(".settings-row__title")?.textContent === name);
const button = (text: string) => [...host.querySelectorAll<HTMLButtonElement>("button")].find((found) => found.textContent?.trim() === text);
const field = (label: string) => [...host.querySelectorAll<HTMLLabelElement>(".agent-remote__field")].find((found) => found.textContent?.startsWith(label))!.querySelector("input")!;
const type = async (input: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => { setter.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
};
const called = (command: string) => calls.filter((call) => call.command === command);
const last = (command: string) => called(command)[called(command).length - 1];

try {
  if (new URLSearchParams(location.search).has("empty")) { configHosts = []; chosen = []; await mount(); throw "manual"; }
  await mount();
  check(host.querySelector(".agent-remote__intro")?.textContent?.includes("服务器上不用安装任何东西"), "The page opens with what it does and what it needs");
  check(row("devbox")?.textContent?.includes("来自 ~/.ssh/config") && row("devbox")?.textContent?.includes("3 个会话")
    && row("devbox")?.querySelector<HTMLInputElement>("[role='switch']")?.checked, "A chosen Host says where it comes from, when it was read and how many sessions it has");
  check(row("nas") && !row("nas")!.querySelector<HTMLInputElement>("[role='switch']")!.checked && !row("nas")!.querySelector(".agent-remote__remove"),
    "A Host that is off can be switched on, but not removed: it lives in ~/.ssh/config");
  await act(async () => { row("nas")!.querySelector<HTMLInputElement>("[role='switch']")!.click(); });
  await settle();
  check(JSON.stringify(last("set_agent_remote_hosts")?.args.hosts) === '["devbox","nas"]', "Switching a Host on chooses it with the others");
  check(row("nas")?.querySelector(".agent-remote__error")?.textContent?.includes("Permission denied"), "A host that failed shows why");

  await act(async () => { button("立即刷新")!.click(); });
  check(called("refresh_agent_remote_hosts").length === 1, "Refresh now asks for every host to be read again");

  await act(async () => { button("添加主机")!.click(); });
  const submit = () => host.querySelector<HTMLButtonElement>(".agent-remote__submit")!;
  check(submit().disabled && host.querySelector(".agent-remote__hint")?.textContent?.includes("不会改 ~/.ssh/config"),
    "The add form needs an address and says ~/.ssh/config is left alone");
  await type(field("主机地址"), " 10.0.0.5 ");
  await type(field("端口"), "99999");
  check(submit().disabled, "A port out of range cannot be added");
  await type(field("端口"), "2222");
  await type(field("用户名"), "louis");
  await act(async () => { submit().click(); });
  await settle();
  const added = last("add_agent_remote_host")?.args.host as CustomRemoteHost | undefined;
  check(added?.host === "10.0.0.5" && added.port === 2222 && added.user === "louis" && added.name === "", "Adding sends the trimmed address, port and user");
  check(!host.querySelector(".agent-remote__form") && row("10.0.0.5")?.textContent?.includes("louis@10.0.0.5:2222")
    && row("10.0.0.5")?.querySelector<HTMLInputElement>("[role='switch']")?.checked, "The added computer is listed by its address, switched on, and the form closes");

  await act(async () => { row("10.0.0.5")!.querySelector<HTMLButtonElement>(".agent-remote__remove")!.click(); });
  await settle();
  check(last("remove_agent_remote_host")?.args.name === "10.0.0.5" && !row("10.0.0.5"), "An added computer can be removed");

  configHosts = []; chosen = []; custom = [];
  await act(async () => { root.unmount(); });
  const emptyRoot = createRoot(host);
  await act(async () => { emptyRoot.render(<StrictMode><I18nProvider><AgentRemoteHostsSettings /></I18nProvider></StrictMode>); });
  await settle();
  check(row("还没有主机")?.textContent?.includes("~/.ssh/config") && button("添加主机") && !button("立即刷新"),
    "With no hosts the page says how to add one, and has nothing to refresh");

  document.documentElement.dataset.testResult = "passed";
} catch (error) {
  if (error !== "manual") {
    document.documentElement.dataset.testResult = "failed";
    messages.push(`FAIL ${String(error)}`);
    console.error(error);
  }
} finally {
  document.getElementById("results")!.textContent = messages.join("\n");
}

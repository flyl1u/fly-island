import { act } from "react";
import { commands, setMockWorkbuddy } from "./settingsMocks";

export async function checkQuotaSettings(check: (condition: unknown, message: string) => void, openPage: (category: string) => Promise<void>) {
  await openPage("agents");
  const quota = document.querySelector(".agent-quota-settings")!;
  const inputs = [...quota.querySelectorAll<HTMLInputElement>("input[type=checkbox]")];
  check(inputs.length === 4 && inputs.every((input) => input.checked) &&
    [...quota.querySelectorAll("label")].map((label) => label.textContent).join() === "Claude,Codex,DSH,WorkBuddy", "Quota rings offers four sources, all selected by default");
  for (const input of inputs) await act(async () => input.click());
  const settings = JSON.parse(localStorage.getItem("focusd-island-settings") ?? "{}");
  check(settings.agentQuotaSources.length === 0 && settings.agentShowDsh === true, "Clearing all rings persists independently of DSH sessions");

  await openPage("agentConnect");
  const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>(".editor-panel button")].find((item) => item.textContent === label);
  await act(async () => button("登录 WorkBuddy")?.click());
  check(commands.includes("open_workbuddy_login"), "WorkBuddy sign-in opens from the Connection page");
  await act(async () => setMockWorkbuddy({ status: "loginRequired" }));
  const status = document.querySelector(".workbuddy-connection__status")?.textContent;
  check(status?.includes("已过期") && button("登录 WorkBuddy"), `Expired WorkBuddy sign-in shows a sign-in action (${status})`);
  await act(async () => setMockWorkbuddy({ status: "unavailable" }));
  await act(async () => button("重试")?.click());
  check(button("刷新积分") && button("断开连接"), "Retry can recover WorkBuddy credit display");
  await act(async () => button("断开连接")?.click());
  check(button("登录 WorkBuddy") && !button("断开连接"), "Disconnect returns the WorkBuddy section to signed out");

  await openPage("agents");
  const revisited = [...document.querySelectorAll<HTMLInputElement>(".agent-quota-settings input")];
  check(revisited.every((input) => !input.checked), "The empty ring selection survives reopening Settings");
  for (const input of revisited) await act(async () => input.click());
}

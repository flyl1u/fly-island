import { act } from "react";
import { commands, setMockWorkbuddy } from "./settingsMocks";

export async function checkQuotaSettings(check: (condition: unknown, message: string) => void, openPage: (category: string) => Promise<void>) {
  await openPage("agents");
  const quota = document.querySelector(".agent-quota-settings")!;
  const inputs = [...quota.querySelectorAll<HTMLInputElement>("input[type=checkbox]")];
  check(inputs.length === 4 && inputs.every((input) => input.checked) &&
    [...quota.querySelectorAll("label")].map((label) => label.textContent).join() === "Claude,Codex,DSH,WorkBuddy", "Quota rings offers four sources, all selected by default");
  for (const input of inputs) await act(async () => input.click());
  const settings = JSON.parse(localStorage.getItem("fly-island-settings") ?? "{}");
  // Kimi Code, Z Code and Antigravity have no box until installed; their saved choice is left as it was.
  check(settings.agentQuotaSources.every((source: string) => source === "kimiCode" || source === "zcode" || source === "antigravity" || source === "relay") && settings.agentShowDsh === true,
    "Clearing all rings persists independently of DSH sessions");

  // WorkBuddy's sign-in sits under its session source, and only while that source is on.
  const signInStatus = () => document.querySelector(".workbuddy-sign-in__status");
  const button = (label: string) => [...(signInStatus()?.closest(".settings-row")?.querySelectorAll<HTMLButtonElement>("button") ?? [])]
    .find((item) => item.textContent === label);
  const status = () => signInStatus()?.textContent;
  check(status() === "未登录 WorkBuddy" && button("去登录"), `The WorkBuddy source shows it is not signed in (${status()})`);
  await act(async () => button("去登录")?.click());
  check(commands.includes("open_workbuddy_login"), "Sign in opens WorkBuddy's sign-in window");
  const connected = { status: "connected", usage: { remaining: 50, total: 500, updatedAt: Date.now() } } as const;
  await act(async () => setMockWorkbuddy(connected));
  await act(async () => setMockWorkbuddy({ status: "unavailable" }));
  check(button("重试") && !button("去登录") && !status()?.includes("已过期"),
    `A transient WorkBuddy failure offers Retry (${status()})`);
  await act(async () => button("重试")?.click());
  check(status() === "已登录 WorkBuddy" && button("退出登录"), "Retry recovers the WorkBuddy credits");
  await act(async () => setMockWorkbuddy({ status: "loginRequired" }));
  check(status()?.includes("已过期") && button("去登录"), `A confirmed WorkBuddy expiry offers to sign in again (${status()})`);
  await act(async () => setMockWorkbuddy(connected));
  await act(async () => button("退出登录")?.click());
  check(button("去登录") && !button("退出登录"), "Signing out returns WorkBuddy to signed out");
  const source = [...document.querySelectorAll(".settings-row")].find((row) => row.querySelector(".settings-row__title")?.textContent === "WorkBuddy");
  await act(async () => source?.querySelector<HTMLInputElement>("input[role=switch]")?.click());
  check(!document.querySelector(".workbuddy-sign-in__status") && JSON.parse(localStorage.getItem("fly-island-settings")!).agentShowWorkbuddy === false,
    "Switching the WorkBuddy source off hides its sign-in and saves the choice");
  await act(async () => source?.querySelector<HTMLInputElement>("input[role=switch]")?.click());

  await openPage("agentConnect");
  check(!document.querySelector(".workbuddy-sign-in__status") && !document.querySelector(".editor-panel")?.textContent?.includes("WorkBuddy"),
    "The Connect AI tools page has no WorkBuddy section");

  await openPage("agents");
  const revisited = [...document.querySelectorAll<HTMLInputElement>(".agent-quota-settings input")];
  check(revisited.every((input) => !input.checked), "The empty ring selection survives reopening Settings");
  for (const input of revisited) await act(async () => input.click());
}

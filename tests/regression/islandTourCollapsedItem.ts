import { act } from "react";

export async function checkCollapsedItemSwitch(check: (condition: unknown, label: string) => void, settle: (ms: number) => Promise<void>) {
  const key = "fly-island-settings";
  const settings = localStorage.getItem(key)!;
  const light = () => document.querySelector<HTMLButtonElement>(".island__agent-light")!;
  const active = (selector: string) => document.querySelector(`.island__summary-layer:last-child ${selector}`);
  const expanded = () => Boolean(document.querySelector(".island--expanded"));
  const toggleLyrics = (enabled: boolean) => act(async () => {
    localStorage.setItem(key, JSON.stringify({ ...JSON.parse(settings), lyricsOnline: enabled }));
    window.dispatchEvent(new StorageEvent("storage", { key }));
  });
  for (let attempt = 0; attempt < 6 && !active(".island__agent-session"); attempt++) await settle(500);
  check(active(".island__agent-session") && light().getAttribute("aria-label")?.includes("AI Agent"),
    `Priority initially shows the agent while todos and lyrics are available (${light().getAttribute("aria-label")}; ${document.querySelector(".island__summary")?.textContent})`);
  check(!light().hasAttribute("title") && getComputedStyle(light()).cursor === "default", "The status light adds neither tooltip nor cursor feedback");
  check(!light().dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 })), "The status light does not take DOM focus on a mouse press");
  const hit = () => light().dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0, detail: 1 }));
  await act(async () => { hit(); });
  check(active(".collapsed-lyric") && !expanded() && light().getAttribute("aria-label")?.includes("歌词"), "Clicking the light moves from the agent to lyrics without expanding");
  const motion = document.querySelector(".island__summary-layer--outgoing");
  check(matchMedia("(prefers-reduced-motion: reduce)").matches || motion?.querySelector(".island__agent-session"), "Leaving content fades from its previous snapshot");
  await toggleLyrics(false);
  check(active(".island__agent-session") && !active(".collapsed-lyric"), "When the chosen lyrics disappear, the summary returns to priority");
  await toggleLyrics(true);
  await settle(400);
  check(active(".island__agent-session"), "Newly available lyrics do not restore the cleared choice");
  await act(async () => { light().click(); });
  check(active(".collapsed-lyric"), "A detail-zero keyboard click also switches the summary");
  await act(async () => { hit(); });
  check(active(".island__todo-count") && !expanded(), "The cycle also shows pending todos ahead of the agent when chosen");
  await act(async () => { hit(); });
  check(active(".island__agent-session") && localStorage.getItem(key) === settings, "The cycle wraps to the agent without saving a preference");
}

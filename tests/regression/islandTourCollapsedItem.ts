import { act } from "react";
import { WHEEL_SWITCH_COOLDOWN_MS, WHEEL_SWITCH_THRESHOLD } from "../../src/windows/island/collapsedWheel";

export async function checkCollapsedItemSwitch(check: (condition: unknown, label: string) => void, settle: (ms: number) => Promise<void>) {
  const key = "fly-island-settings";
  const settings = localStorage.getItem(key)!;
  const light = () => document.querySelector<HTMLButtonElement>(".island__agent-light")!;
  const active = (selector: string) => document.querySelector(`.island__summary-layer:last-child ${selector}`);
  const expanded = () => Boolean(document.querySelector(".island--expanded"));
  const save = (patch: Record<string, unknown>) => act(async () => {
    localStorage.setItem(key, JSON.stringify({ ...JSON.parse(settings), ...patch }));
    window.dispatchEvent(new StorageEvent("storage", { key }));
  });
  /** One wheel event over the island; true when the island kept it from the page. */
  const wheel = async (deltaY: number) => {
    let kept = false;
    await act(async () => {
      kept = !document.querySelector(".island__open-button")!.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY }));
    });
    return kept;
  };
  const rest = () => settle(WHEEL_SWITCH_COOLDOWN_MS + 100);

  for (let attempt = 0; attempt < 6 && !active(".island__agent-session"); attempt++) await settle(500);
  check(active(".island__agent-session") && light().getAttribute("aria-label") === "AI Agent",
    `Priority initially shows the agent while todos and lyrics are available; the light is the Agent button again (${light().getAttribute("aria-label")})`);
  check(!light().hasAttribute("title") && getComputedStyle(light()).cursor === "default", "The status light adds neither tooltip nor cursor feedback");

  check(await wheel(100), "The collapsed island keeps its wheel events from the page");
  check(active(".collapsed-lyric") && !expanded(), "Scrolling down moves from the agent to lyrics without expanding");
  const motion = document.querySelector(".island__summary-layer--outgoing");
  check(matchMedia("(prefers-reduced-motion: reduce)").matches || motion?.querySelector(".island__agent-session"), "Leaving content fades from its previous snapshot");
  await rest();
  await wheel(-100);
  check(active(".island__agent-session"), "Scrolling up goes back");
  await rest();
  await wheel(-100);
  check(active(".island__todo-count") && !expanded(), "Scrolling up from the first item wraps to pending todos");
  await rest();

  // A touchpad: many small deltas, going on through and past the cooldown.
  const delta = WHEEL_SWITCH_THRESHOLD / 5;
  for (let step = 0; step < 4; step++) await wheel(delta);
  check(active(".island__todo-count"), "Small deltas below the threshold switch nothing");
  for (let step = 0; step < 6; step++) await wheel(delta);
  check(active(".island__agent-session"), "Once past the threshold they switch exactly once, however many follow");
  await rest();

  await wheel(100);
  check(active(".collapsed-lyric"), "A new gesture after the cooldown switches again");
  await save({ lyricsOnline: false });
  check(active(".island__agent-session") && !active(".collapsed-lyric"), "When the chosen lyrics disappear, the summary returns to priority");
  await save({});
  await rest();
  check(active(".island__agent-session"), "Newly available lyrics do not restore the cleared choice");
  // Both lyric sources off: the Chinese one would find the song again.
  await save({ lyricsOnline: false, lyricsChinese: false, showIdleTodoCount: false });
  await rest();
  await wheel(100);
  check(active(".island__agent-session") && !expanded(), "With only one thing to show the wheel changes nothing");
  await save({});
  await rest();
  check(localStorage.getItem(key) === settings, "Switching saves no preference");
}

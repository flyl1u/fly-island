// Runs the demo script on a loop and hands control to the visitor. Any real click, tap, scroll or
// key press in the demo stops the pretend mouse; after 4.5 seconds without one it picks up again
// with the next page. The website around the demo (an iframe) talks to it with postMessage: it
// picks a page from its taskbar, pauses and resumes the tour, and holds it while scrolled away; the
// demo reports which page is showing.
import type { IslandPage } from "../src/windows/island/types";
import { createActor, Interrupted } from "./actor";
import type { DemoContent } from "./demoData";
import { PAGE_BUTTONS, segmentAfter, segments } from "./script";

const RESUME_AFTER_MS = 4_500;

export type TourMode = "auto" | "manual" | "paused";

type FromSite =
  | { type: "island-demo:show"; page: IslandPage }
  | { type: "island-demo:pause" }
  | { type: "island-demo:play" }
  | { type: "island-demo:hold"; held: boolean };

export function startTour(data: DemoContent, reduced: boolean) {
  const cursor = document.createElement("div");
  cursor.className = "demo-cursor";
  cursor.setAttribute("aria-hidden", "true");
  cursor.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M4.04 2.85a.85.85 0 0 1 1.11-.81l15.4 5.62a.85.85 0 0 1-.04 1.61l-6.3 1.97a1.7 1.7 0 0 0-1.12 1.12l-1.97 6.3a.85.85 0 0 1-1.61.04Z" fill="#fff" stroke="#1d1f24" stroke-width="1.4" stroke-linejoin="round"/></svg>';
  document.body.append(cursor);

  let mode: TourMode = reduced ? "paused" : "auto";
  let token = 0;
  let siteHeld = false;
  let resumeTimer = 0;
  let lastPage: IslandPage | null = null;
  const clock = { token: 0, current: () => token, held: () => siteHeld || document.hidden };

  const post = (message: Record<string, unknown>) => {
    if (window.parent !== window) window.parent.postMessage(message, location.origin);
  };
  const setMode = (next: TourMode) => {
    mode = next;
    cursor.dataset.visible = String(next === "auto");
    post({ type: "island-demo:mode", mode: next });
  };

  async function run(from: number) {
    const mine = ++token;
    const actor = createActor(cursor, { ...clock, token: mine });
    try {
      for (let index = from; ; index = (index + 1) % segments.length) {
        await segments[index].run(actor, data);
      }
    } catch (error) {
      if (!(error instanceof Interrupted)) throw error;
    }
  }

  const resume = () => {
    window.clearTimeout(resumeTimer);
    setMode("auto");
    void run(segmentAfter(lastPage));
  };

  /** The visitor did something: stop the pretend mouse and start the 4.5 second count again. */
  const takeOver = () => {
    if (mode === "paused") return;
    token++;
    setMode("manual");
    window.clearTimeout(resumeTimer);
    resumeTimer = window.setTimeout(resume, RESUME_AFTER_MS);
  };
  for (const type of ["pointerdown", "keydown", "wheel", "touchstart"]) {
    window.addEventListener(type, (event) => { if (event.isTrusted) takeOver(); }, { capture: true, passive: true });
  }

  window.addEventListener("message", (event: MessageEvent<FromSite>) => {
    if (event.origin !== location.origin || typeof event.data?.type !== "string") return;
    const message = event.data;
    if (message.type === "island-demo:hold") siteHeld = message.held;
    if (message.type === "island-demo:pause") {
      token++;
      window.clearTimeout(resumeTimer);
      setMode("paused");
    }
    if (message.type === "island-demo:play") resume();
    if (message.type === "island-demo:show" && PAGE_BUTTONS[message.page]) {
      const wasPaused = mode === "paused";
      takeOver();
      if (wasPaused) setMode("paused");
      // Straight to the page, without the pretend mouse.
      const instant = createActor(cursor, { token: token, current: () => token, held: () => false });
      void (async () => {
        try {
          if (!document.querySelector(".island--expanded")) document.querySelector<HTMLElement>(".island__open-button")?.click();
          // The page buttons appear once the island has opened.
          (await instant.find(PAGE_BUTTONS[message.page]))?.click();
        } catch (error) {
          if (!(error instanceof Interrupted)) throw error;
        }
      })();
    }
  });

  // Report the page, whether the island is open and how far down it reaches whenever its classes or
  // size change; the site sizes the iframe to fit.
  const report = () => {
    const island = document.querySelector(".island");
    if (!island) return;
    const expanded = island.classList.contains("island--expanded");
    const page = (Object.keys(PAGE_BUTTONS) as IslandPage[]).find((name) => island.classList.contains(`island--${name}`)) ?? null;
    if (expanded && page) lastPage = page;
    post({ type: "island-demo:state", expanded, page, bottom: Math.ceil(island.getBoundingClientRect().bottom) });
  };
  const observer = new MutationObserver(report);
  const resizes = new ResizeObserver(report);
  const watch = () => {
    const island = document.querySelector(".island");
    if (!island) return void setTimeout(watch, 50);
    observer.observe(island, { attributes: true, attributeFilter: ["class"] });
    resizes.observe(island);
    report();
    post({ type: "island-demo:ready" });
    setMode(mode);
    if (mode === "auto") {
      // Give the page a moment, then start from the collapsed island.
      void (async () => {
        const actor = createActor(cursor, { ...clock, token: token });
        try {
          await actor.rest();
          await actor.wait(1400);
          if (mode === "auto") void run(0);
        } catch (error) {
          if (!(error instanceof Interrupted)) throw error;
        }
      })();
    }
  };
  watch();
}

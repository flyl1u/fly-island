// The website's live demo: the real island, with the native side mocked (mocks.ts) and a pretend
// mouse showing it off (tour.ts). Built on its own with `pnpm build:web-demo` and embedded in the
// website as an iframe; ?lang=en switches the interface and the content.
import React from "react";
import ReactDOM from "react-dom/client";
import "../src/styles/tokens.css";
import "../src/styles/fonts.css";
import "../src/styles/base.css";
import "./demo.css";
import { I18nProvider, LOCALE_STORAGE_KEY } from "../src/i18n";
import { IslandApp } from "../src/windows/island/IslandApp";
import { trackIslandTopEdge } from "../src/windows/island/topEdge";
import { installSameWindowStorageEvents } from "../src/lib/sameWindowStorageEvents";
import { demoData } from "./demoData";
import { installDemoMocks } from "./mocks";
import { startTour } from "./tour";

const query = new URLSearchParams(location.search);
const language = query.get("lang") === "en" ? "en" : "zh";
const data = demoData[language];
Object.assign(globalThis, { isTauri: true });

// Every visit starts from the same island: clear what an earlier visit left, then write the demo's
// own settings and tasks.
for (const key of Object.keys(localStorage)) if (key.startsWith("focusd-island-")) localStorage.removeItem(key);
const now = Date.now();
const today = new Date();
localStorage.setItem(LOCALE_STORAGE_KEY, language === "en" ? "en" : "zh-CN");
localStorage.setItem("focusd-island-current-date", `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`);
localStorage.setItem("focusd-island-detached-settings", "false");
localStorage.setItem("focusd-island-qq-notification-access-requested", "true");
// A started task shows on the collapsed island ahead of the Agent task, so starting one is visible.
localStorage.setItem("focusd-island-settings", JSON.stringify({ lyricsOnline: true, collapsedPriority: ["todo", "agent", "lyrics"] }));
localStorage.setItem("focusd-island-todos", JSON.stringify(data.todos.map((title, index) => ({
  id: `t${index}`, title, completed: index === 2, createdAt: now - (3 - index) * 3_600_000,
}))));

installDemoMocks(data);
trackIslandTopEdge();
installSameWindowStorageEvents();

window.addEventListener("pointerdown", () => { document.documentElement.dataset.inputModality = "pointer"; }, true);
window.addEventListener("keydown", (event) => { if (event.key === "Tab") document.documentElement.dataset.inputModality = "keyboard"; }, true);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <I18nProvider>
      <IslandApp />
    </I18nProvider>
  </React.StrictMode>,
);

startTour(data, window.matchMedia("(prefers-reduced-motion: reduce)").matches);

import React from "react";
import ReactDOM from "react-dom/client";
import "./styles/tokens.css";
import "./styles/fonts.css";
import "./styles/base.css";
import { IslandApp } from "./windows/island/IslandApp";
import { TranslationWindow } from "./windows/translation/TranslationWindow";
import { SettingsWindow } from "./windows/settings/SettingsWindow";
import { I18nProvider } from "./i18n";
import { trackIslandTopEdge } from "./windows/island/topEdge";
import { installSameWindowStorageEvents } from "./lib/sameWindowStorageEvents";

const windowKind = new URLSearchParams(window.location.search).get("window");

if (windowKind === null) {
  trackIslandTopEdge();
  // Settings can be shown inside the island, which then shares this window with it.
  installSameWindowStorageEvents();
}

window.addEventListener(
  "pointerdown",
  () => {
    document.documentElement.dataset.inputModality = "pointer";
  },
  true,
);

window.addEventListener(
  "keydown",
  (event) => {
    if (event.key === "Tab") {
      document.documentElement.dataset.inputModality = "keyboard";
    }
  },
  true,
);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <I18nProvider>
      {windowKind === "translation" ? (
        <TranslationWindow />
      ) : windowKind === "settings" ? (
        <SettingsWindow />
      ) : (
        <IslandApp />
      )}
    </I18nProvider>
  </React.StrictMode>,
);

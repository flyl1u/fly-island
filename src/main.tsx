import React from "react";
import ReactDOM from "react-dom/client";
import "./styles/tokens.css";
import "./styles/fonts.css";
import "./styles/base.css";
import { IslandApp } from "./windows/island/IslandApp";
import { TranslationWindow } from "./windows/translation/TranslationWindow";
import { SettingsWindow } from "./windows/settings/SettingsWindow";
import { ClipboardWindow } from "./windows/clipboard/ClipboardWindow";
import { I18nProvider } from "./i18n";
import { trackIslandTopEdge } from "./windows/island/topEdge";
import { installSameWindowStorageEvents } from "./lib/sameWindowStorageEvents";
import { shouldPreventContextMenu } from "./lib/contextMenu";
import { applyDocumentTheme } from "./features/appearance/useDocumentTheme";
import { loadSettings } from "./features/appearance/storage";

const windowKind = new URLSearchParams(window.location.search).get("window");
// Before the first paint, so no window shows a frame in the wrong colour scheme.
applyDocumentTheme(loadSettings());

window.addEventListener("contextmenu", (event) => {
  const target = event.target instanceof Element ? event.target
    : event.target instanceof Node ? event.target.parentElement : null;
  if (shouldPreventContextMenu(target)) event.preventDefault();
}, true);

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
      ) : windowKind === "clipboard" ? (
        <ClipboardWindow />
      ) : (
        <IslandApp />
      )}
    </I18nProvider>
  </React.StrictMode>,
);

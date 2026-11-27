import "./shared/storage/runLegacyMigration";
import React from "react";
import ReactDOM from "react-dom/client";
import "./styles/tokens.css";
import "./styles/fonts.css";
import "./styles/base.css";
import { IslandApp } from "./windows/island/IslandApp";
import { TranslationWindow } from "./windows/translation/TranslationWindow";
import { SettingsWindow } from "./windows/settings/SettingsWindow";
import { EyeCareWindow } from "./windows/eye-care/EyeCareWindow";
import { ClipboardWindow } from "./windows/clipboard/ClipboardWindow";
import { I18nProvider, loadLocale, TRANSLATIONS } from "./i18n";
import { trackIslandTopEdge } from "./windows/island/topEdge";
import { installSameWindowStorageEvents } from "./lib/sameWindowStorageEvents";
import { shouldPreventContextMenu } from "./lib/contextMenu";
import { applyDocumentTheme } from "./features/appearance/useDocumentTheme";
import { loadSettings } from "./features/appearance/storage";
import { initializeFirstLaunchDefaults } from "./windows/island/initializeDefaults";
import { installAppLogCapture } from "./features/diagnostics/appLogCapture";
import { logStartupSettings } from "./features/diagnostics/islandSettings";
import { restoreConfigBeforeMount } from "./features/config-transfer/bootstrap";

const windowKind = new URLSearchParams(window.location.search).get("window");
// First, so errors while the window starts are in the diagnostic log when it is on.
installAppLogCapture();

async function mountApp() {
  await restoreConfigBeforeMount();
  await initializeFirstLaunchDefaults(windowKind === null);
  // Before the first paint, so no window shows a frame in the wrong colour scheme.
  const settings = loadSettings();
  applyDocumentTheme(settings);

  window.addEventListener("contextmenu", (event) => {
    const target = event.target instanceof Element ? event.target
      : event.target instanceof Node ? event.target.parentElement : null;
    if (shouldPreventContextMenu(target, Boolean(window.getSelection()?.toString()))) event.preventDefault();
  }, true);

  if (windowKind === null) {
    logStartupSettings(settings);
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
        {windowKind === "eye-care" ? (
          <EyeCareWindow />
        ) : windowKind === "translation" ? (
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
}

void mountApp().catch((error) => {
  console.error("Application startup failed", error);
  const root = document.getElementById("root");
  if (root) root.textContent = TRANSLATIONS[loadLocale()].settings.configTransfer.startupFailed;
});

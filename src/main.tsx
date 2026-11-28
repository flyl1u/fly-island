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
const ScreenshotWindow = React.lazy(() => import("./windows/screenshot/ScreenshotWindow").then((module) => ({ default: module.ScreenshotWindow })));
const ScreenshotOcrWindow = React.lazy(() => import("./windows/screenshot-ocr/ScreenshotOcrWindow").then((module) => ({ default: module.ScreenshotOcrWindow })));
const ScreenshotTranslationWindow = React.lazy(() => import("./windows/screenshot-translation/ScreenshotTranslationWindow").then((module) => ({ default: module.ScreenshotTranslationWindow })));
const PinnedImageWindow = React.lazy(() => import("./windows/pinned-image/PinnedImageWindow").then((module) => ({ default: module.PinnedImageWindow })));
// First, so errors while the window starts are in the diagnostic log when it is on.
installAppLogCapture();

/** 兜底：截图窗口渲染出错时显示错误信息，而不是整页白屏。 */
class ScreenshotErrorBoundary extends React.Component<{ children: React.ReactNode }, { message: string | null }> {
  state = { message: null as string | null };

  static getDerivedStateFromError(error: unknown) {
    return { message: String(error) };
  }

  render() {
    if (this.state.message) {
      return (
        <div style={{ padding: 16, color: "#b42318", font: "13px system-ui, sans-serif", background: "#fff1f0" }}>
          ScreenshotWindow failed: {this.state.message}
        </div>
      );
    }
    return this.props.children;
  }
}

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
      <I18nProvider><React.Suspense fallback={null}>
        {windowKind === "eye-care" ? (
          <EyeCareWindow />
        ) : windowKind === "translation" ? (
          <TranslationWindow />
        ) : windowKind === "settings" ? (
          <SettingsWindow />
        ) : windowKind === "clipboard" ? (
          <ClipboardWindow />
        ) : windowKind === "screenshot-ocr" ? (
          <ScreenshotOcrWindow />
        ) : windowKind === "screenshot-translation" ? (
          <ScreenshotTranslationWindow />
        ) : windowKind === "pinned-image" ? (
          <PinnedImageWindow />
        ) : windowKind === "screenshot" ? (
          <ScreenshotErrorBoundary>
            <ScreenshotWindow />
          </ScreenshotErrorBoundary>
        ) : (
          <IslandApp />
        )}
      </React.Suspense></I18nProvider>
    </React.StrictMode>,
  );
}

void mountApp().catch((error) => {
  console.error("Application startup failed", error);
  const root = document.getElementById("root");
  if (root) root.textContent = TRANSLATIONS[loadLocale()].settings.configTransfer.startupFailed;
});

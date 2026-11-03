import React from "react";
import ReactDOM from "react-dom/client";
import "./styles/fonts.css";
import "./styles/base.css";
import App from "./App";
import TranslationWindow from "./TranslationWindow";
import SettingsWindow from "./SettingsWindow";
import { I18nProvider } from "./i18n";

const windowKind = new URLSearchParams(window.location.search).get("window");

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
      {windowKind === "translation" ? <TranslationWindow /> : windowKind === "settings" ? <SettingsWindow /> : <App />}
    </I18nProvider>
  </React.StrictMode>,
);

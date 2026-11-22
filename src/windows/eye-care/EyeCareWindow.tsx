import { EyeCareRestPanel } from "../../features/eye-care/EyeCareRestPanel";
import { useDocumentTheme, useStoredTheme } from "../../features/appearance/useDocumentTheme";
import { useEyeCareWindow } from "./useEyeCareWindow";
import "./EyeCareWindow.css";

export function EyeCareWindow() {
  const state = useEyeCareWindow();
  useDocumentTheme(useStoredTheme());
  return <main className="eye-care-window">
    <EyeCareRestPanel snapshot={state.snapshot} busy={state.busy} failed={state.failed}
      onAction={(action) => { void state.run(action); }} />
  </main>;
}

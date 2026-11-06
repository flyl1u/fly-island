import { forwardRef, type InputHTMLAttributes } from "react";
import "./SettingsInput.css";

/**
 * A text field as a settings row shows it: across the row under the title (pass it as the row's
 * children), with a quiet fill instead of a box; `monospace` for paths, keys and model names.
 */
export const SettingsInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { monospace?: boolean }>(
  function SettingsInput({ monospace = false, className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={["settings-input", monospace ? "settings-input--mono" : "", className ?? ""].filter(Boolean).join(" ")}
        spellCheck={false}
        {...props}
      />
    );
  },
);

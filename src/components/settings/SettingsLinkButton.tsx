import type { ReactNode } from "react";
import "./SettingsLinkButton.css";

/** A secondary action written as accent-coloured text, in place of a filled button. */
export function SettingsLinkButton({
  children,
  tone = "accent",
  disabled = false,
  onClick,
}: {
  children: ReactNode;
  tone?: "accent" | "danger";
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={tone === "danger" ? "settings-link-button settings-link-button--danger" : "settings-link-button"}
      type="button"
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

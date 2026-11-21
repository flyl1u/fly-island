import type { MouseEventHandler, ReactNode } from "react";
import "./SettingsLinkButton.css";

/** A secondary action written as accent-coloured text, in place of a filled button. */
export function SettingsLinkButton({
  children,
  tone = "accent",
  disabled = false,
  onClick,
  ariaLabel,
}: {
  children: ReactNode;
  tone?: "accent" | "danger";
  disabled?: boolean;
  onClick: MouseEventHandler<HTMLButtonElement>;
  ariaLabel?: string;
}) {
  return (
    <button
      className={tone === "danger" ? "settings-link-button settings-link-button--danger" : "settings-link-button"}
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  );
}

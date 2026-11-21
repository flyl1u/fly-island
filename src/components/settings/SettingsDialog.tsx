import { useId, useLayoutEffect, useRef, type ReactNode } from "react";
import "./SettingsDialog.css";

/** Mount while open. Native modality keeps keyboard focus inside the dialog. */
export function SettingsDialog({
  title,
  children,
  actions,
  onClose,
}: {
  title: string;
  children: ReactNode;
  actions: ReactNode;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const startedOnBackdrop = useRef(false);
  const titleId = useId();

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const opener = document.activeElement;
    dialog.showModal();
    return () => {
      dialog.close();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="settings-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={(event) => {
        // Escape belongs to the dialog even when settings are embedded in the island.
        if (event.key === "Escape") event.stopPropagation();
      }}
      onPointerDown={(event) => { startedOnBackdrop.current = event.target === event.currentTarget; }}
      onClick={(event) => {
        if (startedOnBackdrop.current && event.target === event.currentTarget) onClose();
        startedOnBackdrop.current = false;
      }}
    >
      <div className="settings-dialog__surface">
        <h2 className="settings-dialog__title" id={titleId}>{title}</h2>
        {children}
        <footer className="settings-dialog__actions">{actions}</footer>
      </div>
    </dialog>
  );
}

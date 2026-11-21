import type { ReactNode } from "react";
import "./PageButtonContent.css";

export function PageButtonContent({ icon, label }: { icon: ReactNode; label?: string }) {
  if (label === undefined) return icon;
  return (
    <>
      <span className="page-button-content__icon">{icon}</span>
      <span className="page-button-content__label" aria-hidden="true">
        <span className="page-button-content__text">{label}</span>
      </span>
      <span className="page-button-content__measure" aria-hidden="true">
        <span>{label}</span>
        <span>{label}</span>
      </span>
    </>
  );
}

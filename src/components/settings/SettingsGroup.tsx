import type { ReactNode } from "react";
import "./SettingsGroup.css";

/**
 * A group of settings: a bold title above a card of rows divided by hairlines, and
 * an optional grey footnote under the card for what concerns the whole group.
 */
export function SettingsGroup({
  title,
  action,
  footer,
  children,
}: {
  title?: string;
  /** A small control at the right end of the title line, such as a text link. */
  action?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="settings-group">
      {title || action ? (
        <div className="settings-group__header">
          {title ? <h2 className="settings-group__title">{title}</h2> : <span />}
          {action}
        </div>
      ) : null}
      <div className="settings-group__card">{children}</div>
      {footer ? <div className="settings-group__footer">{footer}</div> : null}
    </section>
  );
}

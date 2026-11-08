import type { ReactNode } from "react";
import "./SettingsRow.css";

/**
 * One setting: its title, with an optional one-sentence consequence under it, on the
 * left and its control on the right. Children (a slider) span the row below them.
 * An indented row belongs to the switch above it and is only shown while that is on.
 */
export function SettingsRow({
  title,
  description,
  control,
  labelFor,
  indent = false,
  searchable = true,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  control?: ReactNode;
  /** Id of the input the title names; clicking the title then focuses or toggles it. */
  labelFor?: string;
  indent?: boolean;
  /**
   * False for a row that is data rather than a setting (a plugin, a host, a saved preset, an
   * empty list's note): the settings search index (`pnpm settings:index`) leaves it out.
   */
  searchable?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className={indent ? "settings-row settings-row--indent" : "settings-row"} data-search={searchable ? undefined : "off"}>
      <div className="settings-row__main">
        <div className="settings-row__text">
          {labelFor ? (
            <label className="settings-row__title" htmlFor={labelFor}>{title}</label>
          ) : (
            <span className="settings-row__title">{title}</span>
          )}
          {description ? <span className="settings-row__description">{description}</span> : null}
        </div>
        {control ? <div className="settings-row__control">{control}</div> : null}
      </div>
      {children}
    </div>
  );
}

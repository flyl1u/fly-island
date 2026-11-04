import type { ReactNode } from "react";
import { useTranslation } from "../../i18n";
import type { SettingsCategory } from "./categories";
import { SettingsSidebar } from "./SettingsSidebar";
import "./LayoutEditor.css";

export function LayoutEditor({
  category,
  titleAction,
  children,
  onCategoryChange,
}: {
  category: SettingsCategory;
  /** Page-wide control shown at the end of the title row. */
  titleAction?: ReactNode;
  children: ReactNode;
  onCategoryChange: (category: SettingsCategory) => void;
}) {
  const t = useTranslation();
  return (
    <div className="settings-layout">
      <SettingsSidebar category={category} onCategoryChange={onCategoryChange} />

      {/* Keyed by page so each page opens scrolled to the top. */}
      <div className="editor-panel" key={category}>
        <div className="settings-page__header">
          <h1 className="settings-page__title">{t.settings.categories[category]}</h1>
          {titleAction}
        </div>
        {children}
      </div>
    </div>
  );
}

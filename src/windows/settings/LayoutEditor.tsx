import type { ReactNode } from "react";
import { useTranslation } from "../../i18n";
import type { SettingsCategory } from "./categories";
import { SettingsSidebar } from "./SettingsSidebar";
import "./LayoutEditor.css";

export function LayoutEditor({
  category,
  children,
  onCategoryChange,
  onReset,
}: {
  category: SettingsCategory;
  children: ReactNode;
  onCategoryChange: (category: SettingsCategory) => void;
  onReset: () => void;
}) {
  const t = useTranslation();
  return (
    <div className="settings-layout">
      <SettingsSidebar
        category={category}
        onCategoryChange={onCategoryChange}
        onReset={onReset}
      />

      {/* Keyed by page so each page opens scrolled to the top. */}
      <div className="editor-panel" key={category}>
        <h1 className="settings-page__title">{t.settings.categories[category]}</h1>
        {children}
      </div>
    </div>
  );
}

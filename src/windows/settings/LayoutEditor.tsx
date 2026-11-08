import { useRef, useState, type ReactNode } from "react";
import { useTranslation } from "../../i18n";
import type { SettingsCategory } from "./categories";
import { SettingsSidebar } from "./SettingsSidebar";
import { useFoundRow, type FoundRow } from "./useFoundRow";
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
  const panel = useRef<HTMLDivElement>(null);
  const [found, setFound] = useState<FoundRow | null>(null);
  useFoundRow(found, category, panel);
  return (
    <div className="settings-layout">
      <SettingsSidebar
        category={category}
        onCategoryChange={onCategoryChange}
        onRowOpen={(page, title) => {
          onCategoryChange(page);
          setFound({ page, title, at: Date.now() });
        }}
      />

      {/* Keyed by page so each page opens scrolled to the top. */}
      <div className="editor-panel" key={category} ref={panel}>
        <div className="settings-page__header">
          <h1 className="settings-page__title">{t.settings.categories[category]}</h1>
          {titleAction}
        </div>
        {children}
      </div>
    </div>
  );
}

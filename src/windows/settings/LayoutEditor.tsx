import { useRef, type ReactNode } from "react";
import { useCategoryTitle } from "./useCategoryTitle";
import type { SettingsCategory } from "./categories";
import { SettingsSidebar } from "./SettingsSidebar";
import { useSettingsContentHeight } from "./useSettingsContentHeight";
import "./LayoutEditor.css";

export function LayoutEditor({
  category,
  titleAction,
  children,
  onCategoryChange,
  onContentHeight,
}: {
  category: SettingsCategory;
  /** Page-wide control shown at the end of the title row. */
  titleAction?: ReactNode;
  children: ReactNode;
  onCategoryChange: (category: SettingsCategory) => void;
  /** Told the height the open page needs without scrolling (the island sizes itself to it). */
  onContentHeight?: (height: number) => void;
}) {
  const categoryTitle = useCategoryTitle();
  const layoutRef = useRef<HTMLDivElement>(null);
  useSettingsContentHeight(layoutRef, category, onContentHeight);
  return (
    <div className="settings-layout" ref={layoutRef}>
      <SettingsSidebar category={category} onCategoryChange={onCategoryChange} />

      {/* Keyed by page so each page opens scrolled to the top. */}
      <div className="editor-panel" key={category}>
        <div className="settings-page__header">
          <h1 className="settings-page__title">{categoryTitle(category)}</h1>
          {titleAction}
        </div>
        {children}
      </div>
    </div>
  );
}

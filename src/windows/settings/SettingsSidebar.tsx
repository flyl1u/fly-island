import { useEffect, useRef } from "react";
import { ClipboardList, Info, Languages, ListTodo, MessageCircle, MessagesSquare, Music, Palette, Plug, SlidersHorizontal, type LucideIcon } from "lucide-react";
import { useTranslation } from "../../i18n";
import { SETTINGS_GROUPS, type SettingsCategory } from "./categories";
import "./SettingsSidebar.css";

const CATEGORY_ICONS: Record<SettingsCategory, LucideIcon> = {
  general: SlidersHorizontal,
  appearance: Palette,
  messages: MessageCircle,
  todos: ListTodo,
  music: Music,
  clipboard: ClipboardList,
  translation: Languages,
  agents: MessagesSquare,
  agentConnect: Plug,
  about: Info,
};

/**
 * The settings page list: icon and name per page, the groups set apart by a gap rather than
 * headings (with nine pages, headings were more to read than the list itself), About last, right
 * after the AI Agent pages.
 */
export function SettingsSidebar({
  category,
  onCategoryChange,
}: {
  category: SettingsCategory;
  onCategoryChange: (category: SettingsCategory) => void;
}) {
  const text = useTranslation().settings.categories;
  const listRef = useRef<HTMLDivElement>(null);
  // The list can outgrow a short window or the island; keep the open page in sight.
  useEffect(() => {
    listRef.current?.querySelector(".settings-sidebar__item--active")?.scrollIntoView({ block: "nearest" });
  }, [category]);

  const item = (entry: SettingsCategory) => {
    const Icon = CATEGORY_ICONS[entry];
    const isActive = entry === category;
    return (
      <li key={entry}>
        <button
          className={`settings-sidebar__item${isActive ? " settings-sidebar__item--active" : ""}`}
          type="button"
          aria-current={isActive ? "page" : undefined}
          data-category={entry}
          onClick={() => onCategoryChange(entry)}
        >
          <Icon size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
          <span>{text[entry]}</span>
        </button>
      </li>
    );
  };

  return (
    <nav className="settings-sidebar" aria-label={text.label}>
      <div className="settings-sidebar__list" ref={listRef}>
        {SETTINGS_GROUPS.map((group) => (
          <section
            className="settings-sidebar__group"
            key={group.label ?? group.categories.join()}
            aria-label={group.label ? text.groups[group.label] : undefined}
          >
            <ul>{group.categories.map(item)}</ul>
          </section>
        ))}
      </div>
    </nav>
  );
}

import { Bell, Bot, ClipboardList, Inbox, Info, Languages, ListTodo, Music, Palette, SlidersHorizontal, type LucideIcon } from "lucide-react";
import { useTranslation } from "../../i18n";
import { SETTINGS_CATEGORIES, type SettingsCategory } from "./categories";
import "./SettingsSidebar.css";

const CATEGORY_ICONS: Record<SettingsCategory, LucideIcon> = {
  general: SlidersHorizontal,
  appearance: Palette,
  notifications: Bell,
  todos: ListTodo,
  music: Music,
  clipboard: ClipboardList,
  translation: Languages,
  shelf: Inbox,
  agents: Bot,
  about: Info,
};

export function SettingsSidebar({
  category,
  onCategoryChange,
}: {
  category: SettingsCategory;
  onCategoryChange: (category: SettingsCategory) => void;
}) {
  const t = useTranslation();

  return (
    <nav className="settings-sidebar" aria-label={t.settings.categories.label}>
      <div className="settings-sidebar__header">
        <span>{t.settings.title}</span>
      </div>
      <ul className="settings-sidebar__list">
        {SETTINGS_CATEGORIES.map((item) => {
          const Icon = CATEGORY_ICONS[item];
          const isActive = item === category;

          return (
            <li key={item}>
              <button
                className={`settings-sidebar__item${isActive ? " settings-sidebar__item--active" : ""}`}
                type="button"
                aria-current={isActive ? "page" : undefined}
                data-category={item}
                onClick={() => onCategoryChange(item)}
              >
                <Icon size={16} strokeWidth={2} aria-hidden="true" />
                <span>{t.settings.categories[item]}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

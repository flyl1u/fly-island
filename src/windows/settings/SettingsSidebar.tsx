import { Bot, ClipboardList, Inbox, Info, Keyboard, Languages, ListTodo, MessageCircle, Music, Palette, Puzzle, RefreshCcw, SlidersHorizontal, Volume2, type LucideIcon } from "lucide-react";
import { useTranslation } from "../../i18n";
import { SETTINGS_GROUPS, type SettingsCategory } from "./categories";
import "./SettingsSidebar.css";

const CATEGORY_ICONS: Record<SettingsCategory, LucideIcon> = {
  general: SlidersHorizontal,
  appearance: Palette,
  shortcuts: Keyboard,
  updates: RefreshCcw,
  messages: MessageCircle,
  todos: ListTodo,
  music: Music,
  clipboard: ClipboardList,
  translation: Languages,
  shelf: Inbox,
  agents: Bot,
  sounds: Volume2,
  plugins: Puzzle,
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
      <div className="settings-sidebar__list">
        {SETTINGS_GROUPS.map((group) => (
          <section className="settings-sidebar__group" key={group.categories[0]} aria-label={group.label ? t.settings.categories.groups[group.label] : undefined}>
            {group.label && <h2 className="settings-sidebar__group-label">{t.settings.categories.groups[group.label]}</h2>}
            <ul>
              {group.categories.map((item) => {
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
          </section>
        ))}
      </div>
    </nav>
  );
}

import { useEffect, useRef } from "react";
import { Bell, ClipboardList, Inbox, Info, Languages, ListTodo, MessageCircle, MessagesSquare, Music, Palette, Plug, ShieldCheck, SlidersHorizontal, Volume2, type LucideIcon } from "lucide-react";
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
  shelf: Inbox,
  agents: MessagesSquare,
  agentAlerts: Bell,
  sounds: Volume2,
  agentApprovals: ShieldCheck,
  agentConnect: Plug,
  about: Info,
};

/** The settings page list: each group under its name, and About pinned to the bottom. */
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
          <Icon size={16} strokeWidth={2} aria-hidden="true" />
          <span>{text[entry]}</span>
        </button>
      </li>
    );
  };

  const footer = SETTINGS_GROUPS.filter((group) => group.label === null).flatMap((group) => group.categories);

  return (
    <nav className="settings-sidebar" aria-label={text.label}>
      <div className="settings-sidebar__list" ref={listRef}>
        {SETTINGS_GROUPS.map((group) => {
          if (group.label === null) return null;
          const label = text.groups[group.label];
          return (
            <section className="settings-sidebar__group" key={group.label} aria-label={label}>
              <h2 className="settings-sidebar__heading">{label}</h2>
              <ul>{group.categories.map(item)}</ul>
            </section>
          );
        })}
      </div>
      {footer.length > 0 && (
        <div className="settings-sidebar__footer">
          <ul>{footer.map(item)}</ul>
        </div>
      )}
    </nav>
  );
}

import { useEffect, useRef, useState } from "react";
import { Bell, Blocks, Bot, CalendarDays, ChevronRight, ClipboardList, Inbox, Info, Keyboard, Languages, LayoutGrid, ListTodo, MessageCircle, MessagesSquare, Music, Palette, Plug, Puzzle, Search, Settings2, ShieldCheck, Store, SlidersHorizontal, Volume2, X, type LucideIcon } from "lucide-react";
import { useTranslation } from "../../i18n";
import { SETTINGS_GROUPS, searchCategories, type SettingsCategory, type SettingsGroup } from "./categories";
import "./SettingsSidebar.css";

const CATEGORY_ICONS: Record<SettingsCategory, LucideIcon> = {
  general: SlidersHorizontal,
  appearance: Palette,
  shortcuts: Keyboard,
  messages: MessageCircle,
  todos: ListTodo,
  calendar: CalendarDays,
  music: Music,
  clipboard: ClipboardList,
  translation: Languages,
  shelf: Inbox,
  // The AI Agent folder itself shows the robot; its sessions page lists conversations.
  agents: MessagesSquare,
  agentAlerts: Bell,
  sounds: Volume2,
  agentApprovals: ShieldCheck,
  agentConnect: Plug,
  plugins: Puzzle,
  market: Store,
  about: Info,
};

/** Each group is a row its pages fold under. */
const GROUP_ICONS: Record<SettingsGroup, LucideIcon> = {
  basics: Settings2,
  features: LayoutGrid,
  agents: Bot,
  extensions: Blocks,
};

/**
 * The settings window's page list: a search box, each group as a row its pages fold under (all
 * open at first), and About pinned to the bottom. Searching matches page names, group names and
 * each page's keywords, shows only the matches (folded pages too), and Enter opens the first.
 */
export function SettingsSidebar({
  category,
  onCategoryChange,
}: {
  category: SettingsCategory;
  onCategoryChange: (category: SettingsCategory) => void;
}) {
  const t = useTranslation();
  const text = t.settings.categories;
  const [query, setQuery] = useState("");
  // Every group starts open; folding lasts while the window is open.
  const [folded, setFolded] = useState<ReadonlySet<SettingsGroup>>(() => new Set());
  const toggle = (group: SettingsGroup) => {
    const next = new Set(folded);
    if (!next.delete(group)) next.add(group);
    setFolded(next);
  };
  const groupOf = (item: SettingsCategory) => SETTINGS_GROUPS.find((group) => group.categories.includes(item))?.label;
  const describe = (item: SettingsCategory) => {
    const group = groupOf(item);
    return `${text[item]} ${group ? text.groups[group] : ""} ${text.keywords[item]}`;
  };
  const listRef = useRef<HTMLDivElement>(null);
  // Unfolded, the list can outgrow a short window; keep the open page in sight.
  useEffect(() => {
    listRef.current?.querySelector(".settings-sidebar__item--active")?.scrollIntoView({ block: "nearest" });
  }, [category, folded]);
  const searching = query.trim() !== "";
  const matches = searchCategories(query, describe);
  const shown = (item: SettingsCategory) => matches.includes(item);

  const item = (entry: SettingsCategory, nested = false) => {
    const Icon = CATEGORY_ICONS[entry];
    const isActive = entry === category;
    return (
      <li key={entry}>
        <button
          className={`settings-sidebar__item${nested ? " settings-sidebar__item--nested" : ""}${isActive ? " settings-sidebar__item--active" : ""}`}
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

  const groups = SETTINGS_GROUPS.filter((group) => group.label !== null);
  const footer = SETTINGS_GROUPS.filter((group) => group.label === null).flatMap((group) => group.categories).filter(shown);

  return (
    <nav className="settings-sidebar" aria-label={text.label}>
      <div className="settings-sidebar__search">
        <Search size={14} strokeWidth={2} aria-hidden="true" />
        <input
          type="text"
          value={query}
          placeholder={text.search.placeholder}
          aria-label={text.search.placeholder}
          spellCheck={false}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && searching && matches.length > 0) onCategoryChange(matches[0]);
            if (event.key === "Escape" && query) {
              event.preventDefault();
              setQuery("");
            }
          }}
        />
        {query && (
          <button className="settings-sidebar__search-clear" type="button" aria-label={text.search.clear} onClick={() => setQuery("")}>
            <X size={13} strokeWidth={2} aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="settings-sidebar__list" ref={listRef}>
        {groups.map((group) => {
          const items = group.categories.filter(shown);
          const name = group.label;
          if (items.length === 0 || name === null) return null;
          const label = text.groups[name];
          const GroupIcon = GROUP_ICONS[name];
          // Folded, only the open page stays listed, so the sidebar still shows where you are.
          const open = searching || !folded.has(name);
          const children = open ? items : items.filter((entry) => entry === category);
          const holdsActive = items.includes(category);
          return (
            <section className="settings-sidebar__group" key={name} aria-label={label}>
              <button
                className={`settings-sidebar__folder${holdsActive ? " settings-sidebar__folder--holds-active" : ""}`}
                type="button"
                data-group={name}
                aria-expanded={open}
                aria-label={open ? text.collapse(label) : text.expand(label)}
                disabled={searching}
                onClick={() => toggle(name)}
              >
                <GroupIcon size={16} strokeWidth={2} aria-hidden="true" />
                <span>{label}</span>
                <ChevronRight className="settings-sidebar__chevron" size={14} strokeWidth={2} aria-hidden="true" />
              </button>
              {children.length > 0 && <ul className="settings-sidebar__children">{children.map((entry) => item(entry, true))}</ul>}
            </section>
          );
        })}
        {searching && matches.length === 0 && <p className="settings-sidebar__empty">{text.search.empty}</p>}
      </div>
      {footer.length > 0 && (
        <div className="settings-sidebar__footer">
          <ul>{footer.map((entry) => item(entry))}</ul>
        </div>
      )}
    </nav>
  );
}

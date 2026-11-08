import { useEffect, useRef, useState } from "react";
import { Bell, Blocks, Bot, CalendarDays, ChevronRight, ClipboardList, Inbox, Info, Keyboard, Languages, LayoutGrid, ListTodo, MessageCircle, MessagesSquare, Music, Palette, Plug, Puzzle, Search, Server, Settings2, ShieldCheck, Store, SlidersHorizontal, Volume2, X, type LucideIcon } from "lucide-react";
import { LOCALE_CODES, useLocale, useTranslation } from "../../i18n";
import { SETTINGS_GROUPS, searchCategories, type SettingsCategory, type SettingsGroup } from "./categories";
import searchIndex from "./searchIndex.json";
import { isTitleHit, MAX_HITS_PER_PAGE, searchSettingsRows, type SettingsRowHit, type SettingsSearchEntry } from "./settingsSearch";
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
  agentRemote: Server,
  agentAlerts: Bell,
  sounds: Volume2,
  agentApprovals: ShieldCheck,
  agentConnect: Plug,
  plugins: Puzzle,
  market: Store,
  about: Info,
};

/** Every setting row of every page, both languages (`pnpm settings:index` writes the file). */
const SEARCH_ENTRIES = searchIndex.entries as SettingsSearchEntry[];

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
 * each page's keywords, and the settings on each page (titles, descriptions and choices, in
 * either language, settingsSearch.ts). It shows only the pages it found, folded ones too, with
 * the settings it found under each; clicking one opens its page at that row. Enter opens the
 * best: a setting whose title holds the query, else the first page, else the best setting.
 */
export function SettingsSidebar({
  category,
  onCategoryChange,
  onRowOpen,
}: {
  category: SettingsCategory;
  onCategoryChange: (category: SettingsCategory) => void;
  /** Opens `page` and shows the row titled `title` there; without it, search lists pages only. */
  onRowOpen?: (page: SettingsCategory, title: string) => void;
}) {
  const t = useTranslation();
  const { locale } = useLocale();
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
  const hits = onRowOpen && searching ? searchSettingsRows(query, SEARCH_ENTRIES, locale, LOCALE_CODES, describe) : [];
  const shown = (item: SettingsCategory) => matches.includes(item) || hits.some((hit) => hit.page === item);
  const openHit = (hit: SettingsRowHit) => onRowOpen?.(hit.page, hit.text.title);
  const openBest = () => {
    if (isTitleHit(hits[0], query)) openHit(hits[0]);
    else if (matches.length > 0) onCategoryChange(matches[0]);
    else if (hits.length > 0) openHit(hits[0]);
  };
  const pageHits = (page: SettingsCategory) => {
    const found = hits.filter((hit) => hit.page === page).slice(0, MAX_HITS_PER_PAGE);
    if (found.length === 0) return null;
    return (
      <ul className="settings-sidebar__hits">
        {found.map((hit) => {
          const path = [text[page], hit.text.group, hit.text.title].filter(Boolean).join(" › ");
          return (
            <li key={`${hit.text.group}/${hit.text.title}`}>
              <button className="settings-sidebar__hit" type="button" title={path} data-page={page} onClick={() => openHit(hit)}>
                <span>{hit.text.title}</span>
              </button>
            </li>
          );
        })}
      </ul>
    );
  };

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
        {searching && pageHits(entry)}
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
            if (event.key === "Enter" && searching) openBest();
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
        {searching && matches.length === 0 && hits.length === 0 && <p className="settings-sidebar__empty">{text.search.empty}</p>}
      </div>
      {footer.length > 0 && (
        <div className="settings-sidebar__footer">
          <ul>{footer.map((entry) => item(entry))}</ul>
        </div>
      )}
    </nav>
  );
}

import { useEffect, useRef } from "react";
import { ArrowUpRight, ClipboardList, Info, Languages, ListTodo, MessageCircle, MessagesSquare, Music, Palette, Plug, Puzzle, SlidersHorizontal, UserRound, type LucideIcon } from "lucide-react";
import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { PROJECT_AUTHOR_URL } from "../../features/updater/projectLinks";
import { useCommunityInvite } from "../../features/updater/useCommunityInvite";
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
  plugins: Puzzle,
  about: Info,
};

/**
 * The settings page list: icon and name per page, the groups set apart by a gap rather than
 * headings. Plugins and About follow the AI Agent pages, and under About is a link to the
 * author's site rather than a page.
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
  const listRef = useRef<HTMLDivElement>(null);
  // About keeps a red dot until the community group on it has been opened.
  const communityPending = useCommunityInvite().pending;
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
          {entry === "about" && communityPending && <span className="settings-sidebar__dot" role="img" aria-label={t.settings.project.communityNew} />}
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
            <ul>
              {group.categories.map(item)}
              {group.label === null && (
                // 不是设置页：点一下直接用系统浏览器打开作者的网站。
                <li>
                  <a className="settings-sidebar__item settings-sidebar__item--link" href={PROJECT_AUTHOR_URL} target="_blank" rel="noreferrer"
                    onClick={(event) => {
                      if (!isTauri()) return;
                      event.preventDefault();
                      void openUrl(PROJECT_AUTHOR_URL).catch((error) => console.error("Failed to open the author's site", error));
                    }}>
                    <UserRound size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
                    <span>{t.settings.project.author}</span>
                    <ArrowUpRight className="settings-sidebar__external" size={13} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
                  </a>
                </li>
              )}
            </ul>
          </section>
        ))}
      </div>
    </nav>
  );
}

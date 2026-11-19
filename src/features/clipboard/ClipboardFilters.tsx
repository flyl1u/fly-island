import { FileText, ImageIcon, Search, Star, Type, X, type LucideIcon } from "lucide-react";
import { useTranslation } from "../../i18n";
import type { ClipboardItemKind, ClipboardKindFilter } from "./kind";
import "./ClipboardFilters.css";

const KIND_ICONS: Record<ClipboardItemKind, LucideIcon> = { text: Type, image: ImageIcon, file: FileText };

export function ClipboardFilters({
  view,
  query,
  kind,
  onViewChange,
  onQueryChange,
  onKindChange,
}: {
  view: "all" | "favorites";
  query: string;
  kind: ClipboardKindFilter;
  onViewChange: (view: "all" | "favorites") => void;
  onQueryChange: (query: string) => void;
  onKindChange: (kind: ClipboardKindFilter) => void;
}) {
  const t = useTranslation();
  const kindLabels: Record<ClipboardItemKind, string> = { text: t.clipboard.kindText, image: t.clipboard.kindImage, file: t.clipboard.kindFile };

  return (
    <div className="clipboard-filters">
      {/* One tab row: 全部 / 收藏 / 文字 / 图片 / 文件. A type tab shows every item of that type. */}
      <div className="clipboard-segments" role="group" aria-label={t.clipboard.segments}>
        {(["all", "favorites"] as const).map((value) => {
          const active = view === value && kind === "any";
          return (
            <button key={value} type="button" className={active ? "clipboard-segment--active" : ""} aria-pressed={active}
              onClick={() => { onViewChange(value); onKindChange("any"); }}>
              {value === "favorites" && <Star size={13} strokeWidth={2} aria-hidden="true" />}
              {value === "all" ? t.clipboard.all : t.clipboard.favorites}
            </button>
          );
        })}
        {(["text", "image", "file"] as const).map((value) => {
          const Icon = KIND_ICONS[value];
          const active = kind === value;
          return (
            <button key={value} type="button" className={active ? "clipboard-segment--active" : ""} aria-pressed={active}
              onClick={() => { onViewChange("all"); onKindChange(value); }}>
              <Icon size={13} strokeWidth={2} aria-hidden="true" />
              {kindLabels[value]}
            </button>
          );
        })}
      </div>

      <label className="clipboard-search">
        <Search size={15} strokeWidth={2.2} />
        <input
          value={query}
          placeholder={t.clipboard.searchPlaceholder}
          aria-label={t.clipboard.searchLabel}
          onChange={(event) => onQueryChange(event.currentTarget.value)}
        />
        {query && (
          <button
            type="button"
            aria-label={t.clipboard.clearSearch}
            onClick={() => onQueryChange("")}
          >
            <X size={14} strokeWidth={2.4} />
          </button>
        )}
      </label>
    </div>
  );
}

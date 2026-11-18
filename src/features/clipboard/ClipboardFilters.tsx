import { FileText, ImageIcon, Search, Type, X, type LucideIcon } from "lucide-react";
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
      <div className="clipboard-segments" aria-label={t.clipboard.segments}>
        <button
          className={view === "all" ? "clipboard-segment--active" : ""}
          type="button"
          aria-pressed={view === "all"}
          onClick={() => onViewChange("all")}
        >
          {t.clipboard.all}
        </button>
        <button
          className={view === "favorites" ? "clipboard-segment--active" : ""}
          type="button"
          aria-pressed={view === "favorites"}
          onClick={() => onViewChange("favorites")}
        >
          {t.clipboard.favorites}
        </button>
      </div>

      <div className="clipboard-kinds" role="group" aria-label={t.clipboard.kinds}>
        {(["text", "image", "file"] as const).map((value) => {
          const Icon = KIND_ICONS[value];
          const active = kind === value;
          return (
            <button key={value} type="button" className={active ? "clipboard-kind--active" : ""} aria-pressed={active}
              aria-label={kindLabels[value]} title={kindLabels[value]} onClick={() => onKindChange(active ? "any" : value)}>
              <Icon size={14} strokeWidth={2} aria-hidden="true" />
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

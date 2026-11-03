import { Search, X } from "lucide-react";
import { useTranslation } from "../../i18n";

export function ClipboardFilters({
  view,
  query,
  onViewChange,
  onQueryChange,
}: {
  view: "all" | "favorites";
  query: string;
  onViewChange: (view: "all" | "favorites") => void;
  onQueryChange: (query: string) => void;
}) {
  const t = useTranslation();

  return (
    <>
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
            title={t.clipboard.clearSearch}
            aria-label={t.clipboard.clearSearch}
            onClick={() => onQueryChange("")}
          >
            <X size={14} strokeWidth={2.4} />
          </button>
        )}
      </label>
    </>
  );
}

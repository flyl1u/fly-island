import { useEffect, type RefObject } from "react";
import type { SettingsCategory } from "./categories";
import { normalizeSearchText } from "./settingsSearch";

/** A row the sidebar search opened; `at` makes opening the same row again a new request. */
export type FoundRow = { page: SettingsCategory; title: string; at: number };

const FOUND_CLASS = "settings-row--found";
/** How long the row stays marked (SettingsRow.css runs its wash in 1.8 s). */
const MARK_MS = 1_900;
/** Some pages fill in after their data comes (plugins, hosts): look again for up to 2 s. */
const LOOK_EVERY_MS = 50;
const LOOK_TRIES = 40;

/**
 * Once `found`'s page is open in `panel`, scrolls its row (by title) into the middle of the page
 * and marks it briefly. A row the page does not show (an option of a switch that is off) is left
 * alone; the page is open, which is the most the search can do.
 */
export function useFoundRow(found: FoundRow | null, category: SettingsCategory, panel: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!found || found.page !== category) return;
    const wanted = normalizeSearchText(found.title);
    let tries = 0;
    let timer: number | undefined;
    let marked: HTMLElement | undefined;
    const look = () => {
      const row = [...(panel.current?.querySelectorAll<HTMLElement>(".settings-row") ?? [])].find(
        (candidate) => normalizeSearchText(candidate.querySelector(".settings-row__title")?.textContent ?? "") === wanted,
      );
      if (!row) {
        if (++tries < LOOK_TRIES) timer = window.setTimeout(look, LOOK_EVERY_MS);
        return;
      }
      marked = row;
      row.classList.remove(FOUND_CLASS);
      // Reading the layout restarts the animation when the same row is opened twice in a row.
      void row.offsetWidth;
      row.classList.add(FOUND_CLASS);
      row.scrollIntoView({ block: "center" });
      timer = window.setTimeout(() => row.classList.remove(FOUND_CLASS), MARK_MS);
    };
    look();
    return () => {
      window.clearTimeout(timer);
      marked?.classList.remove(FOUND_CLASS);
    };
  }, [found, category, panel]);
}

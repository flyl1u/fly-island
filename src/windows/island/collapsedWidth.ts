import { clockWeatherWidth } from "../../features/weather/model.ts";
import { alignCollapsedIslandWidth, getCollapsedIslandWidth } from "./layout.ts";

export type CollapsedWidthContent = { text: string; extraWidth: number; brand?: string | null };

export function collapsedWidthTarget({ manual, range, content, preview, fontScale, paddingExtra, clock, weather, statusMinimum, stageWidth, devicePixelRatio }: {
  manual: number;
  range: { min: number; max: number } | null;
  content: CollapsedWidthContent;
  preview: CollapsedWidthContent | null;
  fontScale: number;
  paddingExtra: number;
  clock: boolean;
  weather: boolean;
  statusMinimum: number;
  stageWidth: number;
  devicePixelRatio: number;
}) {
  if (!range) return manual;
  const shown = preview ?? content;
  const text = shown.brand && shown.text ? `${shown.brand} · ${shown.text}` : shown.brand || shown.text;
  const base = getCollapsedIslandWidth(text, shown.extraWidth + paddingExtra, fontScale, range.min, range.max);
  const width = Math.min(range.max, Math.max(statusMinimum, clockWeatherWidth(base, clock, weather, fontScale)));
  return alignCollapsedIslandWidth(width, stageWidth, devicePixelRatio, range.min, range.max);
}

import type { CSSProperties } from "react";
import { isBrandPluginId, NativePluginIcon } from "./native/NativePluginIcon";
import { NATIVE_PLUGINS, PACKAGED_MARKET_PLUGINS } from "./native/catalog.ts";
import type { PluginPanelIcon } from "./panelTypes";
import { pluginLineIcon } from "./pluginLineIcons";
import "./PluginIcon.css";

const ACCENTS: Readonly<Record<string, string>> = Object.fromEntries(
  [...NATIVE_PLUGINS, ...PACKAGED_MARKET_PLUGINS].map(({ id, accent }) => [id, accent]),
);

/**
 * A plugin's square tile, the same on its card and its settings group title: the brand mark, or else
 * the plugin's line icon tinted with its catalog accent. Every line tile is drawn by this one rule.
 */
export function PluginIcon({ id, size = 16, className = "", panelIcon }: { id: string; size?: number; className?: string; panelIcon?: PluginPanelIcon }) {
  if (isBrandPluginId(id)) return <NativePluginIcon id={id} size={size} className={className} />;
  const Icon = pluginLineIcon(id, panelIcon);
  return <span className={`native-plugin-icon plugin-icon--line ${className}`.trim()} aria-hidden="true"
    style={{ width: size, height: size, "--plugin-tint": ACCENTS[id] ?? "var(--color-accent)" } as CSSProperties}>
    <Icon size={size * 0.72} strokeWidth={1.5} />
  </span>;
}

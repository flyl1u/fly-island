import type { CSSProperties } from "react";
import { hasPluginAppIcon, NativePluginIcon } from "./native/NativePluginIcon";
import type { PluginPanelIcon } from "./panelTypes";
import { pluginLineIcon } from "./pluginLineIcons";
import "./PluginIcon.css";

/**
 * A plugin's square tile, the same on its card and its settings group title: its full-colour app icon.
 * Only a development plugin outside the catalog gets a line tile, from its manifest's panel icon.
 */
export function PluginIcon({ id, size = 16, className = "", panelIcon }: { id: string; size?: number; className?: string; panelIcon?: PluginPanelIcon }) {
  if (hasPluginAppIcon(id)) return <NativePluginIcon id={id} size={size} className={className} />;
  const Icon = pluginLineIcon(id, panelIcon);
  return <span className={`native-plugin-icon plugin-icon--line ${className}`.trim()} aria-hidden="true"
    style={{ width: size, height: size, "--plugin-tint": "var(--color-accent)" } as CSSProperties}>
    <Icon size={size * 0.72} strokeWidth={1.5} />
  </span>;
}

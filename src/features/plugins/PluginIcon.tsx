import { Bot, Headphones, HeartPulse, Puzzle } from "lucide-react";
import { NativePluginIcon } from "./native/NativePluginIcon";
import "./PluginIcon.css";
import { isNativePluginId } from "./native/catalog.ts";

const PACKAGE_ICONS = { minimax: Bot, "device-battery": Headphones, "eye-care": HeartPulse } as const;

/** A plugin's square tile, the same on its card and its settings group title. */
export function PluginIcon({ id, size = 16, className = "" }: { id: string; size?: number; className?: string }) {
  if (isNativePluginId(id)) return <NativePluginIcon id={id} size={size} className={className} />;
  const Icon = (PACKAGE_ICONS as Partial<Record<string, typeof Puzzle>>)[id] ?? Puzzle;
  return <span className={`native-plugin-icon plugin-card__package ${className}`.trim()}
    style={{ width: size, height: size }} aria-hidden="true"><Icon size={Math.round(size * 0.64)} strokeWidth={1.5} /></span>;
}

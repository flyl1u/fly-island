import type { ReactNode } from "react";

export type IslandMode = "collapsed" | "expanded";

/** The pages built into the island. */
export type BuiltinPage = "todo" | "calendar" | "music" | "clipboard" | "shelf" | "qq" | "agents" | "translation";

/** A page a plugin adds: `plugin:<plugin id>/<view id>` (see features/plugin-views/model.ts). */
export type PluginPageId = `plugin:${string}`;

/** Any page the expanded island can show. */
export type IslandPage = BuiltinPage | PluginPageId;

export type NativeGlassState = "active" | "css-fallback" | "disabled";

/**
 * What built-in plugins add to the collapsed bar (filled in useCollapsedSlots.tsx). A slot
 * left empty (undefined, null or false) renders nothing, so the bar looks as it does today.
 */
export type CollapsedSlots = {
  /**
   * In the summary's place, only while the bar shows no summary (message, translation, agent
   * title, todo, name): centred between the status light and the items on the right. Inside
   * the bar's open button, so phrasing content only (span, svg) and no buttons of its own.
   */
  center?: ReactNode;
  /**
   * In place of the agent icon before the session title the bar shows. Keep it about 16 px
   * wide: the collapsed width reserves the icon's room, not this slot's.
   */
  agentIcon?: ReactNode;
  /** Small gauges such as rings, right before the rightmost item (tuck dot or session count). */
  gauges?: ReactNode;
  /** Shown instead of the blue running-session count while AI Agent is on; empty keeps the count. */
  agentCount?: ReactNode;
  /** Px that `center` needs; the collapsed island widens by it while the centre shows. */
  centerWidth?: number;
  /** Px that `gauges` and `agentCount` need with their gaps; the collapsed island widens by it. */
  sideWidth?: number;
};

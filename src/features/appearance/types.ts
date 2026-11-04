export type AppearanceMode = "classic" | "liquidGlass";
export type IslandFont = "system" | "pixel";
/** How the collapsed island opens: a click, or resting the pointer on it. */
export type ExpandTrigger = "click" | "hover";
/** What the expanded island's minimize button does: hide to the tray, or tuck to the top edge. */
export type MinimizeAction = "tray" | "tuck";

export type IslandSettings = {
  topEdgeLayoutVersion: 1;
  appearanceMode: AppearanceMode;
  fontFamily: IslandFont;
  glassIntensity: number;
  opacity: number;
  collapsedScale: number;
  expandedScale: number;
  marginY: number;
  /** Radius (px) of the concave corners drawn while the island is flush with the screen top. */
  topFilletRadius: number;
  /** Bottom corner radius (px) of the expanded island; the collapsed, detached and inner panel radii follow it. */
  islandCornerRadius: number;
  /** Tallest expanded panel (px) before the todo list, clipboard and messages scroll. */
  maxPanelHeight: number;
  taskTextColor: string;
  pulseColor: string;
  pulseBrightness: number;
  islandBackgroundColor: string;
  todoBackgroundColor: string;
  showTitle: boolean;
  showCollapsedText: boolean;
  showIdleTodoCount: boolean;
  carryOverIncompleteTodos: boolean;
  enableTodoReorder: boolean;
  rotateTodos: boolean;
  todoRotationSeconds: number;
  autoTuck: boolean;
  autoTuckSeconds: number;
  /** A tucked island slides back into view to show a new message preview. */
  revealOnMessage: boolean;
  expandTrigger: ExpandTrigger;
  /** Pointer rest time (ms) before a hover opens the island. */
  hoverExpandDelayMs: number;
  /** Time (ms) a hover-opened panel stays open after the pointer leaves it. */
  hoverCollapseDelayMs: number;
  minimizeAction: MinimizeAction;
  /**
   * Module switches. Off hides the module on the island and stops its background work;
   * its data is kept. QQ, WeChat and clipboard history use their existing switches.
   */
  todoEnabled: boolean;
  musicEnabled: boolean;
  agentStatusEnabled: boolean;
  shelfEnabled: boolean;
  mailEnabled: boolean;
};

export type IslandPreset = {
  id: string;
  name: string;
  settings: IslandSettings;
  createdAt: number;
  isDefault?: boolean;
};

export type LegacyIslandSettings = Partial<IslandSettings> & {
  margin?: number;
  sizeScale?: number;
  taskTitleColor?: string;
  pendingTodoColor?: string;
};

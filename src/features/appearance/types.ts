export type AppearanceMode = "classic" | "liquidGlass";
export type IslandFont = "system" | "pixel";

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

export type TranslationTarget = "window" | "island";

export type AppearanceMode = "classic" | "liquidGlass";
export type IslandFont = "system" | "pixel";
export type PageButtonStyle = "capsule" | "icon";
/** Shape of the island's corners: CSS `corner-shape: squircle`, or a circular arc. */
export type IslandCornerShape = "squircle" | "round";
/** Which monitor the island sits on: the primary one, or it follows the pointer or the foreground window there. */
export type IslandMonitor = "primary" | "cursor" | "foreground";
/** How the collapsed island opens: a click, or resting the pointer on it. */
export type ExpandTrigger = "click" | "hover";
/** What the expanded island's minimize button does: hide to the tray, or tuck to the top edge. */
export type MinimizeAction = "tray" | "tuck";
/** What resting the pointer on an island tucked to the edge does: slide it out, or open its panel too. */
export type TuckedHoverAction = "reveal" | "expand";
/** How the Agent page shows the program a session runs in. */
export type AgentHostDisplay = "both" | "icon" | "name" | "off";
/** How the Agent page shows sessions: flat rows, two-line cards framed in their light, or one-line rows. */
export type AgentSessionView = "list" | "cards" | "compact";
/**
 * Agent page order: what needs the user first (red, orange, green, grey), the newest write first,
 * or the session the island saw first last (an order that stays put while sessions write).
 */
export type AgentSessionSort = "status" | "recent" | "firstSeen";
/** Agent page headings: one per computer, one per project (its computer named on the heading), or none. */
export type AgentSessionGroup = "computer" | "project" | "none";
/** How an archived session leaves the Agent page: sliding out, or dissolving into dust in its light's colour. */
export type AgentArchiveMotion = "slide" | "dissolve";
/** Light effects on the Agent page's cards and compact rows: none, the sparkle band, or a gradient wash. */
export type AgentCardEffects = "off" | "sparkle" | "gradient";
/** Which session starts open the Agent page: every turn, a new session's first turn only, or none. */
export type AgentAlertStarted = "everyTurn" | "newSession" | "off";
/** What double-clicking a file shelf entry does. */
export type ShelfDoubleClick = "open" | "reveal";
/** What the collapsed island can show in its text: a running agent, the lyric line, a todo. */
export type CollapsedItem = "agent" | "lyrics" | "todo";
/**
 * What sits on the collapsed island, in the order the user arranged it (Appearance → Collapsed
 * island): the text (pulse, cover and the agent, lyric or todo line) and the status icons —
 * the new-mail badge, files on the shelf, the music waveform, running Agent sessions (or the tuck
 * dot). Icons before the text sit on its left.
 */
export type CollapsedSlot = "text" | "mail" | "shelf" | "music" | "agents";
/** The page dots in the expanded island's header, which the user can drag into any order. */
export type PageDot = "todo" | "music" | "clipboard" | "shelf" | "translation";

export type IslandSettings = {
  topEdgeLayoutVersion: 1;
  appearanceMode: AppearanceMode;
  fontFamily: IslandFont;
  pageButtonStyle: PageButtonStyle;
  glassIntensity: number;
  opacity: number;
  collapsedScale: number;
  expandedScale: number;
  marginY: number;
  /** Prevent moving the island by dragging; explicit position reset still works. */
  positionLocked: boolean;
  islandMonitor: IslandMonitor;
  /** Bottom corner radius (px) of the expanded island; the collapsed, detached and inner panel radii follow it. */
  islandCornerRadius: number;
  islandCornerShape: IslandCornerShape;
  /** Tallest expanded panel (px) before the todo list, clipboard and messages scroll. */
  maxPanelHeight: number;
  /** Clipboard history rows the expanded clipboard page shows before it scrolls. */
  clipboardVisibleRows: number;
  /** Agent sessions the expanded Agent page shows before it scrolls. */
  agentVisibleRows: number;
  agentHostDisplay: AgentHostDisplay;
  agentSessionView: AgentSessionView;
  agentSessionSort: AgentSessionSort;
  agentSessionGroup: AgentSessionGroup;
  agentArchiveMotion: AgentArchiveMotion;
  agentCardEffects: AgentCardEffects;
  /** How far back (hours) the Agent page lists sessions; one of AGENT_SESSION_HOURS. */
  agentSessionHours: number;
  agentShowClaudeCode: boolean;
  agentShowCodex: boolean;
  agentShowDsh: boolean;
  /** List only running, waiting or stalled sessions on the Agent page. */
  agentHideFinished: boolean;
  /** Leave sessions whose agent has quit off the Agent page. */
  agentHideClosed: boolean;
  /** Show how long a session's current (or last) turn has run. */
  agentShowElapsed: boolean;
  agentShowModel: boolean;
  /** The latest prompt and the tool in use on working session rows. */
  agentShowActivity: boolean;
  /** Claude's usage limits at the top of the Agent page, when claude-hud keeps a usage snapshot. */
  agentShowUsage: boolean;
  /** Open the Agent page when a session finishes, fails or waits for the user. */
  agentAlertCompleted: boolean;
  agentAlertFailed: boolean;
  agentAlertWaiting: boolean;
  /** Open it when a session starts working: every turn, only a new session's first, or never. */
  agentAlertStarted: AgentAlertStarted;
  /** How long a page opened for an alert stays, in seconds; one of AGENT_ALERT_SECONDS. */
  agentAlertSeconds: number;
  /** A session still waiting on the user pops up once more after this many seconds; 0: never. */
  agentRemindSeconds: number;
  /** Claude's or Codex's usage reaching this percent pops up once, and again when it resets; 0: never. */
  agentQuotaAlertPercent: number;
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
  todoReorderVersion: 1;
  rotateTodos: boolean;
  todoRotationSeconds: number;
  autoTuck: boolean;
  /**
   * (B) Seconds the collapsed island idles before it tucks into a line (TUCK_DELAY_SECONDS).
   * Replaces `autoTuckSeconds`, which older versions saved and is no longer read.
   */
  tuckDelaySeconds: number;
  /** (A) Seconds after the cursor leaves the open island before it collapses; 0 never (AUTO_COLLAPSE_SECONDS). */
  autoCollapseSeconds: number;
  /** An island tucked after idling slides back once the cursor that brought it out leaves. */
  autoTuckRetract: boolean;
  /** How long (ms) it waits after the cursor leaves before sliding back. */
  autoTuckRetractDelayMs: number;
  /** A tucked island slides back into view to show a new message preview. */
  revealOnMessage: boolean;
  expandTrigger: ExpandTrigger;
  /** Pointer rest time (ms) before a hover opens the island. */
  hoverExpandDelayMs: number;
  /** Time (ms) a hover-opened panel stays open after the pointer leaves it. */
  hoverCollapseDelayMs: number;
  minimizeAction: MinimizeAction;
  tuckedHoverAction: TuckedHoverAction;
  /**
   * Module switches. Off hides the module on the island and stops its background work;
   * its data is kept. QQ, WeChat and clipboard history use their existing switches.
   */
  todoEnabled: boolean;
  musicEnabled: boolean;
  agentStatusEnabled: boolean;
  shelfEnabled: boolean;
  /** Off hides the island's translate button and releases the global translation shortcut. */
  translationEnabled: boolean;
  /** Where translation opens: its own window, or a page of the expanded island. */
  translationTarget: TranslationTarget;
  /** Dragging files onto a collapsed or tucked island opens the shelf as a drop zone. */
  shelfExpandOnDrop: boolean;
  /** Days after which shelf entries leave the list (0 keeps them). */
  shelfAutoCleanupDays: number;
  /** Entries whose file was moved or deleted leave the list instead of showing as missing. */
  shelfRemoveMissing: boolean;
  /** An entry leaves the list once it has been dragged out somewhere. */
  shelfRemoveAfterDragOut: boolean;
  shelfMaxItems: number;
  shelfDoubleClick: ShelfDoubleClick;
  /** The collapsed island shows how many files are on the shelf. */
  shelfShowCount: boolean;
  /** Folder of .lrc files searched for the playing song's lyrics; empty for none. */
  lyricsFolder: string;
  /** Lyrics not in the folder are looked up on LRCLIB. */
  lyricsOnline: boolean;
  /** With online lyrics, also ask Kugou and NetEase (unofficial sources). */
  lyricsChinese: boolean;
  /** Lyrics shown this many ms later (positive) or earlier than the position Windows reports. */
  lyricsOffsetMs: number;
  mailEnabled: boolean;
  /** Show the running agent's icon and session title on the collapsed island. */
  agentTitleEnabled: boolean;
  /** Which of the agent, the lyric line and a todo the collapsed island shows first when several could. */
  collapsedPriority: CollapsedItem[];
  /** The playing song's cover on the collapsed island. */
  collapsedShowCover: boolean;
  /** Where the text and each status icon sit on the collapsed island, left to right. */
  collapsedLayout: CollapsedSlot[];
  /** Order of the page dots in the expanded island's header. */
  pageOrder: PageDot[];
  /** While a full-screen app (game, video, slides) is in front: no hover opening or focus, no message pop-ups. */
  gameDoNotDisturb: boolean;
  /** While a full-screen app is in front, the island tucks to the top edge and comes back after. */
  gameAutoTuck: boolean;
};

export type LegacyIslandSettings = Partial<IslandSettings> & {
  margin?: number;
  sizeScale?: number;
  taskTitleColor?: string;
  pendingTodoColor?: string;
};

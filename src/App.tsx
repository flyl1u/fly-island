import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  Bell,
  Check,
  CircleDot,
  ClipboardList,
  Copy,
  ExternalLink,
  ImageIcon,
  Keyboard,
  Languages,
  Minus,
  Pencil,
  RefreshCcw,
  RotateCcw,
  Save,
  Search,
  Settings,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  QQNotificationControls,
  useQQNotifications,
  type QQNotificationsController,
} from "./QQNotifications";
import {
  WeChatReminderControls,
  useWeChatReminders,
  type WeChatRemindersController,
} from "./WeChatReminders";
import { useQQMail, type QQMailController } from "./QQMail";
import { MessagesPanel, messagePanelHeight, type MessageView } from "./Messages";
import { MessageSourceIcon } from "./MessageSourceIcon";
import { CollapsedMessageContent } from "./CollapsedMessageContent";
import { latestMessagePreview, messagePreviewText, type MessageSource } from "./messagePreview";
import { UpdatePanel } from "./UpdatePanel";
import { useIdleTuck, useTodoRotation } from "./useIslandAutomation";
import {
  LOCALE_CODES,
  TRANSLATIONS,
  isLocaleCode,
  useTranslation,
  type LocaleCode,
  type Translations,
} from "./i18n";
import { getCollapsedTextUnits, getTodoTitleLineCount } from "./utils/text";
import { clamp } from "./utils/number";
import { HEX_COLOR_PATTERN, getColorSetting } from "./utils/color";
import { getLocalDateString } from "./utils/date";
import { ColorControl } from "./components/controls/ColorControl";
import { NumberControl } from "./components/controls/NumberControl";
import { SliderControl } from "./components/controls/SliderControl";
import { ToggleControl } from "./components/controls/ToggleControl";
import { TodoNotebook } from "./features/todos/TodoNotebook";
import type { ClipboardHistoryItem, ClipboardHistorySettings, ClipboardHistorySnapshot } from "./features/clipboard/api";
import { DEFAULT_CLIPBOARD_HISTORY } from "./features/clipboard/settings";
import { buildShortcutFromEvent, matchesClipboardShortcut, normalizeClipboardShortcut } from "./features/clipboard/shortcut";
import { MusicPlayerPanel } from "./features/media/MusicPlayerPanel";
import { MusicWaveButton } from "./features/media/MusicWaveButton";
import { DEFAULT_MEDIA_STATE, isSameMediaState } from "./features/media/mediaState";
import { MUSIC_SOURCE_PRIORITY_STORAGE_KEY, loadMusicSourcePriority, type KnownMediaSource } from "./features/media/storage";
import { getAudioLevel, getMediaState, sendMediaCommand, type MediaCommand, type MediaPlaybackStatus, type MediaState } from "./features/media/api";
import { TODO_SCROLL_START_ROWS } from "./features/todos/layout";
import { getDefaultTodoSaveDirectory, saveTodoMarkdown } from "./features/todos/api";
import { formatTodoDocumentAsMarkdown, getTodoSignature } from "./features/todos/markdown";
import {
  ACTIVE_TODO_STORAGE_KEY,
  DAILY_NOTE_STORAGE_KEY,
  TODOS_STORAGE_KEY,
  TODO_ARCHIVE_STORAGE_KEY,
  TODO_DATE_STORAGE_KEY,
  TODO_LAST_SAVED_SIGNATURE_STORAGE_KEY,
  TODO_SAVE_DIRECTORY_STORAGE_KEY,
  createTodoId,
  loadActiveTodoId,
  loadCurrentTodoDate,
  loadDailyNote,
  loadSaveDirectory,
  loadTodoArchives,
  loadTodos,
} from "./features/todos/storage";
import type {
  ArchiveLayout,
  SavePathState,
  SaveState,
  TodoArchive,
  TodoItem,
  TodoPageMode,
} from "./features/todos/types";
import "./App.css";

export type IslandMode = "collapsed" | "expanded";

type IslandPage = "todo" | "music" | "clipboard" | "qq";
type AgentProvider = "codex" | "claudeCode";
type AgentTaskPhase = "idle" | "running" | "completed" | "failed" | "stale";
type AgentVisualState = "idle" | "running" | "attention";

type AgentTaskStatus = {
  phase: AgentTaskPhase;
  taskId?: string;
  updatedAt: number;
};

type AgentStatusSnapshot = Record<AgentProvider, AgentTaskStatus> & {
  updatedAt: number;
  statusPath: string;
};

type AgentHooksInstallResult = {
  scriptsDir: string;
  statusPath: string;
  codexConfigPath: string;
  claudeConfigPath: string;
  installedAt: number;
};

type AgentHooksInstallState = "idle" | "installing" | "installed" | "error";
type AppearanceMode = "classic" | "liquidGlass";
type IslandFont = "system" | "pixel";
type NativeGlassState = "active" | "css-fallback" | "disabled";

type IslandPosition = {
  x: number;
  y: number;
};

type IslandSettings = {
  topEdgeLayoutVersion: 1;
  appearanceMode: AppearanceMode;
  fontFamily: IslandFont;
  glassIntensity: number;
  opacity: number;
  collapsedScale: number;
  expandedScale: number;
  marginY: number;
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

type IslandPreset = {
  id: string;
  name: string;
  settings: IslandSettings;
  createdAt: number;
  isDefault?: boolean;
};

type IslandShellProps = {
  qqMail: QQMailController;
  qqNotifications: QQNotificationsController;
  wechatReminders: WeChatRemindersController;
  onOpenMessages: (source: MessageSource) => void;
  mode: IslandMode;
  page: IslandPage;
  appearanceMode: AppearanceMode;
  nativeGlassState: NativeGlassState;
  isTucked: boolean;
  isDetached: boolean;
  showTitle: boolean;
  showCollapsedText: boolean;
  collapsedTaskTitle: string | null;
  collapsedTodoCount: number | null;
  mediaState: MediaState;
  agentVisualState: AgentVisualState;
  agentStatusLabel: string;
  onOpenPage: (page: IslandPage) => void;
  onWindowDragStart: () => void;
  onCollapse: () => void;
  onResetPosition: () => void;
  onMinimize: () => void;
  onOpenTranslator: () => void;
  onOpenSettings: () => void;
  onTuck: () => void;
  onReveal: () => void;
  onPageChange: (page: IslandPage) => void;
  children: ReactNode;
};

const STORAGE_KEY = "focusd-island-settings";
const COLLAPSED_TEXT_DEFAULT_MIGRATION_KEY =
  "focusd-island-collapsed-text-default-v1";
const SETTINGS_PRESETS_STORAGE_KEY = "focusd-island-setting-presets";
const ISLAND_POSITION_STORAGE_KEY = "focusd-island-position";
// Main island -> settings window request to reveal a section; survives the window being created.
const SETTINGS_FOCUS_STORAGE_KEY = "focusd-island-settings-focus";
const MIN_COLLAPSED_ISLAND_WIDTH = 280;
const MAX_COLLAPSED_ISLAND_WIDTH = 340;
const MIN_COLLAPSED_TEXT_UNITS = 2;
const MAX_COLLAPSED_TEXT_UNITS = 12;
const BASE_EXPANDED_ISLAND_HEIGHT = 306;
const TODO_ARCHIVE_EXPANDED_ISLAND_HEIGHT = 352;
const MUSIC_EXPANDED_ISLAND_HEIGHT = 320;
const MUSIC_SETTINGS_EXPANDED_ISLAND_HEIGHT = 320;
const CLIPBOARD_EXPANDED_ISLAND_HEIGHT = 430;
const TODO_ROW_HEIGHT = 46;
const TODO_GROW_START_ROWS = 2;
const MAX_CUSTOM_SETTING_PRESETS = 6;
const DEFAULT_TASK_TEXT_COLOR = "#ffffff";
const AUDIO_ACTIVE_THRESHOLD = 0.000015;
const DEFAULT_AGENT_TASK_STATUS: AgentTaskStatus = {
  phase: "idle",
  updatedAt: 0,
};
const DEFAULT_AGENT_STATUS: AgentStatusSnapshot = {
  codex: DEFAULT_AGENT_TASK_STATUS,
  claudeCode: DEFAULT_AGENT_TASK_STATUS,
  updatedAt: 0,
  statusPath: "",
};
const AGENT_PROVIDERS: AgentProvider[] = ["codex", "claudeCode"];
const AGENT_PROVIDER_LABELS: Record<AgentProvider, string> = {
  codex: "Codex",
  claudeCode: "Claude Code",
};
const DEFAULT_SETTINGS: IslandSettings = {
  topEdgeLayoutVersion: 1,
  appearanceMode: "liquidGlass",
  fontFamily: "system",
  glassIntensity: 72,
  opacity: 95,
  collapsedScale: 0.89,
  expandedScale: 0.91,
  marginY: 0,
  taskTextColor: DEFAULT_TASK_TEXT_COLOR,
  pulseColor: "#3ae489",
  pulseBrightness: 100,
  islandBackgroundColor: "#2F2F37",
  todoBackgroundColor: "#ffffff",
  showTitle: false,
  showCollapsedText: true,
  showIdleTodoCount: true,
  carryOverIncompleteTodos: false,
  enableTodoReorder: false,
  rotateTodos: false,
  todoRotationSeconds: 5,
  autoTuck: false,
  autoTuckSeconds: 30,
};
const LEGACY_DEFAULT_PRESET_IDS = new Set(["default-white", "default-khaki"]);
const LEGACY_DEFAULT_PRESET_NAMES = new Set(["白色", "卡其"]);

type LegacyIslandSettings = Partial<IslandSettings> & {
  margin?: number;
  sizeScale?: number;
  taskTitleColor?: string;
  pendingTodoColor?: string;
};

function isAgentAttentionPhase(phase: AgentTaskPhase) {
  return phase === "failed" || phase === "stale";
}

function getAgentVisualState(snapshot: AgentStatusSnapshot): AgentVisualState {
  const statuses = AGENT_PROVIDERS.map((provider) => snapshot[provider]);

  if (statuses.some((status) => isAgentAttentionPhase(status.phase))) {
    return "attention";
  }

  if (statuses.some((status) => status.phase === "running")) {
    return "running";
  }

  return "idle";
}

function getAgentStatusLabel(snapshot: AgentStatusSnapshot, t: Translations) {
  const attentionProvider = AGENT_PROVIDERS.find((provider) =>
    isAgentAttentionPhase(snapshot[provider].phase),
  );

  if (attentionProvider) {
    const phase = snapshot[attentionProvider].phase;
    const providerLabel = AGENT_PROVIDER_LABELS[attentionProvider];
    return phase === "stale"
      ? t.agent.stale(providerLabel)
      : t.agent.failed(providerLabel);
  }

  const runningProvider = AGENT_PROVIDERS.find(
    (provider) => snapshot[provider].phase === "running",
  );

  if (runningProvider) {
    return t.agent.running(AGENT_PROVIDER_LABELS[runningProvider]);
  }

  return t.agent.idleOrDone;
}

function getAgentPhaseLabel(phase: AgentTaskPhase, t: Translations) {
  switch (phase) {
    case "running":
      return t.agent.phase.running;
    case "completed":
      return t.agent.phase.completed;
    case "failed":
      return t.agent.phase.failed;
    case "stale":
      return t.agent.phase.stale;
    case "idle":
    default:
      return t.agent.phase.idle;
  }
}

function hexToRgba(hex: string, alpha: number) {
  const normalized = HEX_COLOR_PATTERN.test(hex)
    ? hex.slice(1)
    : DEFAULT_SETTINGS.pulseColor.slice(1);
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function normalizeSettings(
  settings: LegacyIslandSettings | null | undefined,
): IslandSettings {
  const taskTextColor = getColorSetting(
    settings?.taskTextColor ?? settings?.pendingTodoColor,
    getColorSetting(settings?.taskTitleColor, DEFAULT_SETTINGS.taskTextColor),
  );
  const hasPreviousDefaultScales =
    settings?.collapsedScale === 0.81 && settings.expandedScale === 0.88;
  const collapsedScale = hasPreviousDefaultScales
    ? 0.82
    : settings?.collapsedScale ?? settings?.sizeScale ?? DEFAULT_SETTINGS.collapsedScale;
  const expandedScale = hasPreviousDefaultScales
    ? DEFAULT_SETTINGS.expandedScale
    : settings?.expandedScale ?? settings?.sizeScale ?? DEFAULT_SETTINGS.expandedScale;
  const marginY = settings?.marginY ?? settings?.margin ?? DEFAULT_SETTINGS.marginY;
  const hasPreviousDefaultMargin =
    settings?.topEdgeLayoutVersion !== 1 && (marginY === 31 || marginY === 12);

  return {
    topEdgeLayoutVersion: 1,
    fontFamily: settings?.fontFamily === "pixel" ? "pixel" : "system",
    appearanceMode:
      settings?.appearanceMode === "classic" ||
      settings?.appearanceMode === "liquidGlass"
        ? settings.appearanceMode
        : "classic",
    glassIntensity: clamp(
      Number(settings?.glassIntensity ?? DEFAULT_SETTINGS.glassIntensity),
      25,
      100,
    ),
    opacity: clamp(Number(settings?.opacity ?? DEFAULT_SETTINGS.opacity), 50, 100),
    collapsedScale: clamp(
      Number(collapsedScale),
      0.75,
      1.4,
    ),
    expandedScale: clamp(
      Number(expandedScale),
      0.75,
      1.4,
    ),
    marginY: clamp(
      Number(hasPreviousDefaultMargin ? DEFAULT_SETTINGS.marginY : marginY),
      0,
      160,
    ),
    taskTextColor,
    pulseColor: getColorSetting(
      settings?.pulseColor,
      DEFAULT_SETTINGS.pulseColor,
    ),
    pulseBrightness: clamp(
      Number(settings?.pulseBrightness ?? DEFAULT_SETTINGS.pulseBrightness),
      50,
      160,
    ),
    islandBackgroundColor: getColorSetting(
      settings?.islandBackgroundColor,
      DEFAULT_SETTINGS.islandBackgroundColor,
    ),
    todoBackgroundColor: getColorSetting(
      settings?.todoBackgroundColor,
      DEFAULT_SETTINGS.todoBackgroundColor,
    ),
    showTitle:
      typeof settings?.showTitle === "boolean"
        ? settings.showTitle
        : DEFAULT_SETTINGS.showTitle,
    showCollapsedText:
      typeof settings?.showCollapsedText === "boolean"
        ? settings.showCollapsedText
        : DEFAULT_SETTINGS.showCollapsedText,
    showIdleTodoCount:
      typeof settings?.showIdleTodoCount === "boolean"
        ? settings.showIdleTodoCount
        : DEFAULT_SETTINGS.showIdleTodoCount,
    carryOverIncompleteTodos:
      typeof settings?.carryOverIncompleteTodos === "boolean"
        ? settings.carryOverIncompleteTodos
        : DEFAULT_SETTINGS.carryOverIncompleteTodos,
    enableTodoReorder:
      typeof settings?.enableTodoReorder === "boolean"
        ? settings.enableTodoReorder
        : DEFAULT_SETTINGS.enableTodoReorder,
    rotateTodos: settings?.rotateTodos === true,
    todoRotationSeconds: typeof settings?.todoRotationSeconds === "number" && Number.isFinite(settings.todoRotationSeconds)
      ? clamp(Math.round(settings.todoRotationSeconds), 1, 3_600)
      : DEFAULT_SETTINGS.todoRotationSeconds,
    autoTuck: settings?.autoTuck === true,
    autoTuckSeconds: typeof settings?.autoTuckSeconds === "number" && Number.isFinite(settings.autoTuckSeconds)
      ? clamp(Math.round(settings.autoTuckSeconds), 1, 3_600)
      : DEFAULT_SETTINGS.autoTuckSeconds,
  };
}

function getDefaultSettingPresets(): IslandPreset[] {
  return [];
}

function mergeWithDefaultSettingPresets(presets: IslandPreset[]) {
  const defaultPresets = getDefaultSettingPresets();
  const customPresets = presets
    .filter(
      (preset) =>
        !preset.isDefault &&
        !LEGACY_DEFAULT_PRESET_IDS.has(preset.id) &&
        !LEGACY_DEFAULT_PRESET_NAMES.has(preset.name.trim()),
    )
    .map((preset) => ({ ...preset, isDefault: false }))
    .slice(0, MAX_CUSTOM_SETTING_PRESETS);

  return [...defaultPresets, ...customPresets];
}

function isDefaultSettingPreset(presetId: string) {
  return LEGACY_DEFAULT_PRESET_IDS.has(presetId);
}

function getCollapsedIslandWidth(text: string) {
  const visualUnits = getCollapsedTextUnits(text);
  const widthProgress =
    (clamp(
      visualUnits,
      MIN_COLLAPSED_TEXT_UNITS,
      MAX_COLLAPSED_TEXT_UNITS,
    ) -
      MIN_COLLAPSED_TEXT_UNITS) /
    (MAX_COLLAPSED_TEXT_UNITS - MIN_COLLAPSED_TEXT_UNITS);

  return Math.round(
    MIN_COLLAPSED_ISLAND_WIDTH +
      widthProgress *
        (MAX_COLLAPSED_ISLAND_WIDTH - MIN_COLLAPSED_ISLAND_WIDTH),
  );
}

function getTodoVisualRows(todoList: TodoItem[]) {
  return todoList.reduce(
    (total, todo) => total + getTodoTitleLineCount(todo.title),
    0,
  );
}

function loadSettings(): IslandSettings {
  const stored = window.localStorage.getItem(STORAGE_KEY);

  if (!stored) {
    window.localStorage.setItem(COLLAPSED_TEXT_DEFAULT_MIGRATION_KEY, "1");
    return DEFAULT_SETTINGS;
  }

  try {
    const parsed = JSON.parse(stored) as Partial<IslandSettings> & {
      margin?: number;
    };
    const normalized = normalizeSettings(parsed);

    if (
      window.localStorage.getItem(COLLAPSED_TEXT_DEFAULT_MIGRATION_KEY) !== "1"
    ) {
      const migrated = { ...normalized, showCollapsedText: true };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      window.localStorage.setItem(COLLAPSED_TEXT_DEFAULT_MIGRATION_KEY, "1");
      return migrated;
    }

    return normalized;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function loadIslandPosition(): IslandPosition | null {
  const stored = window.localStorage.getItem(ISLAND_POSITION_STORAGE_KEY);

  if (!stored) {
    return null;
  }

  try {
    const position = JSON.parse(stored) as Partial<IslandPosition>;
    if (
      typeof position.x !== "number" ||
      typeof position.y !== "number" ||
      !Number.isFinite(position.x) ||
      !Number.isFinite(position.y)
    ) {
      return null;
    }

    return { x: Math.round(position.x), y: Math.round(position.y) };
  } catch {
    return null;
  }
}

function loadSettingPresets(t: Translations): IslandPreset[] {
  const stored = window.localStorage.getItem(SETTINGS_PRESETS_STORAGE_KEY);

  if (!stored) {
    return getDefaultSettingPresets();
  }

  try {
    const parsed = JSON.parse(stored) as Partial<IslandPreset>[];

    if (!Array.isArray(parsed)) {
      return getDefaultSettingPresets();
    }

    const presets = parsed
      .map((preset, index) => ({
        id:
          typeof preset.id === "string" && preset.id
            ? preset.id
            : createTodoId(),
        name:
          typeof preset.name === "string" && preset.name.trim()
            ? preset.name.trim()
            : t.settings.presets.defaultName(index + 1),
        settings: normalizeSettings(preset.settings),
        createdAt:
          typeof preset.createdAt === "number" ? preset.createdAt : Date.now(),
        isDefault: false,
      }));

    return mergeWithDefaultSettingPresets(presets);
  } catch {
    return getDefaultSettingPresets();
  }
}

function isSameSettings(a: IslandSettings, b: IslandSettings) {
  return (Object.keys(a) as (keyof IslandSettings)[]).every(
    (key) => a[key] === b[key],
  );
}

type SettingsFocusSection = "savePath";

function openSettingsWindow(section?: SettingsFocusSection) {
  if (section) {
    window.localStorage.setItem(
      SETTINGS_FOCUS_STORAGE_KEY,
      JSON.stringify({ section, requestedAt: Date.now() }),
    );
  }

  void invoke("open_settings_window").catch((error) => {
    console.error("Failed to open settings window", error);
  });
}

export function IslandShell({
  qqMail,
  qqNotifications,
  wechatReminders,
  onOpenMessages,
  mode,
  page,
  appearanceMode,
  nativeGlassState,
  isTucked,
  isDetached,
  showTitle,
  showCollapsedText,
  collapsedTaskTitle,
  collapsedTodoCount,
  mediaState,
  agentVisualState,
  agentStatusLabel,
  onOpenPage,
  onWindowDragStart,
  onCollapse,
  onResetPosition,
  onMinimize,
  onOpenTranslator,
  onOpenSettings,
  onTuck,
  onReveal,
  onPageChange,
  children,
}: IslandShellProps) {
  const t = useTranslation();
  const glassFrameRef = useRef<number | null>(null);
  const didDragRef = useRef(false);
  const windowDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
  } | null>(null);
  const isExpanded = mode === "expanded";
  const [isPreparing, setIsPreparing] = useState(isTauri);
  const qqPreview = qqNotifications.preview;
  const qqNotificationCount = qqNotifications.snapshot.items.length;
  const wechatPending = wechatReminders.snapshot.pending;
  const wechatPreviewAt = wechatReminders.previewReceivedAt;
  const [latestPreviewAt, setLatestPreviewAt] = useState(0);
  const preview = latestMessagePreview([
    qqPreview ? { ...qqPreview, source: "qq", receivedAt: qqNotifications.previewReceivedAt ?? 0 } : null,
    wechatPreviewAt !== null ? { source: "wechat", title: t.messages.wechat, body: t.messages.newReminder, receivedAt: wechatPreviewAt } : null,
    qqMail.preview ? { source: "qqMail", title: qqMail.preview.sender, body: qqMail.preview.subject, receivedAt: qqMail.previewReceivedAt ?? 0 } : null,
  ], latestPreviewAt);
  if (preview && preview.receivedAt > latestPreviewAt) setLatestPreviewAt(preview.receivedAt);
  const messageBadgeLabel = t.messages.badge(qqNotificationCount, wechatPending);
  const isLiquidGlass = appearanceMode === "liquidGlass";
  const isMusicPlaying = mediaState.playbackStatus === "playing";
  const className = [
    "island",
    `island--${mode}`,
    `island--${page}`,
    `island--appearance-${appearanceMode}`,
    isPreparing && !isExpanded ? "island--preparing" : "",
    isDetached ? "island--detached" : "island--docked",
    isLiquidGlass ? `island--glass-${nativeGlassState}` : "",
    showTitle ? "" : "island--title-hidden",
  ]
    .filter(Boolean)
    .join(" ");
  const pulseClassName = [
    "island__pulse",
    `island__pulse--agent-${agentVisualState}`,
  ].join(" ");
  const agentStatusIconClassName = [
    "island__agent-status-icon",
    `island__agent-status-icon--${agentVisualState}`,
  ].join(" ");
  const collapsedLabel = showCollapsedText
    ? collapsedTaskTitle
      ? t.messages.collapsedTask(collapsedTaskTitle)
      : collapsedTodoCount !== null
        ? t.island.pendingTodos(collapsedTodoCount)
        : "fly-island"
    : "fly-island";

  useEffect(
    () => () => {
      if (glassFrameRef.current !== null) {
        window.cancelAnimationFrame(glassFrameRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!isPreparing) {
      return;
    }
    if (isExpanded) {
      setIsPreparing(false);
      return;
    }

    let didCancel = false;
    let frame: number | null = null;
    let timer: number | null = null;
    // Opacity zero skips rasterization. Give the first panel a brief paint at
    // sub-pixel alpha while it is inert, before the first user-triggered reveal.
    void document.fonts.ready.then(() => {
      if (didCancel) {
        return;
      }
      frame = window.requestAnimationFrame(() => {
        frame = window.requestAnimationFrame(() => {
          timer = window.setTimeout(() => setIsPreparing(false), 180);
        });
      });
    });

    return () => {
      didCancel = true;
      if (frame !== null) window.cancelAnimationFrame(frame);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [isExpanded, isPreparing]);

  const handleGlassPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (
        !isLiquidGlass ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
        glassFrameRef.current !== null
      ) {
        return;
      }

      const island = event.currentTarget;
      const rect = island.getBoundingClientRect();
      const pointerX = clamp((event.clientX - rect.left) / rect.width, 0, 1);
      const pointerY = clamp((event.clientY - rect.top) / rect.height, 0, 1);

      glassFrameRef.current = window.requestAnimationFrame(() => {
        glassFrameRef.current = null;
        island.style.setProperty("--glass-pointer-x", `${pointerX * 100}%`);
        island.style.setProperty("--glass-pointer-y", `${pointerY * 100}%`);
      });
    },
    [isLiquidGlass],
  );

  const resetGlassPointer = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!isLiquidGlass) {
        return;
      }

      if (glassFrameRef.current !== null) {
        window.cancelAnimationFrame(glassFrameRef.current);
        glassFrameRef.current = null;
      }

      event.currentTarget.style.setProperty("--glass-pointer-x", "50%");
      event.currentTarget.style.setProperty("--glass-pointer-y", "18%");
    },
    [isLiquidGlass],
  );

  const prepareWindowDrag = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      didDragRef.current = false;
      if (event.button !== 0 || isTucked) {
        return;
      }

      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(
          "button:not(.island__open-button), input, textarea, select, a, [contenteditable='true'], [data-window-drag='false']",
        )
      ) {
        return;
      }

      windowDragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [isTucked],
  );

  const handleWindowDragMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const drag = windowDragRef.current;
      if (!drag || drag.pointerId !== event.pointerId || event.buttons !== 1) {
        return;
      }

      if (
        Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 3
      ) {
        return;
      }

      windowDragRef.current = null;
      didDragRef.current = true;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      event.preventDefault();
      onWindowDragStart();
    },
    [onWindowDragStart],
  );

  const cancelWindowDrag = useCallback(() => {
    windowDragRef.current = null;
  }, []);

  return (
    <section
      className={className}
      aria-label={collapsedLabel}
      onClick={(event) => {
        if (!isExpanded && event.target === event.currentTarget) {
          onOpenPage(page);
        }
      }}
      onPointerMove={handleGlassPointerMove}
      onPointerLeave={resetGlassPointer}
      onMouseEnter={() => {
        if (isTucked) {
          onReveal();
        }
      }}
    >
      <div className="island__surface">
        {isLiquidGlass && (
          <div className="island__glass" aria-hidden="true">
            <span className="island__glass-refraction" />
            <span className="island__glass-highlight" />
          </div>
        )}
        <div
          className="island__collapsed"
          aria-hidden={isExpanded}
          inert={isExpanded}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              onOpenPage(page);
            }
          }}
        >
          <button
            className="island__open-button"
            type="button"
            aria-label={preview ? t.messages.openPreview(messagePreviewText(preview, t.messages), t.messages.sourceLabels[preview.source]) : t.messages.expand(collapsedLabel)}
            aria-expanded={preview ? undefined : isExpanded}
            aria-controls={preview ? undefined : "island-panel"}
            onPointerDown={prepareWindowDrag}
            onPointerMove={handleWindowDragMove}
            onPointerUp={cancelWindowDrag}
            onPointerCancel={cancelWindowDrag}
            onClick={(event) => {
              if (event.detail === 0 || !didDragRef.current) {
                if (preview) {
                  if (preview.source === "qqMail" && qqMail.preview) {
                    onOpenMessages("qqMail");
                    void qqMail.readMail(qqMail.preview);
                    return;
                  }
                  const open = preview.source === "qq" ? qqNotifications.openQQ : wechatReminders.openWeChat;
                  void open().then((opened) => {
                    if (opened === false) onOpenMessages(preview.source);
                  });
                } else {
                  onOpenPage(page);
                }
              }
            }}
          >
            <span className={pulseClassName} title={agentStatusLabel} />
            <CollapsedMessageContent preview={preview} enabled={!isExpanded && !isTucked}>
              {showCollapsedText && showTitle && (
                <span className="island__brand">fly-island</span>
              )}
              {showCollapsedText && collapsedTaskTitle && (
                <span className="island__active-task" key={collapsedTaskTitle}>
                  {showTitle ? "· " : ""}
                  {collapsedTaskTitle}
                </span>
              )}
              {showCollapsedText && !collapsedTaskTitle && collapsedTodoCount !== null && (
                <span className="island__todo-count">
                  {showTitle ? "· " : ""}
                  {t.island.pendingTodos(collapsedTodoCount)}
                </span>
              )}
            </CollapsedMessageContent>
          </button>
          {qqMail.preview !== null && (
            <button className="island-message-button island-message-button--compact qq-mail-badge" type="button" aria-label={t.messages.newMailLabel} title={t.messages.openNewMail} onClick={() => onOpenMessages("qqMail")}>
              <MessageSourceIcon source="qqMail" size={16} />
              <span className="island-message-button__dot" aria-hidden="true" />
            </button>
          )}
          <MusicWaveButton
            isAvailable={mediaState.available || mediaState.audioActive}
            isPlaying={isMusicPlaying}
            audioPeak={mediaState.audioPeak}
            label={t.island.openMusic}
            onClick={() => onOpenPage("music")}
          />
          <button
            className="island__quiet-button"
            type="button"
            title={t.island.collapse}
            aria-label={t.island.collapseIsland}
            onClick={(event) => {
              event.stopPropagation();
              onTuck();
            }}
          />
        </div>

        <div
          id="island-panel"
          className="island__expanded"
          aria-hidden={!isExpanded}
          inert={!isExpanded}
        >
          <header className="island__header">
            <div className="island__title">
              <CircleDot
                className={agentStatusIconClassName}
                size={16}
                strokeWidth={2.2}
                aria-label={agentStatusLabel}
              />
              {showTitle && <span>fly-island</span>}
            </div>

            <div
              className="editor-dots"
              aria-label={t.island.editor}
            >
              <button
                className={`dot-button dot-button--todo ${
                  page === "todo" ? "dot-button--active" : ""
                }`}
                type="button"
                title={t.island.todoList}
                aria-label={t.island.todoList}
                onClick={(event) => {
                  event.stopPropagation();
                  onPageChange("todo");
                }}
              />
              <button
                className={`dot-button dot-button--music ${
                  page === "music" ? "dot-button--active" : ""
                }`}
                type="button"
                title={t.island.music}
                aria-label={t.island.music}
                onClick={(event) => {
                  event.stopPropagation();
                  onPageChange("music");
                }}
              />
              <button
                className={`dot-button dot-button--clipboard ${
                  page === "clipboard" ? "dot-button--active" : ""
                }`}
                type="button"
                title={t.island.clipboardHistory}
                aria-label={t.island.clipboardHistory}
                onClick={(event) => {
                  event.stopPropagation();
                  onPageChange("clipboard");
                }}
              />
            </div>

            <button
              className="island__collapse-target"
              type="button"
              aria-label={t.island.collapseIsland}
              data-window-drag="false"
              onClick={onCollapse}
            />

            <div className="window-actions">
              <button
                className="icon-button"
                type="button"
                title={t.settings.title}
                aria-label={t.settings.title}
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenSettings();
                }}
              >
                <Settings size={17} strokeWidth={1.8} aria-hidden="true" />
              </button>
              <button className={`icon-button island-message-button${page === "qq" ? " island-message-button--active" : ""}`} type="button" aria-label={t.messages.label(messageBadgeLabel)} aria-pressed={page === "qq"} title={t.messages.title} onClick={() => onOpenMessages(wechatPending ? "wechat" : "qq")}>
                <Bell size={17} strokeWidth={1.8} />
                {(qqNotificationCount > 0 || wechatPending) && <span className="island-message-button__dot" aria-hidden="true" />}
              </button>
              <button
                className="icon-button island-translate-button"
                type="button"
                title={`${t.translator.title} (Alt+C)`}
                aria-label={t.translator.title}
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenTranslator();
                }}
              >
                <Languages size={18} strokeWidth={1.9} aria-hidden="true" />
              </button>
              <button
                className={`icon-button island-reset-button${
                  isDetached ? " island-reset-button--available" : ""
                }`}
                type="button"
                title={t.island.resetPositionLabel}
                aria-label={t.island.resetPositionLabel}
                onClick={(event) => {
                  event.stopPropagation();
                  onResetPosition();
                }}
              >
                <RotateCcw size={16} strokeWidth={2} aria-hidden="true" />
              </button>
              <button
                className="icon-button"
                type="button"
                title={t.island.minimizeToTray}
                aria-label={t.island.minimizeToTray}
                onClick={(event) => {
                  event.stopPropagation();
                  onMinimize();
                }}
              >
                <Minus size={18} strokeWidth={2.2} />
              </button>
            </div>
          </header>
          <div className="island__content">{children}</div>
        </div>
      </div>
    </section>
  );
}

function AppearanceModeControl({
  value,
  onChange,
}: {
  value: AppearanceMode;
  onChange: (value: AppearanceMode) => void;
}) {
  const t = useTranslation();
  return (
    <div className="appearance-mode-control">
      <span>{t.settings.appearance.title}</span>
      <div className="appearance-mode-control__segments" role="group">
        <button
          className={value === "classic" ? "appearance-mode-control--active" : ""}
          type="button"
          aria-pressed={value === "classic"}
          onClick={() => onChange("classic")}
        >
          {t.settings.appearance.classic}
        </button>
        <button
          className={
            value === "liquidGlass" ? "appearance-mode-control--active" : ""
          }
          type="button"
          aria-pressed={value === "liquidGlass"}
          onClick={() => onChange("liquidGlass")}
        >
          {t.settings.appearance.liquidGlass}
        </button>
      </div>
    </div>
  );
}

function LocaleControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: LocaleCode;
  onChange: (locale: LocaleCode) => void;
}) {
  return (
    <label className="locale-control">
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => {
          const next = event.currentTarget.value;
          if (isLocaleCode(next)) {
            onChange(next);
          }
        }}
      >
        {LOCALE_CODES.map((code) => (
          <option key={code} value={code}>
            {TRANSLATIONS[code].localeLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function LayoutEditor({
  locale,
  settings,
  qqNotifications,
  wechatReminders,
  clipboardSettings,
  saveDirectoryDraft,
  savePathState,
  highlightSavePath,
  focusClipboardShortcutToken,
  presets,
  launchAtStartup,
  agentStatus,
  clearingAgentProvider,
  agentHooksInstallState,
  agentHooksInstallResult,
  agentHooksInstallError,
  onLocaleChange,
  onSettingsChange,
  onClipboardSettingsChange,
  onReset,
  onSaveDirectoryDraftChange,
  onSaveDirectory,
  onSavePreset,
  onApplyPreset,
  onRenamePreset,
  onDeletePreset,
  onLaunchAtStartupChange,
  onClearAgentStatus,
  onInstallAgentHooks,
  onClipboardShortcutFocusHandled,
}: {
  locale: LocaleCode;
  settings: IslandSettings;
  qqNotifications: QQNotificationsController;
  wechatReminders: WeChatRemindersController;
  clipboardSettings: ClipboardHistorySettings;
  saveDirectoryDraft: string;
  savePathState: SavePathState;
  highlightSavePath: boolean;
  focusClipboardShortcutToken: number;
  presets: IslandPreset[];
  launchAtStartup: boolean;
  agentStatus: AgentStatusSnapshot;
  clearingAgentProvider: AgentProvider | null;
  agentHooksInstallState: AgentHooksInstallState;
  agentHooksInstallResult: AgentHooksInstallResult | null;
  agentHooksInstallError: string;
  onLocaleChange: (locale: LocaleCode) => void;
  onSettingsChange: (settings: IslandSettings) => void;
  onClipboardSettingsChange: (settings: ClipboardHistorySettings) => void;
  onReset: () => void;
  onSaveDirectoryDraftChange: (value: string) => void;
  onSaveDirectory: () => void;
  onSavePreset: () => void;
  onApplyPreset: (presetId: string) => void;
  onRenamePreset: (presetId: string, name: string) => void;
  onDeletePreset: (presetId: string) => void;
  onLaunchAtStartupChange: (enabled: boolean) => void;
  onClearAgentStatus: (provider: AgentProvider) => void;
  onInstallAgentHooks: () => void;
  onClipboardShortcutFocusHandled: () => void;
}) {
  const t = useTranslation();
  const savePathPanelRef = useRef<HTMLElement | null>(null);
  const savePathInputRef = useRef<HTMLInputElement | null>(null);
  const clipboardShortcutPanelRef = useRef<HTMLElement | null>(null);
  const clipboardShortcutButtonRef = useRef<HTMLButtonElement | null>(null);
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [presetNameDraft, setPresetNameDraft] = useState("");
  const [isRecordingShortcut, setIsRecordingShortcut] = useState(false);
  const [projectLinkFailed, setProjectLinkFailed] = useState(false);

  const openProjectLink = async (event: ReactMouseEvent<HTMLAnchorElement>) => {
    if (!isTauri()) {
      return;
    }

    event.preventDefault();
    const url = event.currentTarget.href;
    setProjectLinkFailed(false);

    try {
      await openUrl(url);
    } catch (error) {
      console.error("Failed to open project link", error);
      setProjectLinkFailed(true);
    }
  };

  const startPresetRename = useCallback((preset: IslandPreset) => {
    setEditingPresetId(preset.id);
    setPresetNameDraft(preset.name);
  }, []);

  const commitPresetRename = useCallback(() => {
    if (!editingPresetId) {
      return;
    }

    onRenamePreset(editingPresetId, presetNameDraft);
    setEditingPresetId(null);
    setPresetNameDraft("");
  }, [editingPresetId, onRenamePreset, presetNameDraft]);

  useEffect(() => {
    if (!highlightSavePath) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const editorPanel = savePathPanelRef.current?.closest(".editor-panel");

      if (editorPanel instanceof HTMLElement && savePathPanelRef.current) {
        editorPanel.scrollTo({
          top: savePathPanelRef.current.offsetTop - 12,
          behavior: "smooth",
        });
      }

      savePathInputRef.current?.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [highlightSavePath]);

  useEffect(() => {
    if (focusClipboardShortcutToken <= 0) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const editorPanel = clipboardShortcutPanelRef.current?.closest(".editor-panel");

      if (editorPanel instanceof HTMLElement && clipboardShortcutPanelRef.current) {
        const targetTop = clipboardShortcutPanelRef.current.offsetTop - 12;
        editorPanel.scrollTo({ top: targetTop, behavior: "smooth" });
      }

      clipboardShortcutButtonRef.current?.focus({ preventScroll: true });
      setIsRecordingShortcut(true);
      onClipboardShortcutFocusHandled();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [focusClipboardShortcutToken, onClipboardShortcutFocusHandled]);

  const handleShortcutKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (!isRecordingShortcut) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (event.key === "Escape") {
        setIsRecordingShortcut(false);
        return;
      }

      const shortcut = buildShortcutFromEvent(event.nativeEvent);

      if (!shortcut) {
        return;
      }

      onClipboardSettingsChange({
        ...clipboardSettings,
        shortcut,
      });
      setIsRecordingShortcut(false);
    },
    [clipboardSettings, isRecordingShortcut, onClipboardSettingsChange],
  );

  const agentStatusRows = AGENT_PROVIDERS.map((provider) => {
    const status = agentStatus[provider];
    return {
      provider,
      label: AGENT_PROVIDER_LABELS[provider],
      phase: status.phase,
      phaseLabel: getAgentPhaseLabel(status.phase, t),
      needsAttention: isAgentAttentionPhase(status.phase),
    };
  });
  const agentStatusLabel = getAgentStatusLabel(agentStatus, t);

  return (
    <div className="editor-panel">
      <div className="editor-panel__header">
        <span>{t.settings.title}</span>
        <button
          className="reset-button"
          type="button"
          title={t.settings.reset}
          aria-label={t.settings.reset}
          onClick={onReset}
        >
          <RefreshCcw size={15} strokeWidth={2.2} />
        </button>
      </div>

      <section className="settings-section settings-section--language">
        <div className="settings-section__header">
          <span>{t.settings.language.title}</span>
        </div>
        <LocaleControl
          label={t.settings.language.label}
          value={locale}
          onChange={onLocaleChange}
        />
      </section>

      <section className="settings-section settings-section--layout">
        <div className="settings-section__header">
          <span>{t.settings.layout.title}</span>
        </div>
        <AppearanceModeControl
          value={settings.appearanceMode}
          onChange={(appearanceMode) =>
            onSettingsChange({ ...settings, appearanceMode })
          }
        />
        <div className="appearance-mode-control">
          <span>{t.settings.appearance.font}</span>
          <div className="appearance-mode-control__segments" role="group" aria-label={t.settings.appearance.fontLabel}>
            {([["system", t.settings.appearance.systemFont], ["pixel", t.settings.appearance.pixelFont]] as const).map(([fontFamily, label]) => (
              <button
                key={fontFamily}
                className={settings.fontFamily === fontFamily ? "appearance-mode-control--active" : ""}
                type="button"
                aria-pressed={settings.fontFamily === fontFamily}
                onClick={() => onSettingsChange({ ...settings, fontFamily })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {settings.appearanceMode === "liquidGlass" && (
          <SliderControl
            label={t.settings.appearance.glassStrength}
            value={settings.glassIntensity}
            min={25}
            max={100}
            step={1}
            suffix="%"
            onChange={(glassIntensity) =>
              onSettingsChange({ ...settings, glassIntensity })
            }
          />
        )}
        <SliderControl
          label={t.settings.layout.opacity}
          value={settings.opacity}
          min={50}
          max={100}
          step={1}
          suffix="%"
          onChange={(opacity) => onSettingsChange({ ...settings, opacity })}
        />
        <SliderControl
          label={t.settings.layout.collapsedScale}
          value={settings.collapsedScale}
          min={0.75}
          max={1.4}
          step={0.01}
          suffix="x"
          onChange={(collapsedScale) => onSettingsChange({ ...settings, collapsedScale })}
        />
        <SliderControl
          label={t.settings.layout.expandedScale}
          value={settings.expandedScale}
          min={0.75}
          max={1.4}
          step={0.01}
          suffix="x"
          onChange={(expandedScale) => onSettingsChange({ ...settings, expandedScale })}
        />
        <SliderControl
          label={t.settings.layout.marginY}
          value={settings.marginY}
          min={0}
          max={160}
          step={1}
          suffix="px"
          onChange={(marginY) => onSettingsChange({ ...settings, marginY })}
        />
        <ToggleControl
          label={t.settings.layout.launchAtStartup}
          checked={launchAtStartup}
          onChange={onLaunchAtStartupChange}
        />
        <ToggleControl
          label={t.settings.layout.showCollapsedText}
          checked={settings.showCollapsedText}
          onChange={(showCollapsedText) =>
            onSettingsChange({ ...settings, showCollapsedText })
          }
        />
        <ToggleControl
          label={t.settings.layout.showIdleTodoCount}
          checked={settings.showIdleTodoCount}
          onChange={(showIdleTodoCount) =>
            onSettingsChange({ ...settings, showIdleTodoCount })
          }
        />
        <ToggleControl
          label={t.settings.layout.showTitle}
          checked={settings.showTitle}
          onChange={(showTitle) => onSettingsChange({ ...settings, showTitle })}
        />
        <ToggleControl
          label={t.settings.layout.autoTuck}
          checked={settings.autoTuck}
          onChange={(autoTuck) => onSettingsChange({ ...settings, autoTuck })}
        />
        {settings.autoTuck && (
          <NumberControl
            label={t.settings.layout.autoTuckSeconds}
            value={settings.autoTuckSeconds}
            min={1}
            max={3_600}
            onChange={(autoTuckSeconds) => onSettingsChange({ ...settings, autoTuckSeconds })}
          />
        )}
      </section>

      <section className="settings-section settings-section--messages">
        <div className="settings-section__header"><span>{t.settings.messageReception}</span></div>
        <QQNotificationControls controller={qqNotifications} />
        <WeChatReminderControls controller={wechatReminders} />
      </section>

      <section className="settings-section settings-section--todo">
        <div className="settings-section__header">
          <span>{t.settings.todo.title}</span>
        </div>
        <ToggleControl
          label={t.settings.todo.carryOverIncomplete}
          checked={settings.carryOverIncompleteTodos}
          onChange={(carryOverIncompleteTodos) =>
            onSettingsChange({ ...settings, carryOverIncompleteTodos })
          }
        />
        <ToggleControl
          label={t.settings.todo.enableReorder}
          checked={settings.enableTodoReorder}
          onChange={(enableTodoReorder) =>
            onSettingsChange({ ...settings, enableTodoReorder })
          }
        />
        <ToggleControl
          label={t.settings.todo.rotateTodos}
          checked={settings.rotateTodos}
          onChange={(rotateTodos) => onSettingsChange({ ...settings, rotateTodos })}
        />
        {settings.rotateTodos && (
          <NumberControl
            label={t.settings.todo.rotationSeconds}
            value={settings.todoRotationSeconds}
            min={1}
            max={3_600}
            onChange={(todoRotationSeconds) => onSettingsChange({ ...settings, todoRotationSeconds })}
          />
        )}
      </section>

      <section className="settings-section settings-section--agent-hooks">
        <div className="settings-section__header">
          <span>{t.settings.agent.title}</span>
          <button
            className={[
              "agent-hooks-button",
              agentHooksInstallState === "installed"
                ? "agent-hooks-button--installed"
                : "",
            ]
              .filter(Boolean)
              .join(" ")}
            type="button"
            disabled={agentHooksInstallState === "installing"}
            onClick={onInstallAgentHooks}
          >
            {agentHooksInstallState === "installed" ? (
              <Check size={13} strokeWidth={2.6} />
            ) : (
              <RefreshCcw size={13} strokeWidth={2.4} />
            )}
            <span>
              {agentHooksInstallState === "installing"
                ? t.settings.agent.installing
                : agentHooksInstallState === "installed"
                  ? t.settings.agent.installed
                  : t.settings.agent.install}
            </span>
          </button>
        </div>
        <div
          className={[
            "agent-status-panel",
            `agent-status-panel--${getAgentVisualState(agentStatus)}`,
          ].join(" ")}
        >
          <div className="agent-status-panel__summary">
            <span>{t.settings.agent.currentStatus}</span>
            <strong>{agentStatusLabel}</strong>
          </div>
          <div className="agent-status-panel__rows">
            {agentStatusRows.map((row) => (
              <div
                className={[
                  "agent-status-row",
                  row.needsAttention ? "agent-status-row--attention" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                key={row.provider}
              >
                <span>{row.label}</span>
                <strong>{row.phaseLabel}</strong>
                {row.needsAttention ? (
                  <button
                    className="agent-status-clear-button"
                    type="button"
                    disabled={clearingAgentProvider === row.provider}
                    title={t.settings.agent.clearStatusFor(row.label)}
                    aria-label={t.settings.agent.clearStatusFor(row.label)}
                    onClick={() => onClearAgentStatus(row.provider)}
                  >
                    <X size={12} strokeWidth={2.4} />
                    <span>
                      {clearingAgentProvider === row.provider
                        ? t.settings.agent.clearing
                        : t.settings.agent.clearStatus}
                    </span>
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </div>
        {agentHooksInstallState === "installed" && agentHooksInstallResult ? (
          <div className="agent-hooks-status agent-hooks-status--ok">
            <span>{t.settings.agent.scriptsDir}</span>
            <strong title={agentHooksInstallResult.scriptsDir}>
              {agentHooksInstallResult.scriptsDir}
            </strong>
          </div>
        ) : null}
        {agentHooksInstallState === "error" ? (
          <div className="agent-hooks-status agent-hooks-status--error">
            {agentHooksInstallError}
          </div>
        ) : null}
      </section>

      <section
        className={[
          "settings-section",
          "settings-section--clipboard",
          focusClipboardShortcutToken > 0 ? "settings-section--attention" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        ref={clipboardShortcutPanelRef}
      >
        <div className="settings-section__header">
          <span>{t.settings.clipboard.title}</span>
        </div>
        <ToggleControl
          label={t.settings.clipboard.enabled}
          checked={clipboardSettings.enabled}
          onChange={(enabled) =>
            onClipboardSettingsChange({ ...clipboardSettings, enabled })
          }
        />
        <ToggleControl
          label={t.settings.clipboard.captureImages}
          checked={clipboardSettings.captureImages}
          onChange={(captureImages) =>
            onClipboardSettingsChange({ ...clipboardSettings, captureImages })
          }
        />
        <NumberControl
          label={t.settings.clipboard.maxItems}
          value={clipboardSettings.maxItems}
          min={5}
          max={200}
          onChange={(maxItems) =>
            onClipboardSettingsChange({ ...clipboardSettings, maxItems })
          }
        />
        <ToggleControl
          label={t.settings.clipboard.shortcutEnabled}
          checked={clipboardSettings.shortcutEnabled}
          onChange={(shortcutEnabled) =>
            onClipboardSettingsChange({ ...clipboardSettings, shortcutEnabled })
          }
        />
        <div
          className={[
            "shortcut-control",
            clipboardSettings.shortcutEnabled ? "" : "shortcut-control--disabled",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <div className="shortcut-control__meta">
            <span>{t.settings.clipboard.shortcut}</span>
            <strong>{normalizeClipboardShortcut(clipboardSettings.shortcut)}</strong>
          </div>
          <button
            ref={clipboardShortcutButtonRef}
            className={[
              "shortcut-record-button",
              isRecordingShortcut ? "shortcut-record-button--recording" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            type="button"
            disabled={!clipboardSettings.shortcutEnabled}
            onClick={() => setIsRecordingShortcut(true)}
            onKeyDown={handleShortcutKeyDown}
            onBlur={() => setIsRecordingShortcut(false)}
          >
            <Keyboard size={14} strokeWidth={2.3} />
            <span>
              {isRecordingShortcut
                ? t.settings.clipboard.pressKeys
                : normalizeClipboardShortcut(clipboardSettings.shortcut)}
            </span>
          </button>
        </div>
      </section>

      <section className="settings-section settings-section--colors">
        <div className="settings-section__header">
          <span>{t.settings.colors.title}</span>
        </div>
        <div className="color-grid">
          <ColorControl
            label={t.settings.colors.taskText}
            value={settings.taskTextColor}
            onChange={(taskTextColor) =>
              onSettingsChange({ ...settings, taskTextColor })
            }
          />
          <ColorControl
            label={t.settings.colors.pulse}
            value={settings.pulseColor}
            onChange={(pulseColor) =>
              onSettingsChange({ ...settings, pulseColor })
            }
          />
          <ColorControl
            label={t.settings.colors.islandBackground}
            value={settings.islandBackgroundColor}
            onChange={(islandBackgroundColor) =>
              onSettingsChange({ ...settings, islandBackgroundColor })
            }
          />
          <ColorControl
            label={t.settings.colors.todoPaper}
            value={settings.todoBackgroundColor}
            onChange={(todoBackgroundColor) =>
              onSettingsChange({ ...settings, todoBackgroundColor })
            }
          />
        </div>
        <SliderControl
          label={t.settings.colors.pulseBrightness}
          value={settings.pulseBrightness}
          min={50}
          max={160}
          step={1}
          suffix="%"
          onChange={(pulseBrightness) =>
            onSettingsChange({ ...settings, pulseBrightness })
          }
        />
      </section>

      <section className="settings-section settings-section--presets">
        <div className="settings-section__header">
          <span>{t.settings.presets.title}</span>
          <button
            className="preset-save-button"
            type="button"
            onClick={onSavePreset}
          >
            <Save size={13} strokeWidth={2.2} />
            <span>{t.settings.presets.saveCurrent}</span>
          </button>
        </div>
        {presets.length === 0 ? (
          <div className="preset-empty">{t.settings.presets.empty}</div>
        ) : (
          <div className="preset-list" role="list">
            {presets.map((preset) => (
              <div
                className={[
                  "preset-item",
                  preset.isDefault ? "preset-item--default" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                key={preset.id}
                role="listitem"
              >
                {editingPresetId === preset.id ? (
                  <input
                    className="preset-name-input"
                    value={presetNameDraft}
                    aria-label={t.settings.presets.nameLabel}
                    autoFocus
                    onChange={(event) =>
                      setPresetNameDraft(event.currentTarget.value)
                    }
                    onBlur={commitPresetRename}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        commitPresetRename();
                      }

                      if (event.key === "Escape") {
                        setEditingPresetId(null);
                        setPresetNameDraft("");
                      }
                    }}
                  />
                ) : (
                  <button
                    className="preset-name-button"
                    type="button"
                    title={
                      preset.isDefault
                        ? t.settings.presets.defaultPreset
                        : t.settings.presets.rename
                    }
                    disabled={preset.isDefault}
                    onClick={() => {
                      if (!preset.isDefault) {
                        startPresetRename(preset);
                      }
                    }}
                  >
                    {preset.name}
                  </button>
                )}
                <button
                  className="preset-apply-button"
                  type="button"
                  onClick={() => onApplyPreset(preset.id)}
                >
                  {t.settings.presets.apply}
                </button>
                {preset.isDefault ? (
                  <span className="preset-delete-spacer" aria-hidden="true" />
                ) : (
                  <button
                    className="preset-delete-button"
                    type="button"
                    title={t.settings.presets.delete}
                    aria-label={t.settings.presets.deleteNamed(preset.name)}
                    onClick={() => onDeletePreset(preset.id)}
                  >
                    <Trash2 size={13} strokeWidth={2.2} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section
        className={[
          "settings-section",
          "settings-section--storage",
          "save-path-panel",
          highlightSavePath ? "save-path-panel--attention" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        ref={savePathPanelRef}
      >
        <div className="settings-section__header save-path-panel__header">
          <span>{t.settings.save.title}</span>
        </div>
        <div className="save-path-row">
          <label className="save-path-field">
            <span>{t.settings.save.folder}</span>
            <input
              ref={savePathInputRef}
              value={saveDirectoryDraft}
              placeholder={t.settings.save.folderPlaceholder}
              aria-label={t.settings.save.folderLabel}
              onChange={(event) =>
                onSaveDirectoryDraftChange(event.currentTarget.value)
              }
            />
          </label>
          <button
            className={[
              "save-path-button",
              savePathState === "saved" ? "save-path-button--saved" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            type="button"
            onClick={onSaveDirectory}
          >
            {savePathState === "saved" ? (
              <>
                <Check className="save-check-icon" size={15} strokeWidth={2.6} />
                <span>{t.settings.save.saved}</span>
              </>
            ) : (
              <>
                <Save size={14} strokeWidth={2.2} />
                <span>{t.settings.save.save}</span>
              </>
            )}
          </button>
        </div>
      </section>

      <section className="settings-section settings-section--project">
        <div className="settings-section__header">
          <span>{t.settings.project.title}</span>
        </div>
        <UpdatePanel />
        <a
          className="project-link project-link--star"
          href="https://github.com/flyl1u/fly-island"
          target="_blank"
          rel="noopener noreferrer"
          onClick={openProjectLink}
        >
          <Star className="project-link__icon" size={19} strokeWidth={1.8} aria-hidden="true" />
          <span className="project-link__copy">
            <strong>{t.settings.project.star}</strong>
            <span>{t.settings.project.starHint}</span>
          </span>
          <ExternalLink className="project-link__arrow" size={14} aria-hidden="true" />
        </a>
        {projectLinkFailed && (
          <p className="project-link-error" role="alert">{t.settings.project.openFailed}</p>
        )}
      </section>
    </div>
  );
}

function ClipboardHistoryPanel({
  snapshot,
  onCopyItem,
  onToggleFavorite,
  onUpdateNote,
  onDeleteItem,
  onClear,
}: {
  snapshot: ClipboardHistorySnapshot;
  onCopyItem: (id: string) => Promise<boolean> | boolean;
  onToggleFavorite: (id: string) => Promise<void> | void;
  onUpdateNote: (id: string, note: string) => Promise<boolean> | boolean;
  onDeleteItem: (id: string) => Promise<void> | void;
  onClear: () => Promise<void> | void;
}) {
  const t = useTranslation();
  const [query, setQuery] = useState("");
  const [clipboardView, setClipboardView] = useState<"all" | "favorites">("all");
  const [copiedItemId, setCopiedItemId] = useState<string | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);
  const copiedResetRef = useRef<number | null>(null);
  const confirmDeleteResetRef = useRef<number | null>(null);
  const confirmClearResetRef = useRef<number | null>(null);
  const itemElementsRef = useRef<Map<string, HTMLElement>>(new Map());
  const itemPositionsRef = useRef<Map<string, DOMRect>>(new Map());
  const normalizedQuery = query.trim().toLowerCase();
  const favoriteItems = useMemo(
    () => snapshot.items.filter((item) => item.favorite),
    [snapshot.items],
  );
  const viewedItems = clipboardView === "favorites" ? favoriteItems : snapshot.items;
  const filteredItems = useMemo(() => {
    if (!normalizedQuery) {
      return viewedItems;
    }

    return viewedItems.filter((item) => {
      const haystack = [
        item.preview,
        item.text ?? "",
        item.note ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [normalizedQuery, viewedItems]);

  useEffect(
    () => () => {
      if (copiedResetRef.current !== null) {
        window.clearTimeout(copiedResetRef.current);
      }

      if (confirmDeleteResetRef.current !== null) {
        window.clearTimeout(confirmDeleteResetRef.current);
      }

      if (confirmClearResetRef.current !== null) {
        window.clearTimeout(confirmClearResetRef.current);
      }
    },
    [],
  );

  useLayoutEffect(() => {
    const visibleIds = new Set(filteredItems.map((item) => item.id));
    const nextPositions = new Map<string, DOMRect>();
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    itemElementsRef.current.forEach((element, id) => {
      if (!visibleIds.has(id)) {
        return;
      }

      const nextRect = element.getBoundingClientRect();
      const previousRect = itemPositionsRef.current.get(id);
      nextPositions.set(id, nextRect);

      if (!previousRect || prefersReducedMotion) {
        return;
      }

      const deltaX = previousRect.left - nextRect.left;
      const deltaY = previousRect.top - nextRect.top;

      if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) {
        return;
      }

      element.getAnimations().forEach((animation) => animation.cancel());
      element.animate(
        [
          { transform: `translate(${deltaX}px, ${deltaY}px)` },
          { transform: "translate(0, 0)" },
        ],
        {
          duration: 280,
          easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
        },
      );
    });

    itemPositionsRef.current = nextPositions;
  }, [filteredItems]);

  useEffect(() => {
    if (confirmDeleteResetRef.current !== null) {
      window.clearTimeout(confirmDeleteResetRef.current);
      confirmDeleteResetRef.current = null;
    }

    if (!confirmDeleteId) {
      return;
    }

    confirmDeleteResetRef.current = window.setTimeout(() => {
      setConfirmDeleteId(null);
      confirmDeleteResetRef.current = null;
    }, 3000);

    return () => {
      if (confirmDeleteResetRef.current !== null) {
        window.clearTimeout(confirmDeleteResetRef.current);
        confirmDeleteResetRef.current = null;
      }
    };
  }, [confirmDeleteId]);

  useEffect(() => {
    if (confirmClearResetRef.current !== null) {
      window.clearTimeout(confirmClearResetRef.current);
      confirmClearResetRef.current = null;
    }

    if (!isConfirmingClear) {
      return;
    }

    confirmClearResetRef.current = window.setTimeout(() => {
      setIsConfirmingClear(false);
      confirmClearResetRef.current = null;
    }, 3000);

    return () => {
      if (confirmClearResetRef.current !== null) {
        window.clearTimeout(confirmClearResetRef.current);
        confirmClearResetRef.current = null;
      }
    };
  }, [isConfirmingClear]);

  useEffect(() => {
    if (!confirmDeleteId && !isConfirmingClear) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const isConfirmControl = event
        .composedPath()
        .some(
          (node) =>
            node instanceof Element &&
            node.matches("[data-clipboard-confirm-control='true']"),
        );

      if (isConfirmControl) {
        return;
      }

      setConfirmDeleteId(null);
      setIsConfirmingClear(false);
    };

    document.addEventListener("pointerdown", handlePointerDown, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [confirmDeleteId, isConfirmingClear]);

  useEffect(() => {
    if (
      confirmDeleteId &&
      !snapshot.items.some((item) => item.id === confirmDeleteId)
    ) {
      setConfirmDeleteId(null);
    }

    if (snapshot.items.length === 0) {
      setIsConfirmingClear(false);
    }

    if (
      editingNoteId &&
      !snapshot.items.some((item) => item.id === editingNoteId)
    ) {
      setEditingNoteId(null);
      setNoteDraft("");
      setIsSavingNote(false);
    }
  }, [confirmDeleteId, editingNoteId, snapshot.items]);

  const showCopiedState = useCallback((id: string) => {
    setCopiedItemId(id);

    if (copiedResetRef.current !== null) {
      window.clearTimeout(copiedResetRef.current);
    }

    copiedResetRef.current = window.setTimeout(() => {
      setCopiedItemId(null);
      copiedResetRef.current = null;
    }, 1100);
  }, []);

  const handleCopyItem = useCallback(
    (id: string) => {
      void Promise.resolve(onCopyItem(id)).then((didCopy) => {
        if (didCopy) {
          showCopiedState(id);
        }
      });
    },
    [onCopyItem, showCopiedState],
  );

  const handleToggleFavorite = useCallback(
    (id: string) => {
      setConfirmDeleteId(null);
      void Promise.resolve(onToggleFavorite(id));
    },
    [onToggleFavorite],
  );

  const startEditingNote = useCallback((item: ClipboardHistoryItem) => {
    setConfirmDeleteId(null);
    setEditingNoteId(item.id);
    setNoteDraft(item.note ?? "");
  }, []);

  const cancelEditingNote = useCallback(() => {
    if (isSavingNote) {
      return;
    }

    setEditingNoteId(null);
    setNoteDraft("");
  }, [isSavingNote]);

  const saveNote = useCallback(
    (id: string) => {
      if (isSavingNote) {
        return;
      }

      setIsSavingNote(true);
      void Promise.resolve(onUpdateNote(id, noteDraft)).then((didSave) => {
        setIsSavingNote(false);
        if (didSave) {
          setEditingNoteId(null);
          setNoteDraft("");
        }
      });
    },
    [isSavingNote, noteDraft, onUpdateNote],
  );

  const handleDeleteItem = useCallback(
    (id: string) => {
      if (confirmDeleteId !== id) {
        setIsConfirmingClear(false);
        setConfirmDeleteId(id);
        return;
      }

      setConfirmDeleteId(null);
      setIsConfirmingClear(false);
      void Promise.resolve(onDeleteItem(id));
    },
    [confirmDeleteId, onDeleteItem],
  );

  const handleClear = useCallback(() => {
    if (!isConfirmingClear) {
      setConfirmDeleteId(null);
      setIsConfirmingClear(true);
      return;
    }

    setIsConfirmingClear(false);
    setConfirmDeleteId(null);
    void Promise.resolve(onClear());
  }, [isConfirmingClear, onClear]);

  return (
    <section className="clipboard-panel" aria-label={t.clipboard.title}>
      <ClipboardPanelHeader
        itemCount={snapshot.items.length}
        favoriteCount={favoriteItems.length}
        shortcutEnabled={snapshot.settings.shortcutEnabled}
        shortcut={snapshot.settings.shortcut}
        isConfirmingClear={isConfirmingClear}
        onClear={handleClear}
      />

      <ClipboardFilters
        view={clipboardView}
        query={query}
        onViewChange={setClipboardView}
        onQueryChange={setQuery}
      />

      <div className="clipboard-list" role="list">
        {filteredItems.length === 0 ? (
          <div className="clipboard-empty">
            {snapshot.items.length === 0
              ? t.clipboard.emptyAll
              : clipboardView === "favorites" && favoriteItems.length === 0
                ? t.clipboard.emptyFavorites
                : t.clipboard.emptySearch}
          </div>
        ) : (
          filteredItems.map((item) => (
            <ClipboardHistoryItemRow
              key={item.id}
              item={item}
              elementRef={(node) => {
                if (node) {
                  itemElementsRef.current.set(item.id, node);
                } else {
                  itemElementsRef.current.delete(item.id);
                }
              }}
              isEditingNote={editingNoteId === item.id}
              noteDraft={noteDraft}
              isSavingNote={isSavingNote}
              isConfirmingDelete={confirmDeleteId === item.id}
              isCopied={copiedItemId === item.id}
              onCopy={handleCopyItem}
              onToggleFavorite={handleToggleFavorite}
              onStartEditNote={startEditingNote}
              onNoteDraftChange={setNoteDraft}
              onSaveNote={saveNote}
              onCancelEditNote={cancelEditingNote}
              onDelete={handleDeleteItem}
            />
          ))
        )}
      </div>
    </section>
  );
}

function ClipboardPanelHeader({
  itemCount,
  favoriteCount,
  shortcutEnabled,
  shortcut,
  isConfirmingClear,
  onClear,
}: {
  itemCount: number;
  favoriteCount: number;
  shortcutEnabled: boolean;
  shortcut: string;
  isConfirmingClear: boolean;
  onClear: () => void;
}) {
  const t = useTranslation();

  return (
    <header className="clipboard-panel__header">
      <div className="clipboard-panel__title">
        <ClipboardList size={16} strokeWidth={2.2} />
        <span>{t.clipboard.title}</span>
        <strong>{itemCount}</strong>
        {favoriteCount > 0 && (
          <em aria-label={t.clipboard.favoriteCount(favoriteCount)}>
            <Star size={10} strokeWidth={2.4} fill="currentColor" />
            {favoriteCount}
          </em>
        )}
      </div>
      <div className="clipboard-panel__tools">
        {shortcutEnabled ? (
          <span
            className="clipboard-shortcut-display"
            aria-label={t.clipboard.expandShortcut}
          >
            <Keyboard size={14} strokeWidth={2.3} />
            <span>{normalizeClipboardShortcut(shortcut)}</span>
          </span>
        ) : null}
        <button
          className={[
            "clipboard-clear-button",
            isConfirmingClear ? "clipboard-clear-button--confirming" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          type="button"
          disabled={itemCount === 0}
          title={isConfirmingClear ? t.clipboard.confirmClear : t.clipboard.clear}
          aria-label={
            isConfirmingClear ? t.clipboard.confirmClear : t.clipboard.clearHistory
          }
          onClick={onClear}
          data-clipboard-confirm-control="true"
        >
          {isConfirmingClear ? (
            <Check className="save-check-icon" size={14} strokeWidth={2.7} />
          ) : (
            <Trash2 size={14} strokeWidth={2.2} />
          )}
        </button>
      </div>
    </header>
  );
}

function ClipboardFilters({
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

function ClipboardHistoryItemRow({
  item,
  elementRef,
  isEditingNote,
  noteDraft,
  isSavingNote,
  isConfirmingDelete,
  isCopied,
  onCopy,
  onToggleFavorite,
  onStartEditNote,
  onNoteDraftChange,
  onSaveNote,
  onCancelEditNote,
  onDelete,
}: {
  item: ClipboardHistoryItem;
  elementRef: (node: HTMLElement | null) => void;
  isEditingNote: boolean;
  noteDraft: string;
  isSavingNote: boolean;
  isConfirmingDelete: boolean;
  isCopied: boolean;
  onCopy: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onStartEditNote: (item: ClipboardHistoryItem) => void;
  onNoteDraftChange: (value: string) => void;
  onSaveNote: (id: string) => void;
  onCancelEditNote: () => void;
  onDelete: (id: string) => void;
}) {
  const t = useTranslation();

  return (
    <article className="clipboard-item" role="listitem" ref={elementRef}>
      <button
        className="clipboard-item__main"
        type="button"
        title={t.clipboard.copyBack}
        onClick={() => onCopy(item.id)}
      >
        {item.kind === "image" ? (
          <span className="clipboard-item__thumb">
            {item.image?.thumbnailDataUrl ? (
              <img src={item.image.thumbnailDataUrl} alt="" />
            ) : (
              <ImageIcon size={20} strokeWidth={2.1} />
            )}
          </span>
        ) : (
          <span className="clipboard-item__text-icon">
            <ClipboardList size={17} strokeWidth={2.1} />
          </span>
        )}
        <span className="clipboard-item__body">
          <span className="clipboard-item__preview">{item.preview}</span>
        </span>
      </button>
      <div className="clipboard-item__note">
        {isEditingNote ? (
          <form
            className="clipboard-note-editor"
            onSubmit={(event) => {
              event.preventDefault();
              onSaveNote(item.id);
            }}
          >
            <input
              autoFocus
              value={noteDraft}
              maxLength={80}
              placeholder={t.clipboard.notePlaceholder}
              aria-label={t.clipboard.noteInputLabel}
              disabled={isSavingNote}
              onChange={(event) => onNoteDraftChange(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  onCancelEditNote();
                }
              }}
            />
            <button
              type="submit"
              title={t.clipboard.saveNote}
              aria-label={t.clipboard.saveNote}
              disabled={isSavingNote}
            >
              <Check size={13} strokeWidth={2.6} />
            </button>
            <button
              type="button"
              title={t.clipboard.cancelEdit}
              aria-label={t.clipboard.cancelEditNote}
              disabled={isSavingNote}
              onClick={onCancelEditNote}
            >
              <X size={13} strokeWidth={2.5} />
            </button>
          </form>
        ) : (
          <button
            className={item.note ? "clipboard-note clipboard-note--filled" : "clipboard-note"}
            type="button"
            title={item.note ? t.clipboard.editNote(item.note) : t.clipboard.addNote}
            aria-label={
              item.note ? t.clipboard.editNote(item.note) : t.clipboard.addNoteLabel
            }
            onClick={() => onStartEditNote(item)}
          >
            <Pencil size={12} strokeWidth={2.3} />
            <span>{item.note || t.clipboard.noteFallback}</span>
          </button>
        )}
      </div>
      <div className="clipboard-item__actions">
        <button
          className={[
            "clipboard-favorite-button",
            item.favorite ? "clipboard-favorite-button--active" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          type="button"
          title={item.favorite ? t.clipboard.unfavorite : t.clipboard.favorite}
          aria-label={
            item.favorite
              ? t.clipboard.unfavoriteItem
              : t.clipboard.favoriteItem
          }
          aria-pressed={item.favorite}
          onClick={() => onToggleFavorite(item.id)}
        >
          <Star
            size={14}
            strokeWidth={2.3}
            fill={item.favorite ? "currentColor" : "none"}
          />
        </button>
        <button
          className={[
            "clipboard-delete-button",
            isConfirmingDelete ? "clipboard-delete-button--confirming" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          type="button"
          title={
            isConfirmingDelete
              ? t.clipboard.confirmDelete
              : t.clipboard.delete
          }
          aria-label={t.clipboard.deleteItem}
          onClick={() => onDelete(item.id)}
          data-clipboard-confirm-control="true"
        >
          {isConfirmingDelete ? (
            <Check className="save-check-icon" size={14} strokeWidth={2.7} />
          ) : (
            <Trash2 size={14} strokeWidth={2.3} />
          )}
        </button>
        <button
          className={[
            "clipboard-copy-button",
            isCopied ? "clipboard-copy-button--copied" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          type="button"
          title={isCopied ? t.clipboard.copied : t.clipboard.copy}
          aria-label={t.clipboard.copyBack}
          onClick={() => onCopy(item.id)}
        >
          {isCopied ? (
            <Check className="save-check-icon" size={14} strokeWidth={2.7} />
          ) : (
            <Copy size={14} strokeWidth={2.3} />
          )}
        </button>
      </div>
    </article>
  );
}

function IslandApp() {
  const t = useTranslation();
  const [mode, setMode] = useState<IslandMode>("collapsed");
  const [isTucked, setIsTucked] = useState(false);
  const qqNotifications = useQQNotifications(mode === "collapsed" && !isTucked);
  const wechatReminders = useWeChatReminders(mode === "collapsed" && !isTucked);
  const qqMail = useQQMail(mode === "collapsed" && !isTucked);
  const [messageSource, setMessageSource] = useState<MessageView>("qq");
  const [isPositionDetached, setIsPositionDetached] = useState(() => loadIslandPosition() !== null);
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [page, setPage] = useState<IslandPage>("todo");
  const [mediaState, setMediaState] =
    useState<MediaState>(DEFAULT_MEDIA_STATE);
  const [isMediaTrackChanging, setIsMediaTrackChanging] = useState(false);
  const [mediaCommandError, setMediaCommandError] = useState<string | null>(
    null,
  );
  const [musicSourcePriority, setMusicSourcePriority] = useState<
    KnownMediaSource[]
  >(loadMusicSourcePriority);
  const [musicSettingsOpen, setMusicSettingsOpen] = useState(false);
  const mediaTargetRef = useRef<string | null>(null);
  const [agentStatus, setAgentStatus] =
    useState<AgentStatusSnapshot>(DEFAULT_AGENT_STATUS);
  const isRefreshingAgentStatus = useRef(false);
  const isRefreshingMediaState = useRef(false);
  const isRefreshingAudioLevel = useRef(false);
  const isRunningMediaCommand = useRef(false);
  const mediaPlaybackIntent = useRef<{
    status: MediaPlaybackStatus;
    expiresAt: number;
  } | null>(null);
  const [settings, setSettings] = useState<IslandSettings>(loadSettings);
  const [nativeGlassState, setNativeGlassState] =
    useState<NativeGlassState>("disabled");
  const [todos, setTodos] = useState<TodoItem[]>(loadTodos);
  const [dailyNote, setDailyNote] = useState(loadDailyNote);
  const [draftTodo, setDraftTodo] = useState("");
  const [activeTodoId, setActiveTodoId] = useState<string | null>(
    loadActiveTodoId,
  );
  const [currentTodoDate, setCurrentTodoDate] =
    useState<string>(loadCurrentTodoDate);
  const [archives, setArchives] = useState<TodoArchive[]>(loadTodoArchives);
  const [todoPageMode, setTodoPageMode] = useState<TodoPageMode>("today");
  const [archiveLayout, setArchiveLayout] = useState<ArchiveLayout>("cards");
  const [selectedArchiveDate, setSelectedArchiveDate] = useState<string | null>(
    null,
  );
  const [saveDirectory, setSaveDirectory] = useState(loadSaveDirectory);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [clipboardHistory, setClipboardHistory] =
    useState<ClipboardHistorySnapshot>(DEFAULT_CLIPBOARD_HISTORY);
  const clipboardShortcutToggleAt = useRef(0);
  const shouldInitializeDefaultSaveDirectory = useRef(
    window.localStorage.getItem(TODO_SAVE_DIRECTORY_STORAGE_KEY) === null,
  );
  const defaultSaveDirectoryRequestInFlight = useRef(false);
  const autoSaveTimer = useRef<number | null>(null);
  const autoSaveRequestId = useRef(0);
  const saveStateResetTimer = useRef<number | null>(null);
  const didHydrateAutoSave = useRef(false);
  const didCheckDate = useRef(false);
  const didShowInitialWindow = useRef(false);
  const islandPositionRef = useRef<IslandPosition | null>(loadIslandPosition());
  const selectedArchive =
    archives.find((archive) => archive.date === selectedArchiveDate) ?? null;
  const pendingTodoIds = useMemo(
    () => todos.filter((todo) => !todo.completed).map((todo) => todo.id),
    [todos],
  );
  const displayedTodoId = useTodoRotation(
    pendingTodoIds,
    activeTodoId,
    settings.rotateTodos,
    settings.todoRotationSeconds,
    mode !== "collapsed" || isTucked || !settings.showCollapsedText ||
      Boolean(qqNotifications.preview || wechatReminders.previewReceivedAt !== null || qqMail.preview),
  );
  const collapsedTaskTitle = useMemo(() => {
    const activeTodo = todos.find(
      (todo) => todo.id === displayedTodoId && !todo.completed,
    );
    return activeTodo?.title ?? null;
  }, [displayedTodoId, todos]);
  const collapsedTodoCount = settings.showIdleTodoCount && !collapsedTaskTitle
    ? todos.filter((todo) => !todo.completed).length
    : null;
  const collapsedIslandWidth = useMemo(
    () =>
      getCollapsedIslandWidth(
        settings.showCollapsedText
          ? collapsedTaskTitle ?? (collapsedTodoCount !== null
            ? t.island.pendingTodos(collapsedTodoCount)
            : settings.showTitle ? "fly-island" : "")
          : "",
      ),
    [collapsedTaskTitle, collapsedTodoCount, settings.showCollapsedText, settings.showTitle, t],
  );
  const isTodoArchivePage =
    page === "todo" && (todoPageMode === "archive" || todoPageMode === "review");
  const visibleTodoRows = Math.min(
    Math.max(
      todoPageMode === "daily" || isTodoArchivePage
        ? TODO_GROW_START_ROWS
        : getTodoVisualRows(todos),
      1,
    ),
    TODO_SCROLL_START_ROWS,
  );
  const expandedIslandHeight =
    page === "todo"
      ? isTodoArchivePage
        ? TODO_ARCHIVE_EXPANDED_ISLAND_HEIGHT
        : BASE_EXPANDED_ISLAND_HEIGHT +
          Math.max(0, visibleTodoRows - TODO_GROW_START_ROWS) * TODO_ROW_HEIGHT
      : page === "music"
        ? musicSettingsOpen
          ? MUSIC_SETTINGS_EXPANDED_ISLAND_HEIGHT
          : MUSIC_EXPANDED_ISLAND_HEIGHT + (mediaCommandError ? 24 : 0)
        : page === "clipboard"
          ? CLIPBOARD_EXPANDED_ISLAND_HEIGHT
          : messagePanelHeight(messageSource, Boolean(qqMail.selectedMail));
  const layoutSync = useRef<{
    frame: number | null;
    inFlight: boolean;
    pending: IslandSettings;
    active: IslandSettings;
  }>({
    frame: null,
    inFlight: false,
    pending: settings,
    active: settings,
  });

  const stageStyle = useMemo(
    () => {
      const glassStrength = settings.glassIntensity / 100;
      const glassMaskOpacity = settings.opacity / 100;

      return ({
        "--island-opacity": settings.opacity / 100,
        "--island-scale": mode === "collapsed" ? settings.collapsedScale : settings.expandedScale,
        "--collapsed-island-width": `${collapsedIslandWidth}px`,
        "--expanded-island-height": `${expandedIslandHeight}px`,
        "--task-text-color": settings.taskTextColor,
        "--island-pulse-color": settings.pulseColor,
        "--island-pulse-glow-color": hexToRgba(settings.pulseColor, 0.72),
        "--island-pulse-brightness": `${settings.pulseBrightness}%`,
        "--island-background-color": settings.islandBackgroundColor,
        "--glass-intensity": glassStrength,
        "--glass-mask-opacity": glassMaskOpacity,
        "--glass-soft-alpha": 0.045 + glassStrength * 0.045,
        "--glass-shadow-alpha": 0.14 + glassStrength * 0.1,
        "--glass-inset-alpha": 0.2 + glassStrength * 0.2,
        "--glass-cyan-alpha": glassStrength * 0.16,
        "--glass-magenta-alpha": glassStrength * 0.1,
        "--glass-glow-alpha": 0.16 + glassStrength * 0.14,
        "--glass-accent-alpha": glassStrength * 0.055,
        "--glass-refraction-opacity": 0.45 + glassStrength * 0.38,
        "--glass-border-alpha": 0.1 + glassStrength * 0.18,
        "--glass-inner-accent-alpha": glassStrength * 0.08,
        "--glass-highlight-opacity": 0.34 + glassStrength * 0.38,
        "--glass-panel-accent-alpha": glassStrength * 0.085,
        "--glass-panel-blur": `${10 + glassStrength * 9}px`,
        "--glass-tint-color": hexToRgba(
          settings.islandBackgroundColor,
          glassMaskOpacity,
        ),
        "--glass-collapsed-tint-color": hexToRgba(
          settings.islandBackgroundColor,
          glassMaskOpacity,
        ),
        "--todo-background-color": settings.todoBackgroundColor,
      }) as CSSProperties;
    },
    [
      expandedIslandHeight,
      collapsedIslandWidth,
      mode,
      settings.glassIntensity,
      settings.islandBackgroundColor,
      settings.opacity,
      settings.pulseBrightness,
      settings.pulseColor,
      settings.collapsedScale,
      settings.expandedScale,
      settings.taskTextColor,
      settings.todoBackgroundColor,
    ],
  );

  const syncNativeLayout = useCallback(async (nextSettings: IslandSettings) => {
    try {
      await invoke("set_island_layout", {
        layout: {
          collapsedScale: nextSettings.collapsedScale,
          expandedScale: nextSettings.expandedScale,
          marginY: nextSettings.marginY,
        },
      });
    } catch (error) {
      console.error("Failed to sync island layout", error);
    }
  }, []);

  const flushNativeLayout = useCallback(() => {
    const syncState = layoutSync.current;

    if (syncState.inFlight) {
      return;
    }

    const nextSettings = syncState.pending;
    syncState.active = nextSettings;
    syncState.inFlight = true;

    void syncNativeLayout(nextSettings).finally(() => {
      const latestState = layoutSync.current;
      latestState.inFlight = false;

      if (latestState.pending !== latestState.active) {
        latestState.frame = window.requestAnimationFrame(() => {
          latestState.frame = null;
          flushNativeLayout();
        });
      }
    });
  }, [syncNativeLayout]);

  const scheduleNativeLayout = useCallback(
    (nextSettings: IslandSettings) => {
      const syncState = layoutSync.current;
      syncState.pending = nextSettings;

      if (syncState.frame !== null || syncState.inFlight) {
        return;
      }

      syncState.frame = window.requestAnimationFrame(() => {
        syncState.frame = null;
        flushNativeLayout();
      });
    },
    [flushNativeLayout],
  );

  const syncNativeInteraction = useCallback(
    async (
      nextMode: IslandMode,
      nextSettings: IslandSettings,
      nextExpandedHeight: number,
      nextCollapsedWidth: number,
      nextIsTucked: boolean,
    ) => {
      try {
        const glassState = await invoke<NativeGlassState>(
          "set_island_interaction",
          {
          mode: nextMode,
          collapsedScale: nextSettings.collapsedScale,
          expandedScale: nextSettings.expandedScale,
          marginY: nextSettings.marginY,
          expandedHeight: nextExpandedHeight,
          collapsedWidth: nextCollapsedWidth,
          customPosition: islandPositionRef.current,
          isTucked: nextIsTucked,
          animatePosition: !reducedMotion,
            glassEnabled: nextSettings.appearanceMode === "liquidGlass",
            glassIntensity: nextSettings.glassIntensity,
            glassTint: nextSettings.islandBackgroundColor,
          },
        );
        setNativeGlassState(glassState);
      } catch (error) {
        console.error("Failed to sync island interaction", error);
        setNativeGlassState(
          nextSettings.appearanceMode === "liquidGlass"
            ? "css-fallback"
            : "disabled",
        );
      }
    },
    [reducedMotion],
  );

  const showReadyIsland = useCallback(async () => {
    if (didShowInitialWindow.current) {
      return;
    }

    didShowInitialWindow.current = true;

    try {
      await invoke("show_ready_island");
    } catch (error) {
      console.error("Failed to show island", error);
    }
  }, []);

  const refreshClipboardHistory = useCallback(async () => {
    try {
      const snapshot = await invoke<ClipboardHistorySnapshot>(
        "get_clipboard_history",
      );
      setClipboardHistory(snapshot);
    } catch (error) {
      console.error("Failed to read clipboard history", error);
    }
  }, []);

  const refreshAgentStatus = useCallback(async () => {
    if (isRefreshingAgentStatus.current) {
      return;
    }

    isRefreshingAgentStatus.current = true;
    try {
      const snapshot = await invoke<AgentStatusSnapshot>("get_agent_status");
      setAgentStatus((currentState) =>
        currentState.statusPath === snapshot.statusPath &&
        AGENT_PROVIDERS.every((provider) =>
          currentState[provider].phase === snapshot[provider].phase &&
          currentState[provider].taskId === snapshot[provider].taskId,
        )
          ? currentState
          : snapshot,
      );
    } catch (error) {
      console.error("Failed to read agent status", error);
      setAgentStatus(DEFAULT_AGENT_STATUS);
    } finally {
      isRefreshingAgentStatus.current = false;
    }
  }, []);

  const copyClipboardHistoryItem = useCallback(async (id: string) => {
    try {
      const snapshot = await invoke<ClipboardHistorySnapshot>(
        "copy_clipboard_history_item",
        { id },
      );
      setClipboardHistory(snapshot);
      return true;
    } catch (error) {
      console.error("Failed to copy clipboard history item", error);
      return false;
    }
  }, []);

  const toggleClipboardHistoryFavorite = useCallback(async (id: string) => {
    try {
      const snapshot = await invoke<ClipboardHistorySnapshot>(
        "toggle_clipboard_history_favorite",
        { id },
      );
      setClipboardHistory(snapshot);
    } catch (error) {
      console.error("Failed to toggle clipboard history favorite", error);
    }
  }, []);

  const updateClipboardHistoryItemNote = useCallback(
    async (id: string, note: string) => {
      try {
        const snapshot = await invoke<ClipboardHistorySnapshot>(
          "set_clipboard_history_item_note",
          { id, note },
        );
        setClipboardHistory(snapshot);
        return true;
      } catch (error) {
        console.error("Failed to update clipboard history item note", error);
        return false;
      }
    },
    [],
  );

  const deleteClipboardHistoryItem = useCallback(async (id: string) => {
    try {
      const snapshot = await invoke<ClipboardHistorySnapshot>(
        "delete_clipboard_history_item",
        { id },
      );
      setClipboardHistory(snapshot);
    } catch (error) {
      console.error("Failed to delete clipboard history item", error);
    }
  }, []);

  const clearClipboardHistoryItems = useCallback(async () => {
    try {
      const snapshot = await invoke<ClipboardHistorySnapshot>(
        "clear_clipboard_history",
      );
      setClipboardHistory(snapshot);
    } catch (error) {
      console.error("Failed to clear clipboard history", error);
    }
  }, []);

  const minimizeIsland = useCallback(async () => {
    try {
      await invoke("minimize_island");
    } catch (error) {
      console.error("Failed to minimize island", error);
    }
  }, []);

  const startIslandDrag = useCallback(() => {
    setIsPositionDetached(true);
    void invoke("start_island_drag").catch((error) => {
      setIsPositionDetached(isPositionDetached);
      console.error("Failed to start island drag", error);
    });
  }, [isPositionDetached]);

  const resetIslandPosition = useCallback(async () => {
    try {
      const nextSettings = { ...settings, marginY: DEFAULT_SETTINGS.marginY };
      await syncNativeLayout(nextSettings);
      await invoke("reset_island_position");
      islandPositionRef.current = null;
      setIsPositionDetached(false);
      window.localStorage.removeItem(ISLAND_POSITION_STORAGE_KEY);
      setSettings(nextSettings);
    } catch (error) {
      console.error("Failed to reset island position", error);
    }
  }, [settings, syncNativeLayout]);

  const setIslandMode = useCallback((nextMode: IslandMode) => {
    setMode(nextMode);
    setIsTucked(false);
  }, []);

  const tuckIsland = useCallback(() => {
    setIslandMode("collapsed");
    setIsTucked(true);
  }, [setIslandMode]);

  const revealIsland = useCallback(() => {
    setIsTucked(false);
  }, []);

  useIdleTuck(settings.autoTuck, settings.autoTuckSeconds, isTucked, `${mode}:${page}`, tuckIsland);

  const openIslandPage = useCallback((nextPage: IslandPage) => {
    setPage(nextPage);
    setMode("expanded");
    setIsTucked(false);
  }, []);

  const openMessages = useCallback((source: MessageSource) => {
    qqMail.closeReader();
    setMessageSource(source);
    openIslandPage("qq");
  }, [openIslandPage, qqMail.closeReader]);

  const openClipboardHistory = useCallback(() => {
    openIslandPage("clipboard");
  }, [openIslandPage]);

  const toggleClipboardHistory = useCallback(() => {
    const now = Date.now();

    if (now - clipboardShortcutToggleAt.current < 250) {
      return;
    }

    clipboardShortcutToggleAt.current = now;

    if (mode === "expanded" && page === "clipboard") {
      setIslandMode("collapsed");
      return;
    }

    openClipboardHistory();
  }, [mode, openClipboardHistory, page, setIslandMode]);

  const collapseIsland = useCallback(() => {
    setIslandMode("collapsed");
  }, [setIslandMode]);

  const refreshMediaState = useCallback(async () => {
    if (isRefreshingMediaState.current) {
      return;
    }

    isRefreshingMediaState.current = true;

    try {
      const nextMediaState = await getMediaState(
        mediaTargetRef.current ?? undefined,
      );

      setMediaState((currentState) => {
        const intent = mediaPlaybackIntent.current;
        const playbackStatus =
          intent && Date.now() < intent.expiresAt
            ? intent.status
            : nextMediaState.playbackStatus;

        if (intent && Date.now() >= intent.expiresAt) {
          mediaPlaybackIntent.current = null;
        }

        const nextPeak = Math.max(
          currentState.audioPeak * 0.82,
          nextMediaState.audioPeak,
        );
        const audioActive = playbackStatus !== "paused" &&
          (nextMediaState.audioActive || nextPeak > AUDIO_ACTIVE_THRESHOLD);
        const audioPeak = audioActive ? nextPeak : 0;

        const merged: MediaState = {
          ...nextMediaState,
          audioActive,
          audioPeak,
          playbackStatus,
        };

        if (isSameMediaState(currentState, merged)) {
          return currentState;
        }

        return merged;
      });
    } catch (error) {
      console.error("Failed to read media state", error);
      setMediaState(DEFAULT_MEDIA_STATE);
    } finally {
      isRefreshingMediaState.current = false;
    }
  }, []);

  const runMediaCommand = useCallback(
    async (command: MediaCommand) => {
      if (isRunningMediaCommand.current) {
        return;
      }

      const target = mediaTargetRef.current ?? undefined;
      const isPlayPause = command === "media_play_pause";
      const isTrackChange =
        command === "media_next" || command === "media_previous";
      const isTransport = isPlayPause || isTrackChange;

      const intendedStatus: MediaPlaybackStatus = isPlayPause
        ? mediaState.playbackStatus === "playing"
          ? "paused"
          : "playing"
        : mediaState.playbackStatus;

      if (isTransport) {
        mediaPlaybackIntent.current = {
          status: intendedStatus,
          expiresAt: Date.now() + (isPlayPause ? 1200 : 1800),
        };

        if (isPlayPause) {
          setMediaState((currentState) => ({
            ...currentState,
            available: intendedStatus === "playing" || currentState.available,
            audioActive:
              intendedStatus === "playing" && currentState.audioActive,
            audioPeak:
              intendedStatus === "paused" ? 0 : currentState.audioPeak,
            playbackStatus: intendedStatus,
            updatedAt: Date.now(),
          }));
        }
      }

      isRunningMediaCommand.current = true;
      setIsMediaTrackChanging(isTrackChange);
      setMediaCommandError(null);
      try {
        const nextMediaState = await sendMediaCommand(command, target);

        if (!isTransport) {
          setMediaState((currentState) =>
            isSameMediaState(currentState, nextMediaState)
              ? currentState
              : nextMediaState,
          );
          return;
        }

        setMediaState((currentState) => {
          if (intendedStatus === "paused") {
            return {
              ...nextMediaState,
              audioActive: false,
              audioPeak: 0,
              playbackStatus: intendedStatus,
            };
          }

          return {
            ...nextMediaState,
            audioActive:
              nextMediaState.audioActive || currentState.audioActive,
            audioPeak: Math.max(
              nextMediaState.audioPeak,
              currentState.audioPeak * 0.82,
            ),
            playbackStatus: intendedStatus,
          };
        });
      } catch (error) {
        console.error(`Failed to run media command: ${command}`, error);
        setMediaCommandError(String(error));
        mediaPlaybackIntent.current = null;
        await refreshMediaState();
      } finally {
        isRunningMediaCommand.current = false;
        setIsMediaTrackChanging(false);
      }
    },
    [mediaState.playbackStatus, refreshMediaState],
  );

  const reorderMusicSource = useCallback(
    (sourceId: string, targetId: string) => {
      if (sourceId === targetId) {
        return;
      }

      setMusicSourcePriority((current) => {
        const sourceIndex = current.findIndex(
          (source) => source.id === sourceId,
        );
        const targetIndex = current.findIndex(
          (source) => source.id === targetId,
        );

        if (
          sourceIndex < 0 ||
          targetIndex < 0 ||
          sourceIndex === targetIndex
        ) {
          return current;
        }

        const next = [...current];
        const [moved] = next.splice(sourceIndex, 1);
        next.splice(targetIndex, 0, moved);
        return next;
      });
    },
    [],
  );

  const removeMusicSource = useCallback((sourceId: string) => {
    setMusicSourcePriority((current) =>
      current.filter((source) => source.id !== sourceId),
    );
  }, []);

  useEffect(() => {
    let didCancel = false;

    const refreshAudioLevel = async () => {
      if (didCancel || isRefreshingAudioLevel.current) {
        return;
      }

      isRefreshingAudioLevel.current = true;

      try {
        const audioLevel = await getAudioLevel();

        if (didCancel) {
          return;
        }

        setMediaState((currentState) => {
          const intent = mediaPlaybackIntent.current;
          const isPauseIntent =
            intent &&
            Date.now() < intent.expiresAt &&
            intent.status === "paused";

          if (currentState.playbackStatus === "paused" || isPauseIntent) {
            if (
              currentState.playbackStatus === "paused" &&
              !currentState.audioActive &&
              currentState.audioPeak === 0
            ) {
              return currentState;
            }
            return {
              ...currentState,
              audioActive: false,
              audioPeak: 0,
              playbackStatus: "paused",
            };
          }

          const decayedPeak = currentState.audioPeak * 0.82;
          const nextPeak = audioLevel.active
            ? Math.max(decayedPeak, audioLevel.peak)
            : decayedPeak;
          const audioActive =
            (audioLevel.active || nextPeak > AUDIO_ACTIVE_THRESHOLD * 1.5);
          const audioPeak = audioActive ? nextPeak : 0;

          if (
            currentState.audioActive === audioActive &&
            currentState.audioPeak === audioPeak
          ) {
            return currentState;
          }

          return {
            ...currentState,
            audioActive,
            audioPeak,
          };
        });
      } catch (error) {
        console.error("Failed to read audio level", error);
      } finally {
        isRefreshingAudioLevel.current = false;
      }
    };

    void refreshAudioLevel();

    const interval = window.setInterval(() => {
      void refreshAudioLevel();
    }, 500);

    return () => {
      didCancel = true;
      window.clearInterval(interval);
    };
  }, []);

  const addTodo = useCallback(() => {
    const title = draftTodo.trim();

    if (!title) {
      return;
    }

    setTodos((currentTodos) => [
      {
        id: createTodoId(),
        title,
        completed: false,
        createdAt: Date.now(),
      },
      ...currentTodos,
    ]);
    setDraftTodo("");
  }, [draftTodo]);

  const toggleTodo = useCallback((id: string) => {
    setTodos((currentTodos) =>
      currentTodos.map((todo) =>
        todo.id === id ? { ...todo, completed: !todo.completed } : todo,
      ),
    );
    setActiveTodoId((currentId) => (currentId === id ? null : currentId));
  }, []);

  const updateTodoTitle = useCallback((id: string, title: string) => {
    const nextTitle = title.trim();

    if (!nextTitle) {
      return;
    }

    setTodos((currentTodos) =>
      currentTodos.map((todo) =>
        todo.id === id ? { ...todo, title: nextTitle } : todo,
      ),
    );
  }, []);

  const startTodo = useCallback(
    (id: string) => {
      const todo = todos.find((item) => item.id === id);

      if (!todo || todo.completed) {
        return;
      }

      if (activeTodoId === id) {
        setActiveTodoId(null);
        return;
      }

      setActiveTodoId(id);
      setIslandMode("collapsed");
    },
    [activeTodoId, setIslandMode, todos],
  );

  const deleteTodo = useCallback((id: string) => {
    setTodos((currentTodos) => currentTodos.filter((todo) => todo.id !== id));
    setActiveTodoId((currentId) => (currentId === id ? null : currentId));
  }, []);

  const reorderTodo = useCallback((sourceId: string, targetId: string) => {
    if (sourceId === targetId) {
      return;
    }

    setTodos((currentTodos) => {
      const sourceIndex = currentTodos.findIndex((todo) => todo.id === sourceId);
      const targetIndex = currentTodos.findIndex((todo) => todo.id === targetId);

      if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
        return currentTodos;
      }

      const nextTodos = [...currentTodos];
      const [movedTodo] = nextTodos.splice(sourceIndex, 1);
      const insertIndex = targetIndex;
      nextTodos.splice(insertIndex, 0, movedTodo);

      return nextTodos;
    });
  }, []);

  const upsertArchive = useCallback(
    (
      date: string,
      todoList: TodoItem[],
      nextDailyNote: string,
      savedToDisk: boolean,
      filePath?: string,
    ) => {
      const archive: TodoArchive = {
        date,
        todos: todoList,
        dailyNote: nextDailyNote,
        savedAt: Date.now(),
        savedToDisk,
        filePath,
      };

      setArchives((currentArchives) =>
        [archive, ...currentArchives.filter((item) => item.date !== date)].sort(
          (a, b) => b.date.localeCompare(a.date),
        ),
      );
    },
    [],
  );

  const saveTodosToDisk = useCallback(
    async (date: string, todoList: TodoItem[], nextDailyNote: string) => {
      const directory = saveDirectory.trim();

      if (!directory) {
        throw new Error("Missing todo save path.");
      }

      const result = await saveTodoMarkdown(
        directory,
        date,
        formatTodoDocumentAsMarkdown(todoList, nextDailyNote),
      );

      upsertArchive(date, todoList, nextDailyNote, true, result.filePath);
      window.localStorage.setItem(
        TODO_LAST_SAVED_SIGNATURE_STORAGE_KEY,
        getTodoSignature(date, todoList, nextDailyNote),
      );

      return result;
    },
    [saveDirectory, upsertArchive],
  );

  const showTodoSavedState = useCallback(() => {
    if (saveStateResetTimer.current !== null) {
      window.clearTimeout(saveStateResetTimer.current);
    }

    setSaveState("saved");
    saveStateResetTimer.current = window.setTimeout(() => {
      setSaveState("idle");
      saveStateResetTimer.current = null;
    }, 1200);
  }, []);

  const saveTodayTodos = useCallback(async () => {
    if (!saveDirectory.trim()) {
      setSaveState("needs-path");
      openSettingsWindow("savePath");
      return;
    }

    setSaveState("saving");

    try {
      await saveTodosToDisk(currentTodoDate, todos, dailyNote);
      showTodoSavedState();
    } catch (error) {
      console.error("Failed to save todo markdown", error);
      setSaveState("error");
    }
  }, [
    currentTodoDate,
    dailyNote,
    saveDirectory,
    saveTodosToDisk,
    showTodoSavedState,
    todos,
  ]);

  const showArchive = useCallback(() => {
    setTodoPageMode("archive");
    setSelectedArchiveDate(null);
    setDraftTodo("");
  }, []);

  const showToday = useCallback(() => {
    setTodoPageMode("today");
    setSelectedArchiveDate(null);
    setDraftTodo("");
  }, []);

  const showDaily = useCallback(() => {
    setTodoPageMode("daily");
    setSelectedArchiveDate(null);
    setDraftTodo("");
  }, []);

  const selectArchive = useCallback(
    (date: string) => {
      if (date === currentTodoDate) {
        showToday();
        return;
      }

      setSelectedArchiveDate(date);
      setTodoPageMode("review");
      setDraftTodo("");
    },
    [currentTodoDate, showToday],
  );

  const rolloverToToday = useCallback(
    async (nextDate: string) => {
      const signature = getTodoSignature(currentTodoDate, todos, dailyNote);
      const lastSavedSignature = window.localStorage.getItem(
        TODO_LAST_SAVED_SIGNATURE_STORAGE_KEY,
      );
      const carryOverCreatedAt = Date.now();
      const carriedTodos = settings.carryOverIncompleteTodos
        ? todos
            .filter((todo) => !todo.completed)
            .map((todo, index) => ({
              ...todo,
              id: createTodoId(),
              completed: false,
              createdAt: carryOverCreatedAt + index,
            }))
        : [];

      if (
        (todos.length > 0 || dailyNote.trim()) &&
        signature !== lastSavedSignature
      ) {
        if (saveDirectory.trim()) {
          try {
            await saveTodosToDisk(currentTodoDate, todos, dailyNote);
          } catch (error) {
            console.error("Failed to auto-save todo markdown", error);
            upsertArchive(currentTodoDate, todos, dailyNote, false);
          }
        } else {
          upsertArchive(currentTodoDate, todos, dailyNote, false);
        }
      }

      setTodos(carriedTodos);
      setDailyNote("");
      setActiveTodoId(null);
      setCurrentTodoDate(nextDate);
      setTodoPageMode("today");
      setSelectedArchiveDate(null);

      if (carriedTodos.length > 0) {
        window.localStorage.removeItem(TODO_LAST_SAVED_SIGNATURE_STORAGE_KEY);
      } else {
        window.localStorage.setItem(
          TODO_LAST_SAVED_SIGNATURE_STORAGE_KEY,
          getTodoSignature(nextDate, [], ""),
        );
      }
    },
    [
      currentTodoDate,
      dailyNote,
      saveDirectory,
      saveTodosToDisk,
      settings.carryOverIncompleteTodos,
      todos,
      upsertArchive,
    ],
  );

  useEffect(() => {
    void refreshClipboardHistory();

    let didCancel = false;
    let unlistenChanges: (() => void) | null = null;
    let unlistenShortcut: (() => void) | null = null;

    void listen("clipboard-history-changed", () => {
      void refreshClipboardHistory();
    })
      .then((nextUnlisten) => {
        if (didCancel) {
          nextUnlisten();
        } else {
          unlistenChanges = nextUnlisten;
        }
      })
      .catch((error) => {
        console.error("Failed to listen for clipboard history changes", error);
      });

    void listen("clipboard-history-shortcut", () => {
      if (clipboardHistory.settings.shortcutEnabled) {
        toggleClipboardHistory();
      }
    })
      .then((nextUnlisten) => {
        if (didCancel) {
          nextUnlisten();
        } else {
          unlistenShortcut = nextUnlisten;
        }
      })
      .catch((error) => {
        console.error("Failed to listen for clipboard history shortcut", error);
      });

    return () => {
      didCancel = true;
      unlistenChanges?.();
      unlistenShortcut?.();
    };
  }, [
    clipboardHistory.settings.shortcutEnabled,
    refreshClipboardHistory,
    toggleClipboardHistory,
  ]);

  useEffect(() => {
    void refreshMediaState();

    const interval = window.setInterval(() => {
      void refreshMediaState();
    }, 1500);

    return () => window.clearInterval(interval);
  }, [refreshMediaState]);

  const effectiveMediaTarget = useMemo(() => {
    if (mediaState.sessions.length === 0) {
      return null;
    }

    const present = new Map(
      mediaState.sessions.map((session) => [session.id, session]),
    );

    for (const source of musicSourcePriority) {
      if (present.get(source.id)?.playing) {
        return source.id;
      }
    }
    for (const source of musicSourcePriority) {
      if (present.has(source.id)) {
        return source.id;
      }
    }
    return null;
  }, [musicSourcePriority, mediaState.sessions]);

  useEffect(() => {
    if (mediaTargetRef.current === effectiveMediaTarget) {
      return;
    }
    mediaTargetRef.current = effectiveMediaTarget;
    mediaPlaybackIntent.current = null;
    void refreshMediaState();
  }, [effectiveMediaTarget, refreshMediaState]);

  useEffect(() => {
    if (mediaState.sessions.length === 0) {
      return;
    }

    setMusicSourcePriority((current) => {
      const known = new Set(current.map((source) => source.id));
      const additions = mediaState.sessions
        .filter((session) => !known.has(session.id))
        .map((session) => ({ id: session.id, label: session.label }));

      return additions.length > 0 ? [...current, ...additions] : current;
    });
  }, [mediaState.sessions]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        MUSIC_SOURCE_PRIORITY_STORAGE_KEY,
        JSON.stringify(musicSourcePriority),
      );
    } catch {
      // Ignore storage write failures (private mode, quota, etc.).
    }
  }, [musicSourcePriority]);

  useEffect(() => {
    if (page !== "music") {
      setMusicSettingsOpen(false);
    }
  }, [page]);

  useEffect(() => {
    void refreshAgentStatus();

    const interval = window.setInterval(() => {
      void refreshAgentStatus();
    }, 200);

    return () => window.clearInterval(interval);
  }, [refreshAgentStatus]);

  useEffect(() => {
    if (
      !shouldInitializeDefaultSaveDirectory.current ||
      saveDirectory.trim() ||
      defaultSaveDirectoryRequestInFlight.current
    ) {
      return;
    }

    let didCancel = false;
    defaultSaveDirectoryRequestInFlight.current = true;

    void getDefaultTodoSaveDirectory()
      .then((defaultDirectory) => {
        if (didCancel) {
          return;
        }

        const nextDirectory = defaultDirectory.trim();

        if (!nextDirectory) {
          return;
        }

        shouldInitializeDefaultSaveDirectory.current = false;
        setSaveDirectory((currentDirectory) =>
          currentDirectory.trim() ? currentDirectory : nextDirectory,
        );
      })
      .catch((error) => {
        console.error("Failed to resolve default todo save path", error);
      })
      .finally(() => {
        if (!didCancel) {
          defaultSaveDirectoryRequestInFlight.current = false;
        }
      });

    return () => {
      didCancel = true;
      defaultSaveDirectoryRequestInFlight.current = false;
    };
  }, [saveDirectory]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  // The settings window edits these keys; storage events deliver its changes here.
  useEffect(() => {
    const syncFromSettingsWindow = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) {
        const nextSettings = loadSettings();
        setSettings((current) =>
          isSameSettings(current, nextSettings) ? current : nextSettings,
        );
      }

      if (event.key === TODO_SAVE_DIRECTORY_STORAGE_KEY) {
        setSaveDirectory(loadSaveDirectory());
        setSaveState((current) => (current === "needs-path" ? "idle" : current));
      }
    };

    window.addEventListener("storage", syncFromSettingsWindow);
    return () => window.removeEventListener("storage", syncFromSettingsWindow);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(TODOS_STORAGE_KEY, JSON.stringify(todos));
  }, [todos]);

  useEffect(() => {
    window.localStorage.setItem(DAILY_NOTE_STORAGE_KEY, dailyNote);
  }, [dailyNote]);

  useEffect(() => {
    window.localStorage.setItem(TODO_DATE_STORAGE_KEY, currentTodoDate);
  }, [currentTodoDate]);

  useEffect(() => {
    window.localStorage.setItem(TODO_ARCHIVE_STORAGE_KEY, JSON.stringify(archives));
  }, [archives]);

  useEffect(() => {
    if (!saveDirectory && shouldInitializeDefaultSaveDirectory.current) {
      return;
    }

    window.localStorage.setItem(TODO_SAVE_DIRECTORY_STORAGE_KEY, saveDirectory);
  }, [saveDirectory]);

  useEffect(() => {
    if (!didHydrateAutoSave.current) {
      didHydrateAutoSave.current = true;
      return;
    }

    if (autoSaveTimer.current !== null) {
      window.clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = null;
    }

    if (!saveDirectory.trim()) {
      return;
    }

    const signature = getTodoSignature(currentTodoDate, todos, dailyNote);
    const lastSavedSignature = window.localStorage.getItem(
      TODO_LAST_SAVED_SIGNATURE_STORAGE_KEY,
    );

    if (!todos.length && !dailyNote.trim() && !lastSavedSignature) {
      return;
    }

    if (signature === lastSavedSignature) {
      return;
    }

    const timer = window.setTimeout(() => {
      autoSaveTimer.current = null;
      autoSaveRequestId.current += 1;
      const requestId = autoSaveRequestId.current;

      void saveTodosToDisk(currentTodoDate, todos, dailyNote)
        .catch((error) => {
          if (requestId === autoSaveRequestId.current) {
            console.error("Failed to auto-save todo markdown", error);
            setSaveState("error");
          }
        });
    }, 700);

    autoSaveTimer.current = timer;

    return () => {
      if (autoSaveTimer.current === timer) {
        window.clearTimeout(timer);
        autoSaveTimer.current = null;
      }
    };
  }, [
    currentTodoDate,
    dailyNote,
    saveDirectory,
    saveTodosToDisk,
    todos,
  ]);

  useEffect(
    () => () => {
      if (autoSaveTimer.current !== null) {
        window.clearTimeout(autoSaveTimer.current);
      }

      if (saveStateResetTimer.current !== null) {
        window.clearTimeout(saveStateResetTimer.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (activeTodoId) {
      window.localStorage.setItem(ACTIVE_TODO_STORAGE_KEY, activeTodoId);
      return;
    }

    window.localStorage.removeItem(ACTIVE_TODO_STORAGE_KEY);
  }, [activeTodoId]);

  useEffect(() => {
    if (
      activeTodoId &&
      !todos.some((todo) => todo.id === activeTodoId && !todo.completed)
    ) {
      setActiveTodoId(null);
    }
  }, [activeTodoId, todos]);

  useEffect(() => {
    if (didCheckDate.current) {
      return;
    }

    didCheckDate.current = true;
    const today = getLocalDateString();

    if (currentTodoDate !== today) {
      void rolloverToToday(today);
    }
  }, [currentTodoDate, rolloverToToday]);

  useEffect(() => {
    const checkForNewDay = () => {
      const today = getLocalDateString();

      if (currentTodoDate !== today) {
        void rolloverToToday(today);
      }
    };

    const interval = window.setInterval(checkForNewDay, 30_000);
    return () => window.clearInterval(interval);
  }, [currentTodoDate, rolloverToToday]);

  useEffect(() => {
    scheduleNativeLayout(settings);
  }, [settings.marginY, scheduleNativeLayout]);

  useEffect(() => {
    let didCancel = false;
    let unlisten: (() => void) | null = null;

    void listen<IslandPosition>("island-position-changed", ({ payload }) => {
      islandPositionRef.current = payload;
      setIsPositionDetached(true);
      window.localStorage.setItem(
        ISLAND_POSITION_STORAGE_KEY,
        JSON.stringify(payload),
      );
    })
      .then((nextUnlisten) => {
        if (didCancel) {
          nextUnlisten();
        } else {
          unlisten = nextUnlisten;
        }
      })
      .catch((error) => {
        console.error("Failed to listen for island position changes", error);
      });

    return () => {
      didCancel = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateReducedMotion = () => setReducedMotion(query.matches);
    query.addEventListener("change", updateReducedMotion);
    return () => query.removeEventListener("change", updateReducedMotion);
  }, []);

  useEffect(() => {
    void syncNativeInteraction(
      mode,
      settings,
      expandedIslandHeight,
      collapsedIslandWidth,
      isTucked,
    ).finally(() => {
      void showReadyIsland();
    });
  }, [
    expandedIslandHeight,
    collapsedIslandWidth,
    isTucked,
    mode,
    settings.marginY,
    settings.appearanceMode,
    settings.glassIntensity,
    settings.islandBackgroundColor,
    settings.collapsedScale,
    settings.expandedScale,
    showReadyIsland,
    syncNativeInteraction,
  ]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        clipboardHistory.settings.shortcutEnabled &&
        matchesClipboardShortcut(event, clipboardHistory.settings.shortcut)
      ) {
        event.preventDefault();
        toggleClipboardHistory();
        return;
      }

      if (event.key === "Escape") {
        collapseIsland();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    clipboardHistory.settings.shortcut,
    clipboardHistory.settings.shortcutEnabled,
    collapseIsland,
    toggleClipboardHistory,
  ]);

  useEffect(() => {
    let didCancel = false;
    let unlisten: (() => void) | null = null;

    void getCurrentWindow()
      .onFocusChanged(({ payload: focused }) => {
        if (!focused && mode === "expanded") {
          collapseIsland();
        }
      })
      .then((nextUnlisten) => {
        if (didCancel) {
          nextUnlisten();
        } else {
          unlisten = nextUnlisten;
        }
      })
      .catch((error) => {
        console.error("Failed to listen for island focus changes", error);
      });

    return () => {
      didCancel = true;
      unlisten?.();
    };
  }, [collapseIsland, mode]);

  const agentVisualState = useMemo(
    () => getAgentVisualState(agentStatus),
    [agentStatus],
  );
  const agentStatusLabel = useMemo(
    () => getAgentStatusLabel(agentStatus, t),
    [agentStatus, t],
  );

  const openTranslator = useCallback(() => {
    void invoke("toggle_translation_window").catch((error) => {
      console.error("Failed to open translation", error);
    });
  }, []);

  return (
    <main className={`stage stage--font-${settings.fontFamily}`} style={stageStyle}>
      <IslandShell
        qqMail={qqMail}
        qqNotifications={qqNotifications}
        wechatReminders={wechatReminders}
        onOpenMessages={openMessages}
        mode={mode}
        page={page}
        appearanceMode={settings.appearanceMode}
        nativeGlassState={nativeGlassState}
        isTucked={isTucked}
        isDetached={isPositionDetached || settings.marginY > 0}
        showTitle={settings.showTitle}
        showCollapsedText={settings.showCollapsedText}
        collapsedTaskTitle={collapsedTaskTitle}
        collapsedTodoCount={collapsedTodoCount}
        mediaState={mediaState}
        agentVisualState={agentVisualState}
        agentStatusLabel={agentStatusLabel}
        onOpenPage={openIslandPage}
        onWindowDragStart={startIslandDrag}
        onCollapse={collapseIsland}
        onResetPosition={resetIslandPosition}
        onMinimize={minimizeIsland}
        onOpenTranslator={openTranslator}
        onOpenSettings={openSettingsWindow}
        onTuck={tuckIsland}
        onReveal={revealIsland}
        onPageChange={setPage}
      >
        {page === "qq" && (
          <div className="message-panel">
            <MessagesPanel qqMail={qqMail} qqNotifications={qqNotifications} wechatReminders={wechatReminders} source={messageSource} onSourceChange={openMessages} />
          </div>
        )}
        {page === "music" && (
          <MusicPlayerPanel
            mediaState={mediaState}
            isTrackChanging={isMediaTrackChanging}
            commandError={mediaCommandError}
            sourcePriority={musicSourcePriority}
            settingsOpen={musicSettingsOpen}
            onToggleSettings={() => setMusicSettingsOpen((open) => !open)}
            onPlayPause={() => void runMediaCommand("media_play_pause")}
            onNext={() => void runMediaCommand("media_next")}
            onPrevious={() => void runMediaCommand("media_previous")}
            onReorderSource={reorderMusicSource}
            onRemoveSource={removeMusicSource}
          />
        )}
        {page === "clipboard" && (
          <ClipboardHistoryPanel
            snapshot={clipboardHistory}
            onCopyItem={copyClipboardHistoryItem}
            onToggleFavorite={(id) => void toggleClipboardHistoryFavorite(id)}
            onUpdateNote={updateClipboardHistoryItemNote}
            onDeleteItem={(id) => void deleteClipboardHistoryItem(id)}
            onClear={() => void clearClipboardHistoryItems()}
          />
        )}
        {page === "todo" && (
          <TodoNotebook
            todos={todos}
            dailyNote={dailyNote}
            draft={draftTodo}
            activeTodoId={activeTodoId}
            currentDate={currentTodoDate}
            pageMode={todoPageMode}
            archives={archives}
            archiveLayout={archiveLayout}
            selectedArchive={selectedArchive}
            saveState={saveState}
            enableTodoReorder={settings.enableTodoReorder}
            onDraftChange={setDraftTodo}
            onAddTodo={addTodo}
            onToggleTodo={toggleTodo}
            onUpdateTodo={updateTodoTitle}
            onStartTodo={startTodo}
            onDeleteTodo={deleteTodo}
            onReorderTodo={reorderTodo}
            onSaveToday={saveTodayTodos}
            onShowArchive={showArchive}
            onShowDaily={showDaily}
            onShowToday={showToday}
            onDailyNoteChange={setDailyNote}
            onArchiveLayoutChange={setArchiveLayout}
            onSelectArchive={selectArchive}
          />
        )}
      </IslandShell>
    </main>
  );
}

function App() {
  return <IslandApp />;
}

export default App;

// Shared with SettingsWindow, which edits the same stored settings in its own webview.
export {
  AGENT_PROVIDERS,
  DEFAULT_AGENT_STATUS,
  DEFAULT_SETTINGS,
  LEGACY_DEFAULT_PRESET_NAMES,
  SETTINGS_FOCUS_STORAGE_KEY,
  SETTINGS_PRESETS_STORAGE_KEY,
  STORAGE_KEY,
  LayoutEditor,
  isDefaultSettingPreset,
  isSameSettings,
  loadSettingPresets,
  loadSettings,
  mergeWithDefaultSettingPresets,
  normalizeSettings,
};
export type {
  AgentHooksInstallResult,
  AgentHooksInstallState,
  AgentProvider,
  AgentStatusSnapshot,
  IslandPreset,
  IslandSettings,
  SettingsFocusSection,
};

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  Bell,
  CircleDot,
  Languages,
  Minus,
  RotateCcw,
  Settings,
} from "lucide-react";
import { isTauri } from "@tauri-apps/api/core";
import {
  useQQNotifications,
  type QQNotificationsController,
} from "./features/messages/qq-notifications/QQNotifications";
import {
  useWeChatReminders,
  type WeChatRemindersController,
} from "./features/messages/wechat/WeChatReminders";
import { useQQMail, type QQMailController } from "./features/messages/qq-mail/QQMail";
import { MessagesPanel, messagePanelHeight, type MessageView } from "./features/messages/Messages";
import { MessageSourceIcon } from "./features/messages/MessageSourceIcon";
import { CollapsedMessageContent } from "./features/messages/CollapsedMessageContent";
import { latestMessagePreview, messagePreviewText, type MessageSource } from "./features/messages/messagePreview";
import { useIdleTuck, useTodoRotation } from "./useIslandAutomation";
import {
  useTranslation,
} from "./i18n";
import { clamp } from "./utils/number";
import { TodoNotebook } from "./features/todos/TodoNotebook";
import { openSettingsWindow } from "./windows/settings/api";
import { toggleTranslationWindow } from "./windows/translation/api";
import { getAgentStatusLabel, getAgentVisualState, type AgentVisualState } from "./features/agent-status/status";
import { useAgentStatus } from "./features/agent-status/useAgentStatus";
import { hexToRgba, isSameSettings } from "./features/appearance/settings";
import { STORAGE_KEY, loadSettings } from "./features/appearance/storage";
import type { AppearanceMode, IslandSettings } from "./features/appearance/types";
import { ClipboardHistoryPanel } from "./features/clipboard/ClipboardHistoryPanel";
import { useClipboardHistory } from "./features/clipboard/useClipboardHistory";
import { matchesClipboardShortcut } from "./features/clipboard/shortcut";
import { MusicPlayerPanel } from "./features/media/MusicPlayerPanel";
import { MusicWaveButton } from "./features/media/MusicWaveButton";
import { useMediaState } from "./features/media/useMediaState";
import type { MediaState } from "./features/media/api";
import { TODO_SCROLL_START_ROWS } from "./features/todos/layout";
import { useTodos } from "./features/todos/useTodos";
import type { IslandMode, IslandPage, NativeGlassState } from "./windows/island/types";
import { useIslandWindow } from "./windows/island/useIslandWindow";
import { BASE_EXPANDED_ISLAND_HEIGHT, CLIPBOARD_EXPANDED_ISLAND_HEIGHT, MUSIC_EXPANDED_ISLAND_HEIGHT, MUSIC_SETTINGS_EXPANDED_ISLAND_HEIGHT, TODO_ARCHIVE_EXPANDED_ISLAND_HEIGHT, TODO_GROW_START_ROWS, TODO_ROW_HEIGHT, getCollapsedIslandWidth, getTodoVisualRows } from "./windows/island/layout";
import "./App.css";

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

function IslandApp() {
  const t = useTranslation();
  const [mode, setMode] = useState<IslandMode>("collapsed");
  const [isTucked, setIsTucked] = useState(false);
  const qqNotifications = useQQNotifications(mode === "collapsed" && !isTucked);
  const wechatReminders = useWeChatReminders(mode === "collapsed" && !isTucked);
  const qqMail = useQQMail(mode === "collapsed" && !isTucked);
  const [messageSource, setMessageSource] = useState<MessageView>("qq");
  const [page, setPage] = useState<IslandPage>("todo");
  const {
    mediaState,
    isMediaTrackChanging,
    mediaCommandError,
    musicSourcePriority,
    runMediaCommand,
    reorderMusicSource,
    removeMusicSource,
  } = useMediaState();
  const [musicSettingsOpen, setMusicSettingsOpen] = useState(false);
  const agentStatus = useAgentStatus();
  const [settings, setSettings] = useState<IslandSettings>(loadSettings);

  const setIslandMode = useCallback((nextMode: IslandMode) => {
    setMode(nextMode);
    setIsTucked(false);
  }, []);

  const collapseIsland = useCallback(() => {
    setIslandMode("collapsed");
  }, [setIslandMode]);

  const openSavePathSettings = useCallback(() => {
    openSettingsWindow("savePath");
  }, []);

  const { todos, activeTodoId, todoPageMode, notebookProps } = useTodos({
    carryOverIncompleteTodos: settings.carryOverIncompleteTodos,
    onStartTodo: collapseIsland,
    onMissingSaveDirectory: openSavePathSettings,
  });

  const clipboardShortcutToggleAt = useRef(0);
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

  const {
    clipboardHistory,
    copyClipboardHistoryItem,
    toggleClipboardHistoryFavorite,
    updateClipboardHistoryItemNote,
    deleteClipboardHistoryItem,
    clearClipboardHistoryItems,
  } = useClipboardHistory(toggleClipboardHistory);

  useEffect(() => {
    if (page !== "music") {
      setMusicSettingsOpen(false);
    }
  }, [page]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  // The settings window edits this key; storage events deliver its changes here.
  useEffect(() => {
    const syncFromSettingsWindow = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) {
        const nextSettings = loadSettings();
        setSettings((current) =>
          isSameSettings(current, nextSettings) ? current : nextSettings,
        );
      }
    };

    window.addEventListener("storage", syncFromSettingsWindow);
    return () => window.removeEventListener("storage", syncFromSettingsWindow);
  }, []);

  const {
    isPositionDetached,
    nativeGlassState,
    minimizeIsland,
    startIslandDrag,
    resetIslandPosition,
  } = useIslandWindow({
    mode,
    isTucked,
    settings,
    setSettings,
    expandedIslandHeight,
    collapsedIslandWidth,
    onCollapse: collapseIsland,
  });

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

  const agentVisualState = useMemo(
    () => getAgentVisualState(agentStatus),
    [agentStatus],
  );
  const agentStatusLabel = useMemo(
    () => getAgentStatusLabel(agentStatus, t),
    [agentStatus, t],
  );

  const openTranslator = useCallback(() => {
    void toggleTranslationWindow().catch((error) => {
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
            {...notebookProps}
            enableTodoReorder={settings.enableTodoReorder}
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


import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
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
import { MessagesPanel, type MessageView } from "./features/messages/Messages";
import { MessageSourceIcon } from "./features/messages/MessageSourceIcon";
import { CollapsedMessageContent } from "./features/messages/CollapsedMessageContent";
import { latestMessagePreview, messagePreviewText, type MessageSource } from "./features/messages/messagePreview";
import { useIdleTuck } from "./useIslandAutomation";
import {
  useTranslation,
} from "./i18n";
import { clamp } from "./utils/number";
import { TodoNotebook } from "./features/todos/TodoNotebook";
import { openSettingsWindow } from "./windows/settings/api";
import { toggleTranslationWindow } from "./windows/translation/api";
import { getAgentStatusLabel, getAgentVisualState, type AgentVisualState } from "./features/agent-status/status";
import { useAgentStatus } from "./features/agent-status/useAgentStatus";
import { useIslandSettings } from "./features/appearance/useIslandSettings";
import type { AppearanceMode } from "./features/appearance/types";
import { ClipboardHistoryPanel } from "./features/clipboard/ClipboardHistoryPanel";
import { useClipboardHistory } from "./features/clipboard/useClipboardHistory";
import { MusicPlayerPanel } from "./features/media/MusicPlayerPanel";
import { MusicWaveButton } from "./features/media/MusicWaveButton";
import { useMediaState } from "./features/media/useMediaState";
import type { MediaState } from "./features/media/api";
import { useTodos } from "./features/todos/useTodos";
import type { IslandMode, IslandPage, NativeGlassState } from "./windows/island/types";
import { useIslandWindow } from "./windows/island/useIslandWindow";
import { getExpandedIslandHeight } from "./windows/island/expandedHeight";
import { getIslandStageStyle } from "./windows/island/stageStyle";
import { useCollapsedTodo } from "./windows/island/useCollapsedTodo";
import { useIslandKeyboard } from "./windows/island/useIslandKeyboard";
import { useIslandNavigation } from "./windows/island/useIslandNavigation";
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
  const {
    mode,
    isTucked,
    page,
    setPage,
    collapseIsland,
    tuckIsland,
    revealIsland,
    openIslandPage,
    toggleClipboardHistory,
  } = useIslandNavigation();
  const qqNotifications = useQQNotifications(mode === "collapsed" && !isTucked);
  const wechatReminders = useWeChatReminders(mode === "collapsed" && !isTucked);
  const qqMail = useQQMail(mode === "collapsed" && !isTucked);
  const [messageSource, setMessageSource] = useState<MessageView>("qq");
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
  const [settings, setSettings] = useIslandSettings();

  const openSavePathSettings = useCallback(() => {
    openSettingsWindow("savePath");
  }, []);

  const { todos, activeTodoId, todoPageMode, notebookProps } = useTodos({
    carryOverIncompleteTodos: settings.carryOverIncompleteTodos,
    onStartTodo: collapseIsland,
    onMissingSaveDirectory: openSavePathSettings,
  });

  const { collapsedTaskTitle, collapsedTodoCount, collapsedIslandWidth } =
    useCollapsedTodo(
      todos,
      activeTodoId,
      settings,
      mode !== "collapsed" || isTucked || !settings.showCollapsedText ||
        Boolean(qqNotifications.preview || wechatReminders.previewReceivedAt !== null || qqMail.preview),
    );
  const expandedIslandHeight = getExpandedIslandHeight({
    page,
    todoPageMode,
    todos,
    musicSettingsOpen,
    hasMediaCommandError: Boolean(mediaCommandError),
    messageSource,
    isReadingMail: Boolean(qqMail.selectedMail),
  });
  const stageStyle = useMemo(
    () => getIslandStageStyle(settings, mode, collapsedIslandWidth, expandedIslandHeight),
    [collapsedIslandWidth, expandedIslandHeight, mode, settings],
  );

  useIdleTuck(settings.autoTuck, settings.autoTuckSeconds, isTucked, `${mode}:${page}`, tuckIsland);

  const openMessages = useCallback((source: MessageSource) => {
    qqMail.closeReader();
    setMessageSource(source);
    openIslandPage("qq");
  }, [openIslandPage, qqMail.closeReader]);

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

  useIslandKeyboard(
    clipboardHistory.settings.shortcutEnabled,
    clipboardHistory.settings.shortcut,
    toggleClipboardHistory,
    collapseIsland,
  );

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


import { useCallback, useEffect, useMemo, useState } from "react";
import { useQQNotifications } from "../../features/messages/qq-notifications/QQNotifications";
import { useWeChatReminders } from "../../features/messages/wechat/WeChatReminders";
import { useQQMail } from "../../features/messages/qq-mail/QQMail";
import { MessagesPanel, type MessageView } from "../../features/messages/Messages";
import type { MessageSource } from "../../features/messages/messagePreview";
import { useIdleTuck, useRevealOnMessage } from "./useIslandAutomation";
import { useTranslation } from "../../i18n";
import { TodoNotebook } from "../../features/todos/TodoNotebook";
import { openSettingsWindow } from "../settings/api";
import { toggleTranslationWindow } from "../../features/translation/api";
import { getAgentStatusLabel, getAgentVisualState } from "../../features/agent-status/status";
import { useAgentStatus } from "../../features/agent-status/useAgentStatus";
import { useAgentSession } from "../../features/agent-status/useAgentSession";
import { useIslandSettings } from "../../features/appearance/useIslandSettings";
import { ClipboardHistoryPanel } from "../../features/clipboard/ClipboardHistoryPanel";
import { useClipboardHistory } from "../../features/clipboard/useClipboardHistory";
import { MusicPlayerPanel } from "../../features/media/MusicPlayerPanel";
import { FileShelfPanel } from "../../features/file-shelf/FileShelfPanel";
// Imported after the page panels so its CSS keeps its place in the cascade.
import { IslandShell } from "./IslandShell";
import { useMediaState } from "../../features/media/useMediaState";
import type { TodoItem } from "../../features/todos/types";
import { useTodos } from "../../features/todos/useTodos";
import { useFileShelf } from "../../features/file-shelf/useFileShelf";
import { useLocalApiBridge } from "../../features/local-api/useLocalApiBridge";
import { useIslandWindow } from "./useIslandWindow";
import { getExpandedIslandHeight } from "./expandedHeight";
import { getTodoScrollStartRows } from "./layout";
import { getIslandStageStyle } from "./stageStyle";
import { useCollapsedTodo } from "./useCollapsedTodo";
import { useHoverExpand } from "./useHoverExpand";
import { useIslandKeyboard } from "./useIslandKeyboard";
import { usePanelPreview } from "./usePanelPreview";
import { useIslandFeatures } from "./useIslandFeatures";
import { useFileShelfDrop } from "./useFileShelfDrop";
import { useIslandNavigation } from "./useIslandNavigation";
import { useTuckPeek } from "./useTuckPeek";
// Must stay the last import: IslandApp.css overrides the feature styles above.
import "./IslandApp.css";

// Stands in for the todo list while todos are switched off, so the collapsed island shows none.
const NO_TODOS: TodoItem[] = [];

export function IslandApp() {
  const t = useTranslation();
  const {
    mode,
    isTucked,
    isPeeking,
    page,
    setPage,
    collapseIsland,
    tuckIsland,
    revealIsland,
    minimizeToEdge,
    peekIsland,
    endPeek,
    openIslandPage,
    toggleClipboardHistory,
  } = useIslandNavigation();
  const [settings, setSettings] = useIslandSettings();
  // A tucked island still takes message previews when it will slide out to show them.
  const canPreviewMessages = mode === "collapsed" && (!isTucked || settings.revealOnMessage);
  const qqNotifications = useQQNotifications(canPreviewMessages);
  const wechatReminders = useWeChatReminders(canPreviewMessages);
  const qqMail = useQQMail(canPreviewMessages);
  const hasMessagePreview = Boolean(qqNotifications.preview || wechatReminders.previewReceivedAt !== null || qqMail.preview);
  const [messageSource, setMessageSource] = useState<MessageView>("qq");
  const {
    mediaState,
    isMediaTrackChanging,
    mediaCommandError,
    musicSourcePriority,
    runMediaCommand,
    reorderMusicSource,
    removeMusicSource,
  } = useMediaState(settings.musicEnabled);
  const [musicSettingsOpen, setMusicSettingsOpen] = useState(false);
  const agentStatus = useAgentStatus(settings.agentStatusEnabled);
  const agentSession = useAgentSession(agentStatus, settings.agentStatusEnabled && settings.agentTitleEnabled);

  const openSavePathSettings = useCallback(() => {
    openSettingsWindow("savePath");
  }, []);

  const { todos, activeTodoId, todoPageMode, apiHandlers, notebookProps } = useTodos({
    carryOverIncompleteTodos: settings.carryOverIncompleteTodos,
    onStartTodo: collapseIsland,
    onMissingSaveDirectory: openSavePathSettings,
  });
  useLocalApiBridge(apiHandlers);

  const { collapsedTaskTitle, collapsedTodoCount, collapsedIslandWidth } =
    useCollapsedTodo(
      settings.todoEnabled ? todos : NO_TODOS,
      settings.todoEnabled ? activeTodoId : null,
      settings.todoEnabled ? settings : { ...settings, showIdleTodoCount: false },
      mode !== "collapsed" || isTucked || !settings.showCollapsedText || hasMessagePreview,
      agentSession?.title ?? null,
    );
  const expandedIslandHeight = getExpandedIslandHeight({
    page,
    todoPageMode,
    todos,
    musicSettingsOpen,
    hasMediaCommandError: Boolean(mediaCommandError),
    messageSource,
    isReadingMail: Boolean(qqMail.selectedMail),
    maxPanelHeight: settings.maxPanelHeight,
    clipboardVisibleRows: settings.clipboardVisibleRows,
  });
  const stageStyle = useMemo(
    () => getIslandStageStyle(settings, mode, collapsedIslandWidth, expandedIslandHeight),
    [collapsedIslandWidth, expandedIslandHeight, mode, settings],
  );

  // A showing preview holds the idle timer, which then restarts in full once it ends.
  useIdleTuck(settings.autoTuck && !hasMessagePreview, settings.autoTuckSeconds, isTucked, `${mode}:${page}`, tuckIsland);
  useRevealOnMessage(hasMessagePreview, isTucked, revealIsland);
  useTuckPeek(isPeeking, endPeek);

  const closeMailReader = qqMail.closeReader;
  const openMessages = useCallback((source: MessageSource) => {
    closeMailReader();
    setMessageSource(source);
    openIslandPage("qq");
  }, [closeMailReader, openIslandPage]);

  const {
    clipboardHistory,
    copyClipboardHistoryItem,
    toggleClipboardHistoryFavorite,
    updateClipboardHistoryItemNote,
    deleteClipboardHistoryItem,
    clearClipboardHistoryItems,
  } = useClipboardHistory(toggleClipboardHistory);

  const { features, openEnabledPage } = useIslandFeatures({
    settings,
    clipboardEnabled: clipboardHistory.settings.enabled,
    qqEnabled: qqNotifications.snapshot.enabled,
    wechatEnabled: wechatReminders.snapshot.enabled,
    qqMail,
    page,
    messageSource,
    setPage,
    setMessageSource,
    openIslandPage,
  });

  const fileShelf = useFileShelf(settings.shelfEnabled);
  const isShelfDropping = useFileShelfDrop({
    enabled: settings.shelfEnabled,
    mode,
    page,
    isTucked,
    isPeeking,
    shelf: fileShelf,
    openIslandPage,
    setPage,
    collapseIsland,
    tuckIsland,
    minimizeToEdge,
  });

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

  const openCurrentPage = useCallback(() => openEnabledPage(page), [openEnabledPage, page]);
  useHoverExpand({
    enabled: settings.expandTrigger === "hover",
    delayMs: settings.hoverExpandDelayMs,
    paused: hasMessagePreview,
    collapseDelayMs: settings.hoverCollapseDelayMs,
    mode,
    // A peeking island opens on a click only; hovering it just keeps it out.
    isTucked: isTucked || isPeeking,
    onExpand: openCurrentPage,
    onCollapse: collapseIsland,
  });
  usePanelPreview({ mode, onExpand: openCurrentPage, onCollapse: collapseIsland, onReveal: revealIsland });

  useIslandKeyboard(
    clipboardHistory.settings.enabled && clipboardHistory.settings.shortcutEnabled,
    clipboardHistory.settings.shortcut,
    toggleClipboardHistory,
    collapseIsland,
  );

  const agentVisualState = useMemo(
    () => (settings.agentStatusEnabled ? getAgentVisualState(agentStatus) : "idle"),
    [agentStatus, settings.agentStatusEnabled],
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
        agentSession={agentSession}
        mediaState={mediaState}
        agentVisualState={agentVisualState}
        agentStatusLabel={agentStatusLabel}
        features={features}
        onOpenPage={openEnabledPage}
        onWindowDragStart={startIslandDrag}
        onCollapse={collapseIsland}
        onResetPosition={resetIslandPosition}
        minimizesToTray={settings.minimizeAction === "tray"}
        onMinimize={settings.minimizeAction === "tray" ? minimizeIsland : minimizeToEdge}
        onOpenTranslator={openTranslator}
        onOpenSettings={openSettingsWindow}
        onTuck={tuckIsland}
        onReveal={peekIsland}
        onPageChange={setPage}
      >
        {page === "qq" && (
          <div className="message-panel">
            <MessagesPanel qqMail={qqMail} qqNotifications={qqNotifications} wechatReminders={wechatReminders} source={messageSource} enabledSources={features} onSourceChange={openMessages} />
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
        {page === "shelf" && <FileShelfPanel shelf={fileShelf} isDropTarget={isShelfDropping} />}
        {page === "todo" && (
          <TodoNotebook
            {...notebookProps}
            enableTodoReorder={settings.enableTodoReorder}
            scrollStartRows={getTodoScrollStartRows(settings.maxPanelHeight)}
          />
        )}
      </IslandShell>
    </main>
  );
}

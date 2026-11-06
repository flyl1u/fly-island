import { useCallback, useMemo } from "react";
import { useQQNotifications } from "../../features/messages/qq-notifications/QQNotifications";
import { useWeChatReminders } from "../../features/messages/wechat/WeChatReminders";
import { useMail } from "../../features/messages/mail/MailPanel";
import { usePluginNotifications } from "../../features/plugins/usePluginNotifications";
import { useDeviceUse } from "../../features/device-use/useDeviceUse";
import { useLevelPopup } from "../../features/system-levels/useLevelPopup";
import { usePluginPermissionPrompts } from "../../features/plugins/usePluginPermissionPrompts";
import { PluginPermissionPrompt } from "../../features/plugins/PluginPermissionPrompt";
import { PluginContextMenus } from "../../features/plugins/PluginContextMenu";
// The page panels; before IslandShell so their CSS keeps its place in the cascade.
import { IslandPages } from "./IslandPages";
import { PluginStatusSlot } from "../../features/plugin-views/PluginStatusSlot";
import { useIdleTuck, useRevealOnMessage } from "./useIslandAutomation";
import { useTranslation } from "../../i18n";
import { openSettingsWindow } from "../settings/api";
import { useQuickTranslation } from "../../features/translation/useQuickTranslation";
import { getAgentStatusLabel, getAgentVisualState, withoutHiddenProviders } from "../../features/agent-status/status";
import { useIslandSettings } from "../../features/appearance/useIslandSettings";
import { useClipboardHistory } from "../../features/clipboard/useClipboardHistory";
// Imported after the page panels so its CSS keeps its place in the cascade.
import { IslandShell } from "./IslandShell";
import { useMediaState } from "../../features/media/useMediaState";
import type { TodoItem } from "../../features/todos/types";
import { useTodos } from "../../features/todos/useTodos";
import { useFileShelf } from "../../features/file-shelf/useFileShelf";
import { useLocalApiBridge } from "../../features/local-api/useLocalApiBridge";
import { useBackgroundUpdateCheck } from "../../features/updater/useBackgroundUpdateCheck";
import { useIslandWindow } from "./useIslandWindow";
import { getExpandedIslandHeight } from "./expandedHeight";
import { getIslandStageStyle } from "./stageStyle";
import { useCollapsedTodo } from "./useCollapsedTodo";
import { useHoverExpand } from "./useHoverExpand";
import { useHoverFocus } from "./useHoverFocus";
import { useGameMode } from "./useGameMode";
import { useIslandKeyboard } from "./useIslandKeyboard";
import { usePanelPreview } from "./usePanelPreview";
import { useIslandFeatures } from "./useIslandFeatures";
import { useIslandAgentAlerts } from "./useIslandAgentAlerts";
import { useIslandAgents } from "./useIslandAgents";
import { useFileShelfDrop } from "./useFileShelfDrop";
import { useIslandNavigation } from "./useIslandNavigation";
import { useTuckPeek } from "./useTuckPeek";
import { useTuckedHoverOpen } from "./useTuckedHoverOpen";
import { useIslandTranslation } from "./useIslandTranslation";
import { usePluginHostEvents } from "./usePluginHostEvents";
import { usePluginKeybindings } from "./usePluginKeybindings";
import { usePluginPages } from "./usePluginPages";
import { useMessageView } from "./useMessageView";
import { PluginPageButtons } from "./PluginPageButtons";
import { useCollapsedSlots } from "./useCollapsedSlots";
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
    peekRetractDelayMs,
    page,
    setPage,
    collapseIsland,
    tuckIsland,
    revealIsland,
    minimizeToEdge,
    idleTuck,
    peekIsland,
    endPeek,
    resumePeek,
    retractsAfterPeek,
    openIslandPage,
    toggleClipboardHistory,
  } = useIslandNavigation();
  const pluginPages = usePluginPages(page);
  const [settings, setSettings] = useIslandSettings();
  // Quiet while a full-screen app (usually a game) is in front, if game mode asks for it.
  const game = useGameMode(settings, { mode, isTucked, collapseIsland, tuckIsland, revealIsland });
  // A tucked island still takes message previews when it will slide out to show them.
  const canPreviewMessages = !game.quiet && mode === "collapsed" && (!isTucked || settings.revealOnMessage);
  const qqNotifications = useQQNotifications(canPreviewMessages);
  const wechatReminders = useWeChatReminders(canPreviewMessages);
  const qqMail = useMail(canPreviewMessages);
  const pluginNotifications = usePluginNotifications(canPreviewMessages);
  const deviceUse = useDeviceUse(settings.deviceUseIndicator);
  const levelPopup = useLevelPopup(settings.levelPopup, !game.quiet && mode === "collapsed" && !isTucked);
  const permissionPrompts = usePluginPermissionPrompts();
  const hasMessagePreview = Boolean(
    qqNotifications.preview || wechatReminders.previewReceivedAt !== null || qqMail.preview || pluginNotifications.notification,
  );
  const media = useMediaState(settings.musicEnabled);
  const { agentStatus, agentSessions, listedAgentSessions, activeAgentSessionCount, unseenAgentSessions, agentSession, agentActivity } =
    useIslandAgents(settings);
  const openAgentsPage = useCallback(() => openIslandPage("agents"), [openIslandPage]);
  const collapsedSlots = useCollapsedSlots({
    paused: mode !== "collapsed" || isTucked || game.quiet,
    agents: agentActivity,
    sessions: agentSessions,
    unseen: unseenAgentSessions.keys,
    agentsOn: settings.agentStatusEnabled,
    onOpenAgents: openAgentsPage,
  });
  const openSavePathSettings = useCallback(() => {
    openSettingsWindow("savePath");
  }, []);

  const { todos, activeTodoId, todoPageMode, apiHandlers, notebookProps } = useTodos({
    carryOverIncompleteTodos: settings.carryOverIncompleteTodos,
    onStartTodo: collapseIsland,
    onMissingSaveDirectory: openSavePathSettings,
  });
  useLocalApiBridge(apiHandlers);
  useBackgroundUpdateCheck();
  usePluginHostEvents({
    date: notebookProps.currentDate,
    todosVersion: [todos, notebookProps.scheduledTodos, activeTodoId],
    note: notebookProps.dailyNote,
    agentStatus,
    mode,
  });
  usePluginKeybindings({ mode, page, hasActiveTodo: activeTodoId !== null });

  const translationPeek = useQuickTranslation(settings.translationEnabled);
  const { collapsedTaskTitle, collapsedTodoCount, collapsedIslandWidth } =
    useCollapsedTodo(
      settings.todoEnabled ? todos : NO_TODOS,
      settings.todoEnabled ? activeTodoId : null,
      settings.todoEnabled ? settings : { ...settings, showIdleTodoCount: false },
      mode !== "collapsed" || isTucked || !settings.showCollapsedText || hasMessagePreview,
      agentSession?.title ?? null,
      collapsedSlots,
      hasMessagePreview || translationPeek !== null,
    );
  // A showing preview holds the idle timer, which then restarts in full once it ends.
  const tuckWhenIdle = useCallback(
    () => idleTuck(settings.autoTuckRetract ? settings.autoTuckRetractDelayMs : null),
    [idleTuck, settings.autoTuckRetract, settings.autoTuckRetractDelayMs],
  );
  useIdleTuck(settings.autoTuck && !hasMessagePreview && !translationPeek, settings.autoTuckSeconds, isTucked, `${mode}:${page}`, tuckWhenIdle);
  useRevealOnMessage(hasMessagePreview, isTucked, revealIsland);
  // A plugin waits for this answer, so it is shown even when tucked away.
  useRevealOnMessage(permissionPrompts.current !== null, isTucked, revealIsland);
  useRevealOnMessage(Boolean(translationPeek), isTucked && settings.revealOnMessage, revealIsland);
  useTuckPeek(isPeeking, endPeek, peekRetractDelayMs ?? undefined);

  const { messageSource, setMessageSource, openMessages } = useMessageView(qqMail.closeReader, openIslandPage);

  const clipboard = useClipboardHistory(toggleClipboardHistory);
  const { clipboardHistory } = clipboard;

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
    pluginPages: pluginPages.pageIds,
  });
  const { alertedSession, approvals: agentApprovals, agentCardHeight } = useIslandAgentAlerts({
    sessions: agentSessions,
    settings,
    enabled: features.agents && !game.quiet,
    mode,
    page,
    openIslandPage,
    collapseIsland,
  });
  const expandedIslandHeight = getExpandedIslandHeight({
    page,
    todoPageMode,
    todos,
    hasMediaCommandError: Boolean(media.mediaCommandError),
    messageSource,
    isReadingMail: qqMail.wantsTallPanel,
    maxPanelHeight: settings.maxPanelHeight,
    clipboardVisibleRows: settings.clipboardVisibleRows,
    agentVisibleRows: settings.agentVisibleRows,
    agentShowUsage: settings.agentShowUsage,
    agentAlertRowHeight: agentCardHeight,
    pluginTemplate: pluginPages.entry?.template,
    pluginListRows: pluginPages.rows,
    pluginWebviewHeight: pluginPages.entry?.height,
  });
  const stageStyle = useMemo(
    () => getIslandStageStyle(settings, mode, collapsedIslandWidth, expandedIslandHeight),
    [collapsedIslandWidth, expandedIslandHeight, mode, settings],
  );

  const fileShelf = useFileShelf(settings.shelfEnabled, {
    maxItems: settings.shelfMaxItems,
    maxAgeDays: settings.shelfAutoCleanupDays,
    removeMissing: settings.shelfRemoveMissing,
    removeAfterDragOut: settings.shelfRemoveAfterDragOut,
  });
  const isShelfDropping = useFileShelfDrop({
    enabled: settings.shelfEnabled,
    expandOnDrop: settings.shelfExpandOnDrop,
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

  // While the island names a running agent, opening it shows the Agent page.
  const openCurrentPage = useCallback(
    () => openEnabledPage(agentSession ? "agents" : page),
    [agentSession, openEnabledPage, page],
  );
  useHoverExpand({
    enabled: settings.expandTrigger === "hover" && !game.quiet,
    delayMs: settings.hoverExpandDelayMs,
    paused: hasMessagePreview,
    collapseDelayMs: settings.hoverCollapseDelayMs,
    mode,
    // A peeking island opens on a click only; hovering it just keeps it out.
    isTucked: isTucked || isPeeking,
    onExpand: openCurrentPage,
    onCollapse: collapseIsland,
  });
  const hoverTucked = useTuckedHoverOpen({
    opensPanel: settings.tuckedHoverAction === "expand" && !game.quiet,
    delayMs: settings.hoverExpandDelayMs,
    isPeeking: isPeeking && mode === "collapsed",
    onPeek: peekIsland,
    onOpen: openCurrentPage,
    retractsAfterPeek,
    resumePeek,
  });
  useHoverFocus(mode, game.quiet);
  usePanelPreview({ mode, onExpand: openCurrentPage, onCollapse: collapseIsland, onReveal: revealIsland });

  useIslandKeyboard(
    clipboardHistory.settings.enabled && clipboardHistory.settings.shortcutEnabled,
    clipboardHistory.settings.shortcut,
    toggleClipboardHistory,
    collapseIsland,
    mode,
    features,
    page,
    setPage,
    settings.pageDigitModifiers,
    settings.pageNextShortcut,
    settings.pagePreviousShortcut,
  );

  // Agents switched off in Settings → AI Agent neither light the island nor name it.
  const shownAgentStatus = useMemo(
    () => withoutHiddenProviders(agentStatus, { claudeCode: settings.agentShowClaudeCode, codex: settings.agentShowCodex }),
    [agentStatus, settings.agentShowClaudeCode, settings.agentShowCodex],
  );
  const agentVisualState = useMemo(() => (settings.agentStatusEnabled ? getAgentVisualState(shownAgentStatus, activeAgentSessionCount) : "idle"), [shownAgentStatus, activeAgentSessionCount, settings.agentStatusEnabled]);
  const agentStatusLabel = useMemo(() => getAgentStatusLabel(shownAgentStatus, t, activeAgentSessionCount), [shownAgentStatus, activeAgentSessionCount, t]);

  const { openTranslator, openTranslationPeek } = useIslandTranslation(
    settings.translationEnabled,
    features.translation,
    mode,
    page,
    openIslandPage,
    collapseIsland,
  );

  return (
    <main className={`stage stage--font-${settings.fontFamily}`} style={stageStyle}>
      <IslandShell
        qqMail={qqMail}
        qqNotifications={qqNotifications}
        wechatReminders={wechatReminders}
        pluginNotifications={pluginNotifications}
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
        activeAgentSessionCount={activeAgentSessionCount}
        mediaState={media.mediaState}
        agentVisualState={agentVisualState}
        agentStatusLabel={agentStatusLabel}
        features={features}
        shelfCount={settings.shelfEnabled && settings.shelfShowCount ? fileShelf.items.length : null}
        deviceUse={deviceUse}
        levelPopup={levelPopup}
        onOpenPage={openEnabledPage}
        onWindowDragStart={startIslandDrag}
        onCollapse={collapseIsland}
        onResetPosition={resetIslandPosition}
        minimizesToTray={settings.minimizeAction === "tray"}
        onMinimize={settings.minimizeAction === "tray" ? minimizeIsland : minimizeToEdge}
        onOpenTranslator={settings.translationEnabled ? openTranslator : null}
        translationPeek={translationPeek}
        onOpenTranslationPeek={openTranslationPeek}
        onOpenSettings={openSettingsWindow}
        onTuck={tuckIsland}
        onReveal={hoverTucked}
        onPageChange={setPage}
        pageDigitModifiers={settings.pageDigitModifiers}
        overlay={<PluginPermissionPrompt prompts={permissionPrompts} />}
        pluginStatusChip={<PluginStatusSlot views={pluginPages.views} onOpen={openEnabledPage} />}
        collapsedSlots={collapsedSlots}
        pluginPageButtons={<PluginPageButtons views={pluginPages.views} page={page} features={features} modifiers={settings.pageDigitModifiers} onOpen={setPage} />}
      >
        <IslandPages
          page={page}
          mode={mode}
          settings={settings}
          features={features}
          qqMail={qqMail}
          qqNotifications={qqNotifications}
          wechatReminders={wechatReminders}
          messageSource={messageSource}
          openMessages={openMessages}
          media={media}
          clipboard={clipboard}
          agentSessions={listedAgentSessions}
          unseenAgentSessions={unseenAgentSessions}
          alertedSession={alertedSession}
          agentApprovals={agentApprovals}
          pluginPages={pluginPages}
          fileShelf={fileShelf}
          isShelfDropping={isShelfDropping}
          notebookProps={notebookProps}
        />
      </IslandShell>
      <PluginContextMenus />
    </main>
  );
}

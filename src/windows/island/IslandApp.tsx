import { useCallback, useMemo } from "react";
// First: the message panels it loads bring CSS that must come before the page panels' and the shell's.
import { useIslandNotices } from "./useIslandNotices";
import { PluginPermissionPrompt } from "../../features/plugins/PluginPermissionPrompt";
import { PluginContextMenus } from "../../features/plugins/PluginContextMenu";
// The page panels; before IslandShell so their CSS keeps its place in the cascade.
import { useCalendar } from "../../features/calendar/useCalendar";
import { todoEvents } from "../../features/calendar/todoEvents";
import { IslandPages } from "./IslandPages";
import { PluginStatusSlot } from "../../features/plugin-views/PluginStatusSlot";
import { useTranslation } from "../../i18n";
import { openSettingsWindow } from "../settings/api";
import { useQuickTranslation } from "../../features/translation/useQuickTranslation";
import { useIslandSettings } from "../../features/appearance/useIslandSettings";
import { useClipboardHistory } from "../../features/clipboard/useClipboardHistory";
// Imported after the page panels so its CSS keeps its place in the cascade.
import { IslandShell } from "./IslandShell";
import { useMediaState } from "../../features/media/useMediaState";
import type { TodoItem } from "../../features/todos/types";
import { useIslandWindow } from "./useIslandWindow";
import { getExpandedIslandHeight } from "./expandedHeight";
import { getIslandStageStyle } from "./stageStyle";
import { useCollapsedTodo } from "./useCollapsedTodo";
import { useGameMode } from "./useGameMode";
import { useIslandKeyboard } from "./useIslandKeyboard";
import { useIslandFeatures } from "./useIslandFeatures";
import { useIslandAgentAlerts } from "./useIslandAgentAlerts";
import { useIslandAgents } from "./useIslandAgents";
import { useAgentIndicator } from "./useAgentIndicator";
import { usageLineCount } from "../../features/agent-status/usage";
import { useIslandNavigation } from "./useIslandNavigation";
import { useIslandTodos } from "./useIslandTodos";
import { useIslandTucking } from "./useIslandTucking";
import { useIslandShelf } from "./useIslandShelf";
import { useIslandHover } from "./useIslandHover";
import { useIslandTranslation } from "./useIslandTranslation";
import { usePluginPages } from "./usePluginPages";
import { useMessageView } from "./useMessageView";
import { PluginPageButtons } from "./PluginPageButtons";
import { useCollapsedSlots } from "./useCollapsedSlots";
// Must stay the last import: IslandApp.css overrides the feature styles above.
import "./IslandApp.css";

// Stands in for the todo list while todos are switched off, so the collapsed island shows none.
const NO_TODOS: TodoItem[] = [];

/**
 * The island window: puts the feature hooks together and hands their state to the shell and the
 * page panels. Each concern's wiring lives in its own use* hook next to this file; add new wiring
 * there rather than here, so parallel changes do not all meet in this file.
 */
export function IslandApp() {
  const t = useTranslation();
  const navigation = useIslandNavigation();
  const { mode, isTucked, page, setPage, collapseIsland, tuckIsland, revealIsland, minimizeToEdge, openIslandPage, toggleClipboardHistory } = navigation;
  const pluginPages = usePluginPages(page);
  const [settings, setSettings] = useIslandSettings();
  // Quiet while a full-screen app (usually a game) is in front, if game mode asks for it.
  const game = useGameMode(settings, { mode, isTucked, collapseIsland, tuckIsland, revealIsland });
  const notices = useIslandNotices(settings, { mode, isTucked, quiet: game.quiet });
  const { qqNotifications, wechatReminders, qqMail, pluginNotifications, permissionPrompts, hasMessagePreview } = notices;
  const media = useMediaState(settings.musicEnabled);
  const { agentStatus, agentSessions, listedAgentSessions, activeAgentSessionCount, unseenAgentSessions, agentRemoval, agentSession, agentActivity, agentUsages } =
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
  const { todos, activeTodoId, todoPageMode, notebookProps } = useIslandTodos({ settings, mode, page, agentStatus, collapseIsland });

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
  useIslandTucking({
    settings,
    navigation,
    hasMessagePreview,
    hasPermissionPrompt: permissionPrompts.current !== null,
    hasTranslationPeek: Boolean(translationPeek),
  });

  const { messageSource, setMessageSource, openMessages } = useMessageView(qqMail.closeReader, openIslandPage);

  const clipboard = useClipboardHistory(toggleClipboardHistory);
  // Todos starting with a time ("15:00 周会") count down like meetings, with no calendar needed.
  const timedTodos = useMemo(() => (settings.todoEnabled ? todoEvents(todos, Date.now(), t.island.todoList) : []), [settings.todoEnabled, t, todos]);
  const calendar = useCalendar(settings.calendarEnabled, settings.calendarRemindMinutes, timedTodos);
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
    unseen: unseenAgentSessions.keys,
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
    agentUsageLines: settings.agentShowUsage ? usageLineCount(agentUsages) : 0,
    agentAlertRowHeight: agentCardHeight,
    pluginTemplate: pluginPages.entry?.template,
    pluginListRows: pluginPages.rows,
    pluginWebviewHeight: pluginPages.entry?.height,
  });
  const stageStyle = useMemo(
    () => getIslandStageStyle(settings, mode, collapsedIslandWidth, expandedIslandHeight),
    [collapsedIslandWidth, expandedIslandHeight, mode, settings],
  );

  const { fileShelf, isShelfDropping } = useIslandShelf(settings, navigation);

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

  const hoverTucked = useIslandHover({
    settings,
    navigation,
    quiet: game.quiet,
    hasMessagePreview,
    namesAgent: Boolean(agentSession),
    openEnabledPage,
  });

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

  const { agentVisualState, agentStatusLabel } = useAgentIndicator(agentStatus, settings, activeAgentSessionCount, t);

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
        deviceUse={notices.deviceUse}
        levelPopup={notices.levelPopup}
        deviceAlert={notices.deviceAlert}
        meeting={calendar.upcoming && settings.calendarEnabled ? { upcoming: calendar.upcoming, showTitle: settings.calendarShowTitle } : null}
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
          agentRemoval={agentRemoval}
          alertedSession={alertedSession}
          agentApprovals={agentApprovals}
          agentUsages={agentUsages}
          pluginPages={pluginPages}
          fileShelf={fileShelf}
          isShelfDropping={isShelfDropping}
          notebookProps={notebookProps}
          calendar={calendar}
        />
      </IslandShell>
      <PluginContextMenus />
    </main>
  );
}

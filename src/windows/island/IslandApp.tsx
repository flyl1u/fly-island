import { useMemo } from "react";
import { visibleCollapsedSlots } from "../../features/appearance/collapsedLayout";
// First: the message panels it loads bring CSS that must come before the page panels' and the shell's.
import { useLowBatteryAlert } from "../../features/device-battery/useLowBatteryAlert";
import { quotaAlertText } from "../../features/agent-status/QuotaAlertPopup";
import { collapsedMessageText } from "../../features/messages/messagePreview";
import { useIslandNotices } from "./useIslandNotices";
// The page panels; before IslandShell so their CSS keeps its place in the cascade.
import { IslandPages } from "./IslandPages";
import { useTranslation } from "../../i18n";
import { useSettingsPresentation } from "../settings/useSettingsPresentation";
import { useSettingsNavigation } from "./useSettingsNavigation";
import { useIslandSettings } from "../../features/appearance/useIslandSettings";
import { useDocumentTheme } from "../../features/appearance/useDocumentTheme";
import { resolveSchemeColors } from "../../features/appearance/theme";
import { useClipboardHistory } from "../../features/clipboard/useClipboardHistory";
// Imported after the page panels so its CSS keeps its place in the cascade.
import { IslandShell } from "./IslandShell";
import { useMediaState } from "../../features/media/useMediaState";
import { useLyrics } from "../../features/media/lyrics/useLyrics";
import type { TodoItem } from "../../features/todos/types";
import { useIslandWindow } from "./useIslandWindow";
import { getExpandedIslandHeight } from "./expandedHeight";
import { getIslandStageStyle } from "./stageStyle";
import { shapedSettings } from "../../features/appearance/islandShape";
import { useCollapsedTodo } from "./useCollapsedTodo";
import { useCollapsedWidthMotion } from "./useCollapsedWidthMotion";
import { useMessageNotice } from "./useMessageNotice";
import { useGameMode } from "./useGameMode";
import { useMusicGrace } from "./useMusicGrace";
import { useIslandKeyboard } from "./useIslandKeyboard";
import { useCtrlWheelPages, wheelPageOrder } from "./useCtrlWheelPages";
import { useIslandFeatures } from "./useIslandFeatures";
import { useIslandAgentAlerts } from "./useIslandAgentAlerts";
import { useIslandAgents } from "./useIslandAgents";
import { useQuotaAlert } from "../../features/agent-status/useQuotaAlert";
import { AgentArrangeButton } from "../../features/agent-status/AgentArrangeButton";
import { useAgentIndicator } from "./useAgentIndicator";
import { usageLineCount } from "../../features/agent-status/usage";
import { useIslandNavigation } from "./useIslandNavigation";
import { useIslandTodos } from "./useIslandTodos";
import { useIslandTucking } from "./useIslandTucking";
import { useIslandShelf } from "./useIslandShelf";
import { useIslandHover } from "./useIslandHover";
import { useIdleUpdateInstall } from "../../features/updater/useIdleUpdateInstall";
import { useIslandTranslation } from "./useIslandTranslation";
import { useMessageView } from "./useMessageView";
import { useSettingsPageHeight } from "./useSettingsPageHeight";
import { useIslandPickerOpen } from "../../lib/islandPicker";
import { TODO_DATE_PICKER_EXPANDED_ISLAND_HEIGHT } from "./layout";
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
  const [settings, setSettings] = useIslandSettings();
  const detachedSettings = useSettingsPresentation();
  const { openSettings, changePresentation } = useSettingsNavigation(openIslandPage, setPage);
  const { settingsContentHeight, reportSettingsHeight } = useSettingsPageHeight();
  // Quiet while a full-screen app (usually a game) is in front, if game mode asks for it.
  const game = useGameMode(settings, { mode, isTucked, tuckSource: navigation.tuckSource, collapseIsland, tuckForGame: navigation.tuckForGame, revealIsland });
  const notices = useIslandNotices(settings, { mode, isTucked, quiet: game.quiet });
  useIdleUpdateInstall(mode === "collapsed", game.quiet);
  const { qqNotifications, wechatReminders, qqMail, preview, hasMessagePreview } = notices;
  // The output level shows only on the collapsed island (its waveform).
  const media = useMediaState(settings.musicEnabled, mode === "collapsed");
  const { agentStatus, agentSessions, listedAgentSessions, activeAgentSessionCount, unseenAgentSessions, agentRemoval, agentSession, runningAgents, agentUsages, alertUsages } =
    useIslandAgents(settings);
  const quotaAlert = useQuotaAlert(alertUsages, settings.agentStatusEnabled ? settings.agentQuotaAlertPercent : 0, {
    quiet: game.quiet,
    canPopUp: !game.quiet && mode === "collapsed" && !isTucked,
  });
  const { todos, activeTodoId, activeTodoIds, timer, timers, todoPageMode, todoListHeight, notebookProps } = useIslandTodos({ settings, navigation, quiet: game.quiet });

  const songPlaying = settings.musicEnabled && media.mediaState.playbackStatus === "playing" && Boolean(media.mediaState.title);
  const { lines: collapsedLyrics } = useLyrics(media.mediaState, settings, songPlaying);
  // "Stay out while music plays" follows the media session itself, not the lyric line.
  const musicHoldsIsland = useMusicGrace(settings.musicEnabled && media.mediaState.playbackStatus === "playing");
  const cover = settings.collapsedShowCover && songPlaying ? media.mediaState.thumbnail : null;
  const { agentVisualState, agentStatusLabel } = useAgentIndicator(agentStatus, settings, activeAgentSessionCount, agentSessions, t);

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
  });
  const batteryAlert = useLowBatteryAlert(
    features.pluginPages?.some((entry) => entry.id === "device-battery") ?? false,
    mode === "collapsed" && !isTucked && !game.quiet && !hasMessagePreview && quotaAlert === null,
  );
  const collapsed = mode === "collapsed" && !isTucked;
  const { collapsedTaskTitle, collapsedTodoCount, collapsedItem, peekedAgent, switchCollapsedItem, collapsedIslandWidth: collapsedWidthTarget, statusFit, idleDisplay, todoRotation, collapsedTimer } =
    useCollapsedTodo(
      settings.todoEnabled ? todos : NO_TODOS,
      settings.todoEnabled ? activeTodoId : null,
      settings.todoEnabled ? settings : { ...settings, showIdleTodoCount: false },
      !collapsed || !settings.showCollapsedText || hasMessagePreview,
      agentSession?.title ?? null,
      { lyricsPlaying: songPlaying, lyricsAvailable: Boolean(collapsedLyrics?.some((line) => line.text.trim())),
        agentActive: activeAgentSessionCount > 0 || agentVisualState === "running" || Boolean(agentStatus.others?.some((agent) => agent.phase === "running")),
        runningAgents, agentPeekAllowed: collapsed && !hasMessagePreview,
        coverWanted: Boolean(cover), timer: settings.todoEnabled ? timer : null,
        activeIds: settings.todoEnabled ? activeTodoIds : [], timers: settings.todoEnabled ? timers : [],
        // The extra is the source icon and the spacing round the sender's dot, or the code's button.
        notice: collapsed && preview ? { text: collapsedMessageText(preview, t.messages), extraWidth: preview.otpCode ? 140 : 30 } : null,
        alertText: quotaAlert ? quotaAlertText(quotaAlert, t.agent.quota) : batteryAlert ? t.deviceBattery.lowAlert(batteryAlert.name, batteryAlert.percent) : null },
    );
  const collapsedCover = collapsedItem === "lyrics" ? cover : null;
  const notice = useMessageNotice(preview, settings, { mode, isTucked, quiet: game.quiet, collapsedIslandWidth: collapsedWidthTarget });
  const widthMotion = useCollapsedWidthMotion(notice.size?.width ?? collapsedWidthTarget, collapsed);
  const collapsedIslandWidth = widthMotion.width;
  useIslandTucking({
    settings,
    navigation,
    hasMessagePreview,
    activity: { agentVisualState, activeAgentSessionCount, collapsedItem, songPlaying: musicHoldsIsland, activeTodoId, timer },
    gameHolds: game.quiet || game.tuck,
    browserOnIslandMonitor: game.browserOnIslandMonitor,
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
  const { fileShelf, isShelfDropping } = useIslandShelf(settings, navigation);
  const pickerOpen = useIslandPickerOpen();
  // The plugin page open, if any: its page fits the entries and buttons the plugin reports.
  const pluginPage = features.pluginPages?.find((info) => info.page === page);
  const expandedIslandHeight = Math.max(pickerOpen && page === "todo" ? TODO_DATE_PICKER_EXPANDED_ISLAND_HEIGHT : 0, getExpandedIslandHeight({
    page,
    todoPageMode,
    todos,
    todoListHeight,
    hasMediaCommandError: Boolean(media.mediaCommandError),
    messageSource,
    isReadingMail: qqMail.wantsTallPanel,
    maxPanelHeight: settings.maxPanelHeight,
    clipboardVisibleRows: settings.clipboardVisibleRows,
    todoVisibleRows: settings.todoVisibleRows,
    agentVisibleRows: settings.agentVisibleRows,
    agentSessionView: settings.agentSessionView,
    fontScale: settings.islandFontPercent / 100,
    agentUsageLines: settings.agentShowUsage ? usageLineCount(agentUsages) : 0,
    agentAlertRowHeight: agentCardHeight,
    settingsContentHeight,
    shelfItems: fileShelf.items.length,
    pluginPanel: pluginPage ? { rows: pluginPage.rows, actions: pluginPage.actions } : undefined,
  }));
  const scheme = useDocumentTheme(settings);
  const colors = useMemo(() => resolveSchemeColors(settings, scheme), [settings, scheme]);
  const stageStyle = useMemo(
    () => getIslandStageStyle(shapedSettings(settings), colors, collapsedIslandWidth, expandedIslandHeight, notice.size?.height),
    [collapsedIslandWidth, colors, expandedIslandHeight, settings, notice.size?.height],
  );


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
    collapsedIslandWidth: widthMotion.hitWidth,
    notice: { ...notice.nativeNotice, width: notice.nativeNotice.width === null ? null : widthMotion.hitWidth },
    onCollapse: collapseIsland,
  });

  const tuckedHover = useIslandHover({
    settings,
    navigation,
    quiet: game.quiet,
    browserOnIslandMonitor: game.browserOnIslandMonitor,
    hasMessagePreview,
    namesAgent: settings.showCollapsedText && collapsedItem === "agent" && !quotaAlert && !batteryAlert,
    openEnabledPage,
  });

  useIslandKeyboard(
    clipboardHistory.settings.enabled && clipboardHistory.settings.shortcutEnabled,
    clipboardHistory.settings.shortcut,
    toggleClipboardHistory,
    collapseIsland,
  );

  useCtrlWheelPages({
    enabled: settings.ctrlWheelPages,
    mode,
    page,
    pages: wheelPageOrder(settings.pageOrder, features, settings.clipboardDetached),
    onPageChange: setPage,
  });

  const { openTranslator } = useIslandTranslation(
    settings.translationEnabled,
    features.translation,
    mode,
    page,
    openIslandPage,
    collapseIsland,
  );

  return (
    <main className={`stage stage--font-${settings.fontFamily}`} data-tone={colors.tone} style={stageStyle}>
      <IslandShell
        qqMail={qqMail}
        qqNotifications={qqNotifications}
        wechatReminders={wechatReminders}
        onOpenMessages={openMessages}
        preview={preview}
        notice={notice.size}
        mode={mode}
        page={page}
        expandedHeight={expandedIslandHeight}
        material={settings.material}
        nativeGlassState={nativeGlassState}
        isTucked={isTucked}
        tuckStyle={settings.tuckStyle}
        topEdgeShoulders={settings.topEdgeShoulders}
        islandCornerShape={settings.islandCornerShape}
        positionLocked={settings.positionLocked}
        isDetached={isPositionDetached || settings.marginY > 0}
        islandShape={settings.islandShape}
        showTitle={settings.showTitle}
        widthMoving={widthMotion.enabled}
        brandText={idleDisplay.brand}
        pendingText={idleDisplay.pending}
        showCollapsedText={settings.showCollapsedText}
        collapsedTaskTitle={collapsedTaskTitle}
        todoRotation={todoRotation}
        todoTimer={settings.todoEnabled ? collapsedTimer : null}
        collapsedTodoCount={collapsedTodoCount}
        collapsedItem={collapsedItem}
        onSwitchCollapsedItem={switchCollapsedItem}
        collapsedLyrics={collapsedLyrics}
        collapsedOrder={settings.collapsedLayout}
        collapsedLayout={visibleCollapsedSlots(settings.collapsedLayout, [...settings.collapsedHidden,
          ...(statusFit.clock ? [] : ["clock" as const]), ...(statusFit.weather ? [] : ["weather" as const])])}
        collapsedCover={collapsedCover}
        lyricsSettings={settings}
        pageOrder={settings.pageOrder}
        pageButtonStyle={settings.pageButtonStyle}
        onPageOrderChange={(pageOrder) => setSettings({ ...settings, pageOrder })}
        agentSession={peekedAgent ?? agentSession}
        activeAgentSessionCount={activeAgentSessionCount}
        mediaState={media.mediaState}
        agentVisualState={agentVisualState}
        agentStatusLabel={agentStatusLabel}
        features={features}
        shelfCount={settings.shelfEnabled && settings.shelfShowCount ? fileShelf.items.length : null}
        quotaAlert={quotaAlert}
        batteryAlert={batteryAlert}
        onOpenPage={openEnabledPage}
        onWindowDragStart={startIslandDrag}
        onCollapse={collapseIsland}
        onResetPosition={resetIslandPosition}
        minimizesToTray={settings.minimizeAction === "tray"}
        onMinimize={settings.minimizeAction === "tray" ? minimizeIsland : minimizeToEdge}
        onOpenTranslator={settings.translationEnabled ? openTranslator : null}
        onOpenSettings={openSettings}
        onTuck={tuckIsland}
        onContextTuck={minimizeToEdge}
        onReveal={tuckedHover.hoverTucked}
        clickTuckedToOpen={game.browserOnIslandMonitor && settings.browserAutoTuckClickToOpen}
        onClickTucked={tuckedHover.clickTucked}
        onPageChange={setPage}
        pageActions={page === "agents" && (
          <AgentArrangeButton sort={settings.agentSessionSort} group={settings.agentSessionGroup} onChange={(patch) => setSettings({ ...settings, ...patch })} />
        )}
      >
        <IslandPages
          page={page}
          mode={mode}
          settings={settings}
          onSettingsChange={setSettings}
          detachedSettings={detachedSettings}
          onDetachedSettingsChange={(value) => void changePresentation(value)}
          onSettingsHeight={reportSettingsHeight}
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
          fileShelf={fileShelf}
          isShelfDropping={isShelfDropping}
          notebookProps={notebookProps}
        />
      </IslandShell>
    </main>
  );
}

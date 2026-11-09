import { useMemo } from "react";
// First: the message panels it loads bring CSS that must come before the page panels' and the shell's.
import { useIslandNotices } from "./useIslandNotices";
// The page panels; before IslandShell so their CSS keeps its place in the cascade.
import { IslandPages } from "./IslandPages";
import { useTranslation } from "../../i18n";
import { useSettingsPresentation } from "../settings/useSettingsPresentation";
import { useSettingsNavigation } from "./useSettingsNavigation";
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
import { useQuotaAlert } from "../../features/agent-status/useQuotaAlert";
import { AgentArrangeButton } from "../../features/agent-status/AgentArrangeButton";
import { useAgentIndicator } from "./useAgentIndicator";
import { usageLineCount } from "../../features/agent-status/usage";
import { useIslandNavigation } from "./useIslandNavigation";
import { useIslandTodos } from "./useIslandTodos";
import { useIslandTucking } from "./useIslandTucking";
import { useIslandShelf } from "./useIslandShelf";
import { useIslandHover } from "./useIslandHover";
import { useIslandTranslation } from "./useIslandTranslation";
import { useMessageView } from "./useMessageView";
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
  // Quiet while a full-screen app (usually a game) is in front, if game mode asks for it.
  const game = useGameMode(settings, { mode, isTucked, collapseIsland, tuckIsland, revealIsland });
  const notices = useIslandNotices(settings, { mode, isTucked, quiet: game.quiet });
  const { qqNotifications, wechatReminders, qqMail, hasMessagePreview } = notices;
  const media = useMediaState(settings.musicEnabled);
  const { agentStatus, agentSessions, listedAgentSessions, activeAgentSessionCount, unseenAgentSessions, agentRemoval, agentSession, agentUsages } =
    useIslandAgents(settings);
  const quotaAlert = useQuotaAlert(agentUsages, settings.agentStatusEnabled ? settings.agentQuotaAlertPercent : 0, {
    quiet: game.quiet,
    canPopUp: !game.quiet && mode === "collapsed" && !isTucked,
  });
  const { todos, activeTodoId, todoPageMode, notebookProps } = useIslandTodos({ settings, collapseIsland });

  const { collapsedTaskTitle, collapsedTodoCount, collapsedIslandWidth } =
    useCollapsedTodo(
      settings.todoEnabled ? todos : NO_TODOS,
      settings.todoEnabled ? activeTodoId : null,
      settings.todoEnabled ? settings : { ...settings, showIdleTodoCount: false },
      mode !== "collapsed" || isTucked || !settings.showCollapsedText || hasMessagePreview,
      agentSession?.title ?? null,
    );
  useIslandTucking({
    settings,
    navigation,
    hasMessagePreview,
  });

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
    agentSessionView: settings.agentSessionView,
    agentUsageLines: settings.agentShowUsage ? usageLineCount(agentUsages) : 0,
    agentAlertRowHeight: agentCardHeight,
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
  );

  const { agentVisualState, agentStatusLabel } = useAgentIndicator(agentStatus, settings, activeAgentSessionCount, t);

  const { openTranslator } = useIslandTranslation(
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
        quotaAlert={quotaAlert}
        onOpenPage={openEnabledPage}
        onWindowDragStart={startIslandDrag}
        onCollapse={collapseIsland}
        onResetPosition={resetIslandPosition}
        minimizesToTray={settings.minimizeAction === "tray"}
        onMinimize={settings.minimizeAction === "tray" ? minimizeIsland : minimizeToEdge}
        onOpenTranslator={settings.translationEnabled ? openTranslator : null}
        onOpenSettings={openSettings}
        onTuck={tuckIsland}
        onReveal={hoverTucked}
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

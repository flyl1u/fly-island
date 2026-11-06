import type { CollapsedMeeting } from "../../features/calendar/upcoming";
import type { DeviceUse } from "../../features/device-use/api";
import type { LevelChange } from "../../features/system-levels/api";
import type { DeviceAlert } from "../../features/device-events/api";
import { useState, type ReactNode } from "react";
import type { AgentSession } from "../../features/agent-status/session";
import type { AgentVisualState } from "../../features/agent-status/status";
import type { AppearanceMode } from "../../features/appearance/types";
import type { MediaState } from "../../features/media/api";
import { latestMessagePreview, type MessageSource } from "../../features/messages/messagePreview";
import type { MailController } from "../../features/messages/mail/MailPanel";
import type { QQNotificationsController } from "../../features/messages/qq-notifications/QQNotifications";
import type { WeChatRemindersController } from "../../features/messages/wechat/WeChatReminders";
import type { PluginNotificationsController } from "../../features/plugins/usePluginNotifications";
import { useTranslation } from "../../i18n";
import { isPluginPage, type IslandFeatures } from "./features";
import { IslandCollapsedBar } from "./IslandCollapsedBar";
import { IslandHeader } from "./IslandHeader";
import type { CollapsedSlots, IslandMode, IslandPage, NativeGlassState } from "./types";
import { useGlassPointer } from "./useGlassPointer";
import { useIslandPreparing } from "./useIslandPreparing";
import { usePageFadeIn } from "./usePageFadeIn";
import "./IslandShell.css";

type IslandShellProps = {
  qqMail: MailController;
  qqNotifications: QQNotificationsController;
  wechatReminders: WeChatRemindersController;
  pluginNotifications: PluginNotificationsController;
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
  /** Running agent session shown in place of the todo, or null. */
  agentSession: AgentSession | null;
  /** Agent sessions still working, shown in place of the tuck dot while the AI Agent switch is on. */
  activeAgentSessionCount: number;
  mediaState: MediaState;
  agentVisualState: AgentVisualState;
  agentStatusLabel: string;
  /** Modules switched on; the header and collapsed bar hide the rest. */
  features: IslandFeatures;
  /** Files on the shelf for the collapsed bar, or null when it does not show them. */
  shelfCount: number | null;
  deviceUse: DeviceUse;
  levelPopup?: LevelChange | null;
  deviceAlert?: DeviceAlert | null;
  /** A meeting about to start (calendar), and whether to name it. */
  meeting?: CollapsedMeeting | null;
  onOpenPage: (page: IslandPage) => void;
  onWindowDragStart: () => void;
  onCollapse: () => void;
  onResetPosition: () => void;
  minimizesToTray: boolean;
  onMinimize: () => void;
  /** Null while translation is switched off, which hides its button. */
  onOpenTranslator: (() => void) | null;
  /** One line from the selection shortcut, shown on the collapsed island, or null. */
  translationPeek: string | null;
  onOpenTranslationPeek: () => void;
  onOpenSettings: (section?: "updates") => void;
  onTuck: () => void;
  onReveal: () => void;
  onPageChange: (page: IslandPage) => void;
  pageDigitModifiers: string;
  /** Shown over the top row in both modes, e.g. a plugin permission question. */
  overlay?: ReactNode;
  /** Buttons for plugin pages in the expanded header. */
  pluginPageButtons?: ReactNode;
  /** A plugin's status text on the collapsed bar. */
  pluginStatusChip?: ReactNode;
  /** Built-in plugins' slots on the collapsed bar. */
  collapsedSlots?: CollapsedSlots;
  children: ReactNode;
};

export function IslandShell({
  qqMail,
  qqNotifications,
  wechatReminders,
  pluginNotifications,
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
  agentSession,
  activeAgentSessionCount,
  mediaState,
  agentVisualState,
  agentStatusLabel,
  features,
  shelfCount,
  deviceUse,
  levelPopup = null,
  deviceAlert = null,
  meeting = null,
  onOpenPage,
  onWindowDragStart,
  onCollapse,
  onResetPosition,
  minimizesToTray,
  onMinimize,
  onOpenTranslator,
  translationPeek,
  onOpenTranslationPeek,
  onOpenSettings,
  onTuck,
  onReveal,
  onPageChange,
  pageDigitModifiers,
  overlay,
  pluginPageButtons,
  pluginStatusChip,
  collapsedSlots,
  children,
}: IslandShellProps) {
  const t = useTranslation();
  const isExpanded = mode === "expanded";
  const isLiquidGlass = appearanceMode === "liquidGlass";
  const { handleGlassPointerMove, resetGlassPointer } = useGlassPointer(isLiquidGlass);
  const isPreparing = useIslandPreparing(isExpanded);
  const contentRef = usePageFadeIn<HTMLDivElement>(page, mode);
  const qqPreview = qqNotifications.preview;
  const qqNotificationCount = qqNotifications.snapshot.items.length;
  const wechatPending = wechatReminders.snapshot.pending;
  const wechatPreviewAt = wechatReminders.previewReceivedAt;
  const pluginNotification = pluginNotifications.notification;
  const [latestPreviewAt, setLatestPreviewAt] = useState(0);
  const preview = latestMessagePreview([
    qqPreview ? { ...qqPreview, source: "qq", receivedAt: qqNotifications.previewReceivedAt ?? 0 } : null,
    wechatPreviewAt !== null ? { source: "wechat", title: t.messages.wechat, body: t.messages.newReminder, receivedAt: wechatPreviewAt } : null,
    qqMail.preview ? { source: "qqMail", title: qqMail.preview.sender, body: qqMail.preview.subject, receivedAt: qqMail.previewReceivedAt ?? 0 } : null,
    pluginNotification ? { source: "plugin", title: pluginNotification.title, body: pluginNotification.body, receivedAt: pluginNotification.receivedAt } : null,
  ], latestPreviewAt);
  if (preview && preview.receivedAt > latestPreviewAt) setLatestPreviewAt(preview.receivedAt);
  const className = [
    "island",
    `island--${mode}`,
    // Plugin page ids contain ":" and "/", so they share one class.
    isPluginPage(page) ? "island--plugin" : `island--${page}`,
    `island--appearance-${appearanceMode}`,
    isPreparing && !isExpanded ? "island--preparing" : "",
    isDetached ? "island--detached" : "island--docked",
    isTucked ? "island--tucked" : "",
    isLiquidGlass ? `island--glass-${nativeGlassState}` : "",
    showTitle ? "" : "island--title-hidden",
  ]
    .filter(Boolean)
    .join(" ");
  const collapsedLabel = showCollapsedText
    ? agentSession
      ? t.island.agentSession(agentSession.label, agentSession.title)
      : collapsedTaskTitle
      ? t.messages.collapsedTask(collapsedTaskTitle)
      : collapsedTodoCount !== null
        ? t.island.pendingTodos(collapsedTodoCount)
        : "fly-island"
    : "fly-island";

  return (
    <section
      className={className}
      aria-label={collapsedLabel}
      onClick={(event) => {
        if (!isExpanded && event.target === event.currentTarget) {
          onOpenPage(agentSession ? "agents" : page);
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
        <IslandCollapsedBar
          qqMail={qqMail}
          qqNotifications={qqNotifications}
          wechatReminders={wechatReminders}
          pluginNotifications={pluginNotifications}
          pluginStatusChip={pluginStatusChip}
          slots={collapsedSlots}
          preview={preview}
          page={page}
          isExpanded={isExpanded}
          isTucked={isTucked}
          showTitle={showTitle}
          showCollapsedText={showCollapsedText}
          collapsedLabel={collapsedLabel}
          collapsedTaskTitle={collapsedTaskTitle}
          collapsedTodoCount={collapsedTodoCount}
          agentSession={agentSession}
          agentSessionCount={features.agents ? activeAgentSessionCount : null}
          mediaState={mediaState}
          showMusic={features.music}
          shelfCount={shelfCount}
          deviceUse={deviceUse}
          levelPopup={levelPopup}
          deviceAlert={deviceAlert}
          meeting={meeting}
          agentVisualState={agentVisualState}
          onOpenPage={onOpenPage}
          onOpenMessages={onOpenMessages}
          translationPeek={translationPeek}
          onOpenTranslationPeek={onOpenTranslationPeek}
          onWindowDragStart={onWindowDragStart}
          onTuck={onTuck}
        />

        <div
          id="island-panel"
          className="island__expanded"
          aria-hidden={!isExpanded}
          inert={!isExpanded}
        >
          <IslandHeader
            page={page}
            features={features}
            showTitle={showTitle}
            isDetached={isDetached}
            agentVisualState={agentVisualState}
            agentStatusLabel={agentStatusLabel}
            qqNotificationCount={qqNotificationCount}
            wechatPending={wechatPending}
            onPageChange={onPageChange}
            onCollapse={onCollapse}
            onOpenSettings={onOpenSettings}
            onOpenMessages={onOpenMessages}
            onOpenTranslator={onOpenTranslator}
            onResetPosition={onResetPosition}
            minimizesToTray={minimizesToTray}
            onMinimize={onMinimize}
            pageDigitModifiers={pageDigitModifiers}
            pluginPageButtons={pluginPageButtons}
          />
          <div ref={contentRef} className="island__content">{children}</div>
        </div>
        {overlay}
      </div>
    </section>
  );
}

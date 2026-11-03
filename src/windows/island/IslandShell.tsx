import { useState, type ReactNode } from "react";
import type { AgentVisualState } from "../../features/agent-status/status";
import type { AppearanceMode } from "../../features/appearance/types";
import type { MediaState } from "../../features/media/api";
import { latestMessagePreview, type MessageSource } from "../../features/messages/messagePreview";
import type { QQMailController } from "../../features/messages/qq-mail/QQMail";
import type { QQNotificationsController } from "../../features/messages/qq-notifications/QQNotifications";
import type { WeChatRemindersController } from "../../features/messages/wechat/WeChatReminders";
import { useTranslation } from "../../i18n";
import { IslandCollapsedBar } from "./IslandCollapsedBar";
import { IslandHeader } from "./IslandHeader";
import type { IslandMode, IslandPage, NativeGlassState } from "./types";
import { useGlassPointer } from "./useGlassPointer";
import { useIslandPreparing } from "./useIslandPreparing";

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
  const isExpanded = mode === "expanded";
  const isLiquidGlass = appearanceMode === "liquidGlass";
  const { handleGlassPointerMove, resetGlassPointer } = useGlassPointer(isLiquidGlass);
  const isPreparing = useIslandPreparing(isExpanded);
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
  const collapsedLabel = showCollapsedText
    ? collapsedTaskTitle
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
        <IslandCollapsedBar
          qqMail={qqMail}
          qqNotifications={qqNotifications}
          wechatReminders={wechatReminders}
          preview={preview}
          page={page}
          isExpanded={isExpanded}
          isTucked={isTucked}
          showTitle={showTitle}
          showCollapsedText={showCollapsedText}
          collapsedLabel={collapsedLabel}
          collapsedTaskTitle={collapsedTaskTitle}
          collapsedTodoCount={collapsedTodoCount}
          mediaState={mediaState}
          agentVisualState={agentVisualState}
          agentStatusLabel={agentStatusLabel}
          onOpenPage={onOpenPage}
          onOpenMessages={onOpenMessages}
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
            onMinimize={onMinimize}
          />
          <div className="island__content">{children}</div>
        </div>
      </div>
    </section>
  );
}

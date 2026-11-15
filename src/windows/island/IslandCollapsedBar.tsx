import { Fragment, useLayoutEffect, useRef, type ReactNode } from "react";
import { Bot, Inbox } from "lucide-react";
import { AgentProviderIcon } from "../../features/agent-status/AgentProviderIcon";
import type { QuotaAlert } from "../../features/agent-status/quotaAlerts";
import { QuotaAlertPopup } from "../../features/agent-status/QuotaAlertPopup";
import type { AgentSession } from "../../features/agent-status/session";
import type { AgentVisualState } from "../../features/agent-status/status";
import type { CollapsedItem, CollapsedSlot } from "../../features/appearance/types";
import type { MediaState } from "../../features/media/api";
import { CollapsedLyric } from "../../features/media/CollapsedLyric";
import type { LyricsSettings } from "../../features/media/lyrics/useLyrics";
import { CollapsedMessageContent } from "../../features/messages/CollapsedMessageContent";
import { MessageSourceIcon } from "../../features/messages/MessageSourceIcon";
// After CollapsedMessageContent, matching the original stylesheet order.
import { MusicWaveButton } from "../../features/media/MusicWaveButton";
import { messagePreviewText, type MessagePreview, type MessageSource } from "../../features/messages/messagePreview";
import type { MailController } from "../../features/messages/mail/MailPanel";
import type { QQNotificationsController } from "../../features/messages/qq-notifications/QQNotifications";
import type { WeChatRemindersController } from "../../features/messages/wechat/WeChatReminders";
import { useTranslation } from "../../i18n";
import { TodoCountdown } from "../../features/todos/TodoCountdown";
import type { TodoTimer } from "../../features/todos/timer";
import { collapsedOpenPage } from "./collapsedOpenPage";
import type { IslandPage } from "./types";
import { useWindowDragGesture } from "./useWindowDragGesture";
import { IdleClock } from "../../features/appearance/IdleClock";
import type { IdleClockSettings } from "../../features/appearance/idleClockSettings";
import type { CollapsedNotice } from "./useCollapsedNotice";
import "./IslandCollapsedBar.css";

type IslandCollapsedBarProps = {
  balanceText?: string | null;
  balanceLow?: boolean;
  idleClockSettings?: IdleClockSettings;
  showIdleClock?: boolean;
  notice?: CollapsedNotice | null;
  qqMail: MailController;
  qqNotifications: QQNotificationsController;
  wechatReminders: WeChatRemindersController;
  preview: MessagePreview | null;
  page: IslandPage;
  isExpanded: boolean;
  isTucked: boolean;
  positionLocked: boolean;
  showTitle: boolean;
  showCollapsedText: boolean;
  collapsedLabel: string;
  collapsedTaskTitle: string | null;
  todoTimer?: TodoTimer | null;
  collapsedTodoCount: number | null;
  /** Which of the agent, the lyric line and a todo the text shows (Settings → Appearance), if any. */
  collapsedItem: CollapsedItem | null;
  /** Where the text and each status icon sit, left to right (Settings → Appearance). */
  collapsedLayout: readonly CollapsedSlot[];
  /** The playing song's cover, or null when it is not shown. */
  collapsedCover: string | null;
  lyricsSettings: LyricsSettings & { lyricsOffsetMs: number };
  agentSession: AgentSession | null;
  /**
   * Agent sessions still working, shown where the tuck dot was; null while the AI Agent switch
   * is off, which keeps the tuck dot.
   */
  agentSessionCount: number | null;
  mediaState: MediaState;
  /** False while music is switched off, which hides the waveform button. */
  showMusic: boolean;
  /** Files on the shelf, or null when the count is not shown. */
  shelfCount: number | null;
  /** Claude's or Codex's usage reaching the alert level, or resetting; it takes the place of the text while shown. */
  quotaAlert?: QuotaAlert | null;
  agentVisualState: AgentVisualState;
  onOpenPage: (page: IslandPage) => void;
  onOpenMessages: (source: MessageSource) => void;
  /** Quick translation line; it takes the place of the agent or todo text while shown. */
  onWindowDragStart: () => void;
  onTuck: () => void;
};

/** The collapsed island: agent pulse, todo or message summary, mail badge, music button and tuck handle. */
export function IslandCollapsedBar({
  balanceText,
  balanceLow = false,
  idleClockSettings,
  showIdleClock = false,
  notice = null,
  qqMail,
  qqNotifications,
  wechatReminders,
  preview,
  page,
  isExpanded,
  isTucked,
  positionLocked,
  showTitle,
  showCollapsedText,
  collapsedLabel,
  collapsedTaskTitle,
  todoTimer = null,
  collapsedTodoCount,
  collapsedItem,
  collapsedLayout,
  collapsedCover,
  lyricsSettings,
  agentSession,
  agentSessionCount,
  mediaState,
  showMusic,
  shelfCount,
  quotaAlert = null,
  agentVisualState,
  onOpenPage,
  onOpenMessages,
  onWindowDragStart,
  onTuck,
}: IslandCollapsedBarProps) {
  const t = useTranslation();
  const barRef = useRef<HTMLDivElement>(null);
  const centersIdleClock = showIdleClock && Boolean(idleClockSettings) && !preview && !notice && !quotaAlert;
  useLayoutEffect(() => {
    const bar = barRef.current;
    const summary = bar?.querySelector<HTMLElement>(".island__summary");
    if (!centersIdleClock || !bar || !summary) return;
    // Reserve equal room for the two sides, including custom icon arrangements.
    const align = () => {
      const bounds = bar.getBoundingClientRect();
      if (!bounds.width) return;
      const content = summary.getBoundingClientRect();
      const inset = (bounds.left + bounds.width / 2 - content.left - content.width / 2) * 2 * bar.offsetWidth / bounds.width;
      summary.style.setProperty("--idle-clock-inset-left", `${Math.max(0, inset)}px`);
      summary.style.setProperty("--idle-clock-inset-right", `${Math.max(0, -inset)}px`);
    };
    const resize = new ResizeObserver(align);
    resize.observe(bar);
    resize.observe(summary);
    const children = new MutationObserver(align);
    children.observe(bar, { childList: true });
    align();
    return () => {
      resize.disconnect();
      children.disconnect();
      summary.style.removeProperty("--idle-clock-inset-left");
      summary.style.removeProperty("--idle-clock-inset-right");
    };
  }, [centersIdleClock, collapsedLayout]);
  const { didDragRef, prepareWindowDrag, handleWindowDragMove, cancelWindowDrag } =
    useWindowDragGesture(isTucked || positionLocked, onWindowDragStart);
  const isMusicPlaying = mediaState.playbackStatus === "playing";
  const pulseClassName = [
    "island__pulse",
    `island__pulse--agent-${agentVisualState}`,
  ].join(" ");
  const shownAgent = collapsedItem === "agent" ? agentSession : null;
  const openTarget = notice?.page ?? collapsedOpenPage(collapsedItem, Boolean(shownAgent), page);

  // The text and the status icons, placed in the order Settings → Appearance arranged.
  const slots: Record<CollapsedSlot, ReactNode> = {
    text: (
        <button
          className="island__open-button"
          type="button"
          aria-label={preview
            ? t.messages.openPreview(messagePreviewText(preview, t.messages), t.messages.sourceLabels[preview.source])
            : t.messages.expand(notice?.text ?? collapsedLabel)}
          aria-expanded={preview ? undefined : isExpanded}
          aria-controls={preview ? undefined : "island-panel"}
          onPointerDown={prepareWindowDrag}
          onPointerMove={handleWindowDragMove}
          onPointerUp={cancelWindowDrag}
          onPointerCancel={cancelWindowDrag}
          onClick={(event) => {
            if (event.detail === 0 || !didDragRef.current) {
              if (preview) {
                const source = preview.source;
                if (source === "qqMail" && qqMail.preview) {
                  onOpenMessages("qqMail");
                  void qqMail.readMail(qqMail.preview, qqMail.previewAccount);
                  return;
                }
                const opening = source === "qq"
                  ? qqNotifications.openQQ(preview.title)
                  : wechatReminders.openWeChat(preview.wechatMessageId);
                void opening.then((opened) => {
                  if (opened === false) onOpenMessages(source);
                });
              } else {
                onOpenPage(openTarget);
              }
            }
          }}
        >
          <span className={pulseClassName} />
          {collapsedCover && <img className="collapsed-cover" src={collapsedCover} alt="" draggable={false} />}
          <CollapsedMessageContent preview={preview} enabled={!isExpanded && !isTucked}>
            {notice ? <span className="island__todo-count">{notice.text}</span> : quotaAlert ? (
              <QuotaAlertPopup alert={quotaAlert} />
            ) : showIdleClock && idleClockSettings ? (
              <IdleClock settings={idleClockSettings} active={!isExpanded && !isTucked && !preview} />
            ) : <>
            {showCollapsedText && showTitle && (
              <span className="island__brand">fly-island</span>
            )}
            {showCollapsedText && shownAgent && (
              <span className="island__agent-session" key={`${shownAgent.label}:${shownAgent.title}`}>
                {showTitle && <span className="island__agent-session-separator">·</span>}
                {shownAgent.provider ? (
                  <AgentProviderIcon provider={shownAgent.provider} size={16} />
                ) : (
                  <Bot className="island__agent-session-bot" size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
                )}
                <span className="island__agent-session-title">{shownAgent.title}</span>
              </span>
            )}
            {showCollapsedText && collapsedItem === "lyrics" && (
              <CollapsedLyric mediaState={mediaState} lyricsSettings={lyricsSettings} active={!isExpanded} />
            )}
            {showCollapsedText && collapsedItem === "balance" && balanceText && (
              <span className={`island__balance${balanceLow ? " island__balance--low" : ""}`} title={balanceText}>
                {showTitle ? "· " : ""}{balanceText}
              </span>
            )}
            {showCollapsedText && collapsedItem === "todo" && collapsedTaskTitle && (
              <span className={todoTimer ? "island__active-task island__active-task--timed" : "island__active-task"} key={collapsedTaskTitle}>
                {showTitle ? "· " : ""}
                {todoTimer ? <>
                  <span className="island__active-task-title">{collapsedTaskTitle}</span>
                  <span className="island__timer-pill">
                    {todoTimer.notified ? t.todo.timeUp : <TodoCountdown endsAt={todoTimer.endsAt} />}
                  </span>
                </> : collapsedTaskTitle}
              </span>
            )}
            {showCollapsedText && collapsedItem === "todo" && !collapsedTaskTitle && collapsedTodoCount !== null && (
              <span className="island__todo-count">
                {showTitle ? "· " : ""}
                {t.island.pendingTodos(collapsedTodoCount)}
              </span>
            )}
            </>}
          </CollapsedMessageContent>
        </button>
    ),
    mail: qqMail.preview !== null && (
      <button className="island-message-button island-message-button--compact qq-mail-badge" type="button" aria-label={t.messages.newMailLabel} onClick={() => onOpenMessages("qqMail")}>
        <MessageSourceIcon source="qqMail" size={16} />
        <span className="island-message-button__dot" aria-hidden="true" />
      </button>
      ),
    shelf: shelfCount !== null && shelfCount > 0 && (
      <button className="island-shelf-count" type="button" aria-label={t.island.shelfCount(shelfCount)} onClick={() => onOpenPage("shelf")}>
        <Inbox size={14} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
        <span>{shelfCount}</span>
      </button>
      ),
    music: showMusic && (
      <MusicWaveButton
        isAvailable={mediaState.available || mediaState.audioActive}
        isPlaying={isMusicPlaying}
        audioPeak={mediaState.audioPeak}
        label={t.island.openMusic}
        onClick={() => onOpenPage("music")}
      />
      ),
    agents: agentSessionCount === null ? (
      <button
        className="island__quiet-button"
        type="button"
        aria-label={t.island.collapseIsland}
        onClick={(event) => {
          event.stopPropagation();
          onTuck();
        }}
      />
      ) : agentSessionCount > 0 ? (
      <button
        className="island-agent-count"
        type="button"
        aria-label={t.agent.sessions.activeCount(agentSessionCount)}
        onClick={(event) => {
          event.stopPropagation();
          onOpenPage("agents");
        }}
      >
        {agentSessionCount}
      </button>
      ) : null,
  };

  return (
    <div
      ref={barRef}
      className={`island__collapsed${centersIdleClock ? " island__collapsed--idle-clock" : ""}`}
      aria-hidden={isExpanded}
      inert={isExpanded}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onOpenPage(openTarget);
        }
      }}
    >
      {collapsedLayout.map((slot) => <Fragment key={slot}>{slots[slot]}</Fragment>)}
    </div>
  );
}

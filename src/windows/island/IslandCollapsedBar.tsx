import { Fragment, type ReactNode } from "react";
import { Bot, Inbox } from "lucide-react";
import { AgentProviderIcon } from "../../features/agent-status/AgentProviderIcon";
import { BatteryAlertPopup } from "../../features/device-battery/BatteryAlertPopup";
import type { BatteryAlert } from "../../features/device-battery/lowBattery";
import type { QuotaAlert } from "../../features/agent-status/quotaAlerts";
import { QuotaAlertPopup } from "../../features/agent-status/QuotaAlertPopup";
import type { AgentSession } from "../../features/agent-status/session";
import type { AgentVisualState } from "../../features/agent-status/status";
import type { CollapsedItem, CollapsedSlot } from "../../features/appearance/types";
import type { MediaState } from "../../features/media/api";
import { CollapsedLyric } from "../../features/media/CollapsedLyric";
import type { LyricsSettings } from "../../features/media/lyrics/useLyrics";
import type { LyricLine } from "../../features/media/lyrics/lrc";
import { CollapsedMessageContent } from "../../features/messages/CollapsedMessageContent";
import { MessageSourceIcon } from "../../features/messages/MessageSourceIcon";
import { MessageNoticeReader } from "../../features/messages/MessageNoticeReader";
// After CollapsedMessageContent, matching the original stylesheet order.
import { MusicWaveButton } from "../../features/media/MusicWaveButton";
import { isOfficeSource, messagePreviewText, type MessagePreview, type MessageSource } from "../../features/messages/messagePreview";
import { openOfficeClient } from "../../features/messages/office-im/useOfficeIm";
import type { MailController } from "../../features/messages/mail/MailPanel";
import { MailOtpCode } from "../../features/messages/mail/MailOtpCode";
import type { QQNotificationsController } from "../../features/messages/qq-notifications/QQNotifications";
import type { WeChatRemindersController } from "../../features/messages/wechat/WeChatReminders";
import { CollapsedClock, CollapsedWeather, useClockWeather, useCurrentWeather } from "../../features/weather";
import { useTranslation } from "../../i18n";
import { TodoCountdown } from "../../features/todos/TodoCountdown";
import { useUpdatePending } from "../../features/updater/useUpdatePending";
import { isTodoTimerEndingSoon, type TodoTimer } from "../../features/todos/timer";
import { CollapsedTodoContent, type TodoRotationDisplay } from "./CollapsedTodoContent";
import { CollapsedPresence } from "./CollapsedPresence";
import type { IslandPage } from "./types";
import { useWindowDragGesture } from "./useWindowDragGesture";
import "./IslandCollapsedBar.css";

type IslandCollapsedBarProps = {
  qqMail: MailController;
  qqNotifications: QQNotificationsController;
  wechatReminders: WeChatRemindersController;
  preview: MessagePreview | null;
  /** The adaptive preview's reader (sender, then the whole text) in place of the bar, or null. */
  noticeReader?: { scrolls: boolean } | null;
  animateWidth: boolean;
  page: IslandPage;
  isExpanded: boolean;
  isTucked: boolean;
  positionLocked: boolean;
  showTitle: boolean;
  brandText: string | null;
  pendingText: string | null;
  showCollapsedText: boolean;
  collapsedLabel: string;
  collapsedTaskTitle: string | null;
  todoTimer?: TodoTimer | null;
  todoRotation?: TodoRotationDisplay | null;
  collapsedTodoCount: number | null;
  /** Which of the agent, the lyric line and a todo the text shows (Settings → Appearance), if any. */
  collapsedItem: CollapsedItem | null;
  collapsedLyrics?: LyricLine[] | null;
  /** Where the text and each status icon sit, left to right (Settings → Appearance). */
  collapsedLayout: readonly CollapsedSlot[];
  collapsedOrder?: readonly CollapsedSlot[];
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
  batteryAlert?: BatteryAlert | null;
  /** A todo round reaching its reminder before the end; it takes the place of the text while shown. */
  agentVisualState: AgentVisualState;
  onOpenPage: (page: IslandPage) => void;
  onOpenMessages: (source: MessageSource) => void;
  /** Quick translation line; it takes the place of the agent or todo text while shown. */
  onWindowDragStart: () => void;
  onTuck: () => void;
};

/** The collapsed island: agent pulse, todo or message summary, mail badge, music button and tuck handle. */
export function IslandCollapsedBar({
  qqMail,
  qqNotifications,
  wechatReminders,
  preview,
  noticeReader = null,
  animateWidth,
  page,
  isExpanded,
  isTucked,
  positionLocked,
  showTitle,
  brandText,
  pendingText,
  showCollapsedText,
  collapsedLabel,
  collapsedTaskTitle,
  todoTimer = null,
  todoRotation = null,
  collapsedTodoCount,
  collapsedItem,
  collapsedLyrics = null,
  collapsedLayout,
  collapsedOrder = collapsedLayout,
  collapsedCover,
  lyricsSettings,
  agentSession,
  agentSessionCount,
  mediaState,
  showMusic,
  shelfCount,
  quotaAlert = null,
  batteryAlert = null,
  agentVisualState,
  onOpenPage,
  onOpenMessages,
  onWindowDragStart,
  onTuck,
}: IslandCollapsedBarProps) {
  const t = useTranslation();
  const clockWeather = useClockWeather();
  const weatherOn = clockWeather.installed && clockWeather.settings.showWeather && collapsedLayout.includes("weather");
  const weather = useCurrentWeather(weatherOn, clockWeather.settings.location);
  // A pending update shows a red dot even collapsed, so it is not missed.
  const updatePending = useUpdatePending();
  const { didDragRef, prepareWindowDrag, handleWindowDragMove, cancelWindowDrag } =
    useWindowDragGesture(isTucked || positionLocked, onWindowDragStart);
  const isMusicPlaying = mediaState.playbackStatus === "playing";
  const pulseClassName = [
    "island__pulse",
    `island__pulse--agent-${agentVisualState}`,
  ].join(" ");
  const shownAgent = collapsedItem === "agent" ? agentSession : null;
  // Opens where the previewed message lives: the mail reader, or QQ / WeChat (else their page).
  const openPreview = (shown: MessagePreview) => {
    const source = shown.source;
    if (source === "plugin") { onOpenMessages(source); return; }
    if (isOfficeSource(source)) {
      void openOfficeClient(source).catch(() => onOpenMessages(source));
      return;
    }
    if (source === "qqMail" && qqMail.preview) {
      onOpenMessages("qqMail");
      void qqMail.readMail(qqMail.preview, qqMail.previewAccount);
      return;
    }
    const opening = source === "qq"
      ? qqNotifications.openQQ(shown.title)
      : wechatReminders.openWeChat(shown.wechatMessageId);
    void opening.then((opened) => {
      if (opened === false) onOpenMessages(source);
    });
  };

  const reader = Boolean(noticeReader && preview && !isExpanded && !isTucked);
  const contentKey = quotaAlert || batteryAlert ? "alert" : (showCollapsedText ? collapsedItem : null) ?? "idle";

  // The text and the status icons, placed in the order Settings → Appearance arranged.
  const slots: Record<CollapsedSlot, ReactNode> = {
    // The agent light opens the Agent page (or the message being previewed); the text reopens the last page.
    pulse: (
      <button
        className="island__agent-light"
        type="button"
        aria-label={preview ? t.messages.openPreview(messagePreviewText(preview, t.messages), t.messages.sourceLabels[preview.source]) : t.island.agentPage}
        onPointerDown={prepareWindowDrag}
        onPointerMove={handleWindowDragMove}
        onPointerUp={cancelWindowDrag}
        onPointerCancel={cancelWindowDrag}
        onClick={(event) => {
          if (event.detail !== 0 && didDragRef.current) return;
          event.stopPropagation();
          if (preview) openPreview(preview); else onOpenPage("agents");
        }}
      >
        <span className={pulseClassName} />
      </button>
    ),
    clock: clockWeather.installed && clockWeather.settings.showClock && <CollapsedClock active={!isExpanded && !isTucked} />,
    weather: weatherOn && weather && clockWeather.settings.location
      ? <CollapsedWeather location={clockWeather.settings.location} reading={weather} /> : null,
    text: (
      <div className="island__text-slot">
        <button
          className="island__open-button"
          type="button"
          aria-label={preview
            ? t.messages.openPreview(messagePreviewText(preview, t.messages), t.messages.sourceLabels[preview.source])
            : t.messages.expand(collapsedLabel)}
          aria-expanded={preview ? undefined : isExpanded}
          aria-controls={preview ? undefined : "island-panel"}
          onPointerDown={prepareWindowDrag}
          onPointerMove={handleWindowDragMove}
          onPointerUp={cancelWindowDrag}
          onPointerCancel={cancelWindowDrag}
          onClick={(event) => {
            if (event.detail === 0 || !didDragRef.current) {
              if (preview) {
                openPreview(preview);
              } else {
                onOpenPage(batteryAlert ? "plugin:device-battery" : page);
              }
            }
          }}
        >
          {updatePending && <span className="island-update-dot island-update-dot--inline" aria-hidden="true" />}
          {collapsedCover && <img className="collapsed-cover" src={collapsedCover} alt="" draggable={false} />}
          <CollapsedMessageContent preview={preview} enabled={!isExpanded && !isTucked} contentKey={contentKey}>
            {quotaAlert ? (
              <QuotaAlertPopup alert={quotaAlert} />
            ) : batteryAlert ? <BatteryAlertPopup alert={batteryAlert} /> : <>
            {showCollapsedText && brandText !== null && (
              <span className="island__brand">{brandText}</span>
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
              <CollapsedLyric mediaState={mediaState} lyricsSettings={lyricsSettings} lines={collapsedLyrics} active={!isExpanded} />
            )}
            {showCollapsedText && collapsedItem === "todo" && collapsedTaskTitle && (todoTimer && !todoRotation ? (
              <span className={`island__active-task island__active-task--timed${isTodoTimerEndingSoon(todoTimer) ? " island__active-task--ending" : ""}`} key={collapsedTaskTitle}>
                {showTitle ? "· " : ""}
                <>
                  <span className="island__active-task-title">{collapsedTaskTitle}</span>
                  <span className="island__timer-pill">
                    {todoTimer.notified ? t.todo.timeUp : <TodoCountdown endsAt={todoTimer.endsAt} warning={isTodoTimerEndingSoon(todoTimer)} />}
                  </span>
                </>
              </span>
            ) : <CollapsedTodoContent title={collapsedTaskTitle} prefix={showTitle ? "· " : ""} rotation={todoRotation} />)}
            {showCollapsedText && collapsedItem === "todo" && !collapsedTaskTitle && collapsedTodoCount !== null && (
              <span className="island__todo-count">
                {showTitle && pendingText === null ? "· " : ""}
                {pendingText ?? t.island.pendingTodos(collapsedTodoCount)}
              </span>
            )}
            </>}
          </CollapsedMessageContent>
        </button>
        {!isExpanded && !isTucked && preview?.source === "qqMail" && preview.otpCode && <MailOtpCode
          key={preview.otpCode} code={preview.otpCode} copied={qqMail.copiedOtp === preview.otpCode} onCopy={qqMail.copyOtp} />}
      </div>
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

  return <>
    <div
      className="island__collapsed"
      data-under-notice={reader || undefined}
      aria-hidden={isExpanded || reader}
      inert={isExpanded || reader}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onOpenPage(page);
        }
      }}
    >
      {collapsedOrder.map((slot) => slot === "text" ? <Fragment key={slot}>{slots.text}</Fragment>
        : <CollapsedPresence key={slot} className="island__status-slot" animate={animateWidth}>
          {collapsedLayout.includes(slot) && slots[slot]}
        </CollapsedPresence>)}
    </div>
    <CollapsedPresence className="island__collapsed island__collapsed--notice" animate={animateWidth}>
      {reader && preview && noticeReader && <MessageNoticeReader preview={preview} scrolls={noticeReader.scrolls} onOpen={() => openPreview(preview)}
        onRetry={qqMail.retryPreviewContent}
        drag={{ onPointerDown: prepareWindowDrag, onPointerMove: handleWindowDragMove, onPointerUp: cancelWindowDrag, onPointerCancel: cancelWindowDrag }} />}
    </CollapsedPresence>
  </>;
}

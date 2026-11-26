import { rightClickTucks } from "./tuckRules";
import { shoulderedShapeCss } from "../../features/appearance/cornerShape";
import { isGlass } from "../../features/appearance/settings";
import type { CSSProperties, ReactNode, TransitionEvent } from "react";
import type { AgentSession } from "../../features/agent-status/session";
import type { BatteryAlert } from "../../features/device-battery/lowBattery";
import type { QuotaAlert } from "../../features/agent-status/quotaAlerts";
import type { AgentVisualState } from "../../features/agent-status/status";
import type { CollapsedItem, CollapsedSlot, IslandCornerShape, IslandShape, Material, PageButtonStyle, PageDot, TuckStyle } from "../../features/appearance/types";
import type { MediaState } from "../../features/media/api";
import type { MessagePreview, MessageSource } from "../../features/messages/messagePreview";
import type { MailController } from "../../features/messages/mail/MailPanel";
import type { QQNotificationsController } from "../../features/messages/qq-notifications/QQNotifications";
import type { WeChatRemindersController } from "../../features/messages/wechat/WeChatReminders";
import { useTranslation } from "../../i18n";
import type { IslandFeatures } from "./features";
import { isPluginPage } from "./features";
import { IslandCollapsedBar } from "./IslandCollapsedBar";
import { IslandHeader } from "./IslandHeader";
import type { IslandMode, IslandPage, NativeGlassState } from "./types";
import { useGlassPointer } from "./useGlassPointer";
import { useIslandPreparing } from "./useIslandPreparing";
import { useMotionLayer } from "./useMotionLayer";
import { usePageFadeIn } from "./usePageFadeIn";
import type { LyricsSettings } from "../../features/media/lyrics/useLyrics";
import type { TodoTimer } from "../../features/todos/timer";
import type { TodoRotationDisplay } from "./CollapsedTodoContent";
import type { NoticeSize } from "./noticeLayout";
import "./IslandShell.css";
import "./IslandPageText.css";
import "./IslandGlass.css";
import "./IslandTuckStyle.css";
import { useTuckMorph } from "./useTuckMorph";
import { usePendingOfficeSource } from "../../features/messages/office-im/useOfficeIm";

type IslandShellProps = {
  qqMail: MailController;
  qqNotifications: QQNotificationsController;
  wechatReminders: WeChatRemindersController;
  onOpenMessages: (source: MessageSource) => void;
  /** The newest message preview to show on the collapsed island (useIslandNotices), or null. */
  preview: MessagePreview | null;
  /** The size the adaptive preview grew the island to (useMessageNotice), or null. */
  notice: NoticeSize | null;
  mode: IslandMode;
  page: IslandPage;
  /** The open page's height (unscaled); a change resizes the shape around the panel. */
  expandedHeight: number;
  material: Material;
  nativeGlassState: NativeGlassState;
  isTucked: boolean;
  /** How the island looks while tucked: its own rim (edge), a short line, or nothing. */
  tuckStyle: TuckStyle;
  topEdgeShoulders: boolean;
  positionLocked: boolean;
  /** Moved away from its default place by a drag or the margin; a capsule floats without that. */
  isDetached: boolean;
  islandShape?: IslandShape;
  islandCornerShape?: IslandCornerShape;
  showTitle: boolean;
  /** The collapsed bar's title text (idleText.ts), or null for none. */
  /** The collapsed width changed while collapsed: the shape glides to it (IslandShell.css). */
  widthMoving?: boolean;
  brandText: string | null;
  /** Replaces the "N todos left" line, or null to show the count. */
  pendingText: string | null;
  showCollapsedText: boolean;
  collapsedTaskTitle: string | null;
  todoTimer?: TodoTimer | null;
  todoRotation?: TodoRotationDisplay | null;
  collapsedTodoCount: number | null;
  /** Which of the agent, the lyric line and a todo the collapsed island's text shows, if any. */
  collapsedItem: CollapsedItem | null;
  collapsedLayout: readonly CollapsedSlot[];
  collapsedOrder?: readonly CollapsedSlot[];
  /** The playing song's cover for the collapsed island, or null when it is not shown. */
  collapsedCover: string | null;
  /** Where the collapsed island's lyric line comes from. */
  lyricsSettings: LyricsSettings & { lyricsOffsetMs: number };
  /** Order of the header's page dots, and saving a new one after a drag. */
  pageOrder: PageDot[];
  pageButtonStyle: PageButtonStyle;
  onPageOrderChange: (order: PageDot[]) => void;
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
  /** Claude's or Codex's usage reaching the alert level, or resetting. */
  quotaAlert?: QuotaAlert | null;
  batteryAlert?: BatteryAlert | null;
  onOpenPage: (page: IslandPage) => void;
  onWindowDragStart: () => void;
  onCollapse: () => void;
  onResetPosition: () => void;
  minimizesToTray: boolean;
  onMinimize: () => void;
  /** Null while translation is switched off, which hides its button. */
  onOpenTranslator: (() => void) | null;
  /** One line from the selection shortcut, shown on the collapsed island, or null. */
  onOpenSettings: () => void;
  onTuck: () => void;
  /** Right click on the collapsed island: tucks it to the edge like the minus button (tuckRules.ts). */
  onContextTuck: () => void;
  onReveal: () => void;
  clickTuckedToOpen?: boolean;
  onClickTucked?: () => void;
  onPageChange: (page: IslandPage) => void;
  /** Buttons of the open page, first among the window actions. */
  pageActions?: ReactNode;
  children: ReactNode;
};

function updateShoulderMotion(event: TransitionEvent<HTMLDivElement>) {
  const surface = event.currentTarget;
  if (event.target !== surface || event.propertyName !== "--island-shoulder-length") return;
  const moving = event.type === "transitionrun" || surface.getAnimations().some((animation) =>
    animation instanceof CSSTransition && animation.transitionProperty === event.propertyName && animation.playState === "running",
  );
  surface.toggleAttribute("data-shoulder-moving", moving);
}

export function IslandShell({
  qqMail,
  qqNotifications,
  wechatReminders,
  onOpenMessages,
  preview,
  notice,
  mode,
  page,
  expandedHeight,
  material,
  nativeGlassState,
  isTucked,
  tuckStyle,
  topEdgeShoulders,
  positionLocked,
  isDetached,
  islandShape = "notch",
  islandCornerShape = "squircle",
  showTitle,
  widthMoving = false,
  brandText,
  pendingText,
  showCollapsedText,
  collapsedTaskTitle,
  todoTimer = null,
  todoRotation = null,
  collapsedTodoCount,
  collapsedItem,
  collapsedLayout,
  collapsedOrder,
  collapsedCover,
  lyricsSettings,
  pageOrder,
  pageButtonStyle,
  onPageOrderChange,
  agentSession,
  activeAgentSessionCount,
  mediaState,
  agentVisualState,
  agentStatusLabel,
  features,
  shelfCount,
  quotaAlert = null,
  batteryAlert = null,
  onOpenPage,
  onWindowDragStart,
  onCollapse,
  onResetPosition,
  minimizesToTray,
  onMinimize,
  onOpenTranslator,
  onOpenSettings,
  onTuck,
  onContextTuck,
  onReveal,
  clickTuckedToOpen = false,
  onClickTucked,
  onPageChange,
  pageActions,
  children,
}: IslandShellProps) {
  const t = useTranslation();
  const isExpanded = mode === "expanded";
  const glass = isGlass(material);
  const isLiquidGlass = material === "liquidGlass";
  const { handleGlassPointerMove, resetGlassPointer } = useGlassPointer(isLiquidGlass);
  const isPreparing = useIslandPreparing(isExpanded);
  const tuckMorphClass = useTuckMorph(isTucked, tuckStyle);
  const contentRef = usePageFadeIn<HTMLDivElement>(page, mode);
  const panelRef = useMotionLayer<HTMLDivElement>(mode, page, expandedHeight);
  const qqNotificationCount = qqNotifications.snapshot.items.length;
  const wechatPending = wechatReminders.snapshot.pending;
  const officePending = usePendingOfficeSource();
  const className = [
    "island",
    `island--${mode}`,
    `island--${isPluginPage(page) ? "plugin" : page}`,
    `island--material-${material}`,
    isPreparing && !isExpanded ? "island--preparing" : "",
    isDetached || islandShape === "capsule" ? "island--detached" : "island--docked",
    islandShape === "capsule" ? "island--capsule" : "",
    isTucked ? "island--tucked" : "",
    tuckMorphClass,
    topEdgeShoulders && islandShape !== "capsule" ? "island--shoulders" : "",
    glass ? `island--glass-${nativeGlassState}` : "",
    showTitle ? "" : "island--title-hidden",
    notice && !isExpanded ? "island--notice" : "",
    widthMoving && !isExpanded ? "island--width-motion" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const collapsedLabel = showCollapsedText
    ? todoTimer
      ? t.todo.actionOnTask(todoTimer.notified ? t.todo.timeUp : t.todo.countdown, collapsedTaskTitle ?? "")
      : agentSession
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
        if (isTucked && clickTuckedToOpen) {
          onClickTucked?.();
          return;
        }
        if (!isExpanded && event.target === event.currentTarget) {
          onOpenPage(page);
        }
      }}
      onContextMenu={() => {
        // The native menu is already suppressed (main.tsx); here it tucks the collapsed island.
        if (rightClickTucks(mode, isTucked)) onContextTuck();
      }}
      onPointerMove={handleGlassPointerMove}
      onPointerLeave={resetGlassPointer}
      onMouseEnter={() => {
        if (isTucked) {
          onReveal();
        }
      }}
    >
      {glass && <span className="island__glass-shadow" aria-hidden="true" />}
      <div
        className="island__surface"
        onTransitionRun={glass ? updateShoulderMotion : undefined}
        onTransitionCancel={glass ? updateShoulderMotion : undefined}
        onTransitionEnd={glass ? updateShoulderMotion : undefined}
      >
        <div
          className={glass ? "island__material island__material--glass" : "island__material"}
          style={{ "--island-shouldered-shape": shoulderedShapeCss(islandCornerShape) } as CSSProperties}
          aria-hidden="true"
        >
          {/* Outside .island__glass, whose top fades out when attached (IslandTopEdge.css). */}
          {glass && <div className="island__glass-backdrop"><canvas /></div>}
        </div>
        <div className="island__surface-contents">
          {glass && (
            <div className="island__glass" aria-hidden="true">
              {isLiquidGlass && <span className="island__glass-refraction" />}
              {isLiquidGlass && <span className="island__glass-highlight" />}
            </div>
          )}
          <IslandCollapsedBar
            qqMail={qqMail}
            qqNotifications={qqNotifications}
            wechatReminders={wechatReminders}
            preview={preview}
            noticeReader={notice?.reader ? { scrolls: notice.scrolls } : null}
            animateWidth={widthMoving}
            page={page}
            isExpanded={isExpanded}
            isTucked={isTucked}
            positionLocked={positionLocked}
            showTitle={showTitle}
            brandText={brandText}
            pendingText={pendingText}
            showCollapsedText={showCollapsedText}
            collapsedLabel={collapsedLabel}
            collapsedTaskTitle={collapsedTaskTitle}
            todoTimer={todoTimer}
            todoRotation={todoRotation}
            collapsedTodoCount={collapsedTodoCount}
            collapsedItem={collapsedItem}
            collapsedLayout={collapsedLayout}
            collapsedOrder={collapsedOrder}
            collapsedCover={collapsedCover}
            lyricsSettings={lyricsSettings}
            agentSession={agentSession}
            agentSessionCount={features.agents ? activeAgentSessionCount : null}
            mediaState={mediaState}
            showMusic={features.music}
            shelfCount={shelfCount}
            quotaAlert={quotaAlert}
            batteryAlert={batteryAlert}
            agentVisualState={agentVisualState}
            onOpenPage={onOpenPage}
            onOpenMessages={onOpenMessages}
            onWindowDragStart={onWindowDragStart}
            onTuck={onTuck}
          />

          <div
            ref={panelRef}
            id="island-panel"
            className="island__expanded"
            aria-hidden={!isExpanded}
            inert={!isExpanded}
          >
            <IslandHeader
              isExpanded={isExpanded && !isTucked}
              page={page}
              features={features}
              pageOrder={pageOrder}
              pageButtonStyle={pageButtonStyle}
              onPageOrderChange={onPageOrderChange}
              showTitle={showTitle}
              isDetached={isDetached}
              agentVisualState={agentVisualState}
              agentStatusLabel={agentStatusLabel}
              qqNotificationCount={qqNotificationCount}
              wechatPending={wechatPending}
              officePending={officePending}
              onPageChange={onPageChange}
              onCollapse={onCollapse}
              onOpenSettings={onOpenSettings}
              onOpenMessages={onOpenMessages}
              onOpenTranslator={onOpenTranslator}
              onResetPosition={onResetPosition}
              minimizesToTray={minimizesToTray}
              onMinimize={onMinimize}
              pageActions={pageActions}
            />
            <div ref={contentRef} className="island__content">{children}</div>
          </div>
        </div>
      </div>
    </section>
  );
}

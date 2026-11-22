import { useCallback, type ReactNode } from "react";
import { usePointerReorder } from "../../components/reorder/usePointerReorder";
import { PageButtonContent } from "../../features/appearance/PageButtonContent";
import { PAGE_ICONS } from "../../features/appearance/pageIcons";
import { usePageButtonLabels } from "../../features/appearance/usePageButtonLabels";
import type { PageButtonStyle, PageDot } from "../../features/appearance/types";
import { Bell, Bot, CircleDot, Minus, RotateCcw, Settings } from "lucide-react";
import type { AgentVisualState } from "../../features/agent-status/status";
import { useCommunityInvite } from "../../features/updater/useCommunityInvite";
import { useUpdatePending } from "../../features/updater/useUpdatePending";
import type { MessageSource, OfficeSource } from "../../features/messages/messagePreview";
import { PLUGIN_PANEL_ICONS } from "../../features/plugins/panel";
import { useLocale, useTranslation } from "../../i18n";
import { isPageEnabled, type IslandFeatures } from "./features";
import type { IslandPage } from "./types";
import "./IslandHeader.css";
import "./IslandUpdateDot.css";

type IslandHeaderProps = {
  isExpanded: boolean;
  page: IslandPage;
  features: IslandFeatures;
  /** Order of the page dots; a drag saves a new one. */
  pageOrder: PageDot[];
  pageButtonStyle: PageButtonStyle;
  onPageOrderChange: (order: PageDot[]) => void;
  showTitle: boolean;
  isDetached: boolean;
  agentVisualState: AgentVisualState;
  agentStatusLabel: string;
  qqNotificationCount: number;
  wechatPending: boolean;
  /** The first switched-on office client (DingTalk, Feishu, WeCom) with a new reminder. */
  officePending: OfficeSource | null;
  onPageChange: (page: IslandPage) => void;
  onCollapse: () => void;
  onOpenSettings: () => void;
  onOpenMessages: (source: MessageSource) => void;
  /** Opens translation (its island page or its own window); null when translation is off. */
  onOpenTranslator: (() => void) | null;
  onResetPosition: () => void;
  /** False when minimizing tucks the island to the top edge instead. */
  minimizesToTray: boolean;
  onMinimize: () => void;
  /** Buttons of the open page, first among the window actions. */
  pageActions?: ReactNode;
};

function IslandHeaderAgent({ style, enabled, active, state, statusLabel, onOpen }: {
  style: PageButtonStyle;
  enabled: boolean;
  active: boolean;
  state: AgentVisualState;
  statusLabel: string;
  onOpen: () => void;
}) {
  const t = useTranslation();
  const iconClass = `island__agent-status-icon island__agent-status-icon--${state}`;
  const capsule = style === "capsule";
  const labeled = style === "iconLabel";

  if (!enabled) {
    return capsule
      ? <span className={`island__agent-capsule ${iconClass}`} role="img" aria-label={statusLabel} />
      : <CircleDot className={iconClass} size={16} strokeWidth={1.5} absoluteStrokeWidth aria-label={statusLabel} />;
  }

  return (
    <button
      className={[
        "island__agent-button",
        capsule && "island__agent-button--capsule",
        labeled && "dot-button dot-button--icon dot-button--icon-label",
        active && (labeled ? "dot-button--active" : "island__agent-button--active"),
      ].filter(Boolean).join(" ")}
      type="button"
      data-tip={t.island.agentPage}
      data-page-button={labeled ? "agents" : undefined}
      data-page-button-current={labeled && active ? "" : undefined}
      aria-label={`${statusLabel} · ${t.agent.sessions.open}`}
      aria-pressed={active}
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
    >
      {capsule
        ? <span className={`island__agent-capsule ${iconClass}`} aria-hidden="true" />
        : <PageButtonContent
            icon={<Bot className={iconClass} size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />}
            label={labeled ? t.island.agentPage : undefined}
          />}
    </button>
  );
}

/**
 * Header of the expanded island: agent status, page dots (translation among them), collapse
 * target and window actions.
 */
export function IslandHeader({
  page,
  features,
  pageOrder,
  pageButtonStyle,
  onPageOrderChange,
  showTitle,
  isDetached,
  agentVisualState,
  agentStatusLabel,
  qqNotificationCount,
  wechatPending,
  officePending,
  onPageChange,
  onCollapse,
  onOpenSettings,
  onOpenMessages,
  onOpenTranslator,
  onResetPosition,
  minimizesToTray,
  onMinimize,
  pageActions,
}: IslandHeaderProps) {
  const t = useTranslation();
  const { locale } = useLocale();
  // A red dot leads to the community group in About until it has been opened.
  const community = useCommunityInvite();
  const communityPending = community.pending;
  const updatePending = useUpdatePending();
  const showIcons = pageButtonStyle !== "capsule";
  const labeled = pageButtonStyle === "iconLabel";
  const dotStyle = labeled ? "dot-button--icon dot-button--icon-label" : showIcons ? "dot-button--icon" : "dot-button--capsule";
  const messageBadgeLabel = t.messages.badge(qqNotificationCount, wechatPending, officePending && t.messages.sourceLabels[officePending]);
  // The page dots, in the order the user dragged them into; a dot can be dragged sideways.
  // Translation has one while it is on, also when it opens in its own window.
  const dots = pageOrder.filter((dot) => (dot === "translation" ? onOpenTranslator !== null : features[dot]));
  const dotLabels = {
    todo: t.island.todoList,
    music: t.island.music,
    clipboard: t.island.clipboardHistory,
    shelf: t.island.shelf,
    translation: t.translator.title,
    battery: t.island.pageNames.battery,
  };
  const reorderDots = useCallback(
    (next: PageDot[]) => onPageOrderChange([...next, ...pageOrder.filter((dot) => !next.includes(dot))]),
    [onPageOrderChange, pageOrder],
  );
  const { containerRef: dotsRef, itemProps: dotProps, draggingId: draggingDot, wasDragged: wasDotDragged } =
    usePointerReorder(dots, reorderDots, "x", labeled ? "midpoint" : "edge");
  const labelRowProps = usePageButtonLabels(dotsRef, labeled, page);

  const agent = (
    <IslandHeaderAgent
      style={pageButtonStyle}
      enabled={features.agents}
      active={page === "agents"}
      state={agentVisualState}
      statusLabel={agentStatusLabel}
      onOpen={() => onPageChange("agents")}
    />
  );
  const agentInRow = labeled && features.agents;
  const title = (
    <div className="island__title" data-page-button-fixed={labeled ? "" : undefined}>
      {!agentInRow && agent}
      {showTitle && <span>fly-island</span>}
    </div>
  );
  const collapseTarget = (
    <button
      className="island__collapse-target"
      type="button"
      aria-label={t.island.collapseIsland}
      data-window-drag="false"
      onClick={onCollapse}
    />
  );

  return (
    <header className={labeled ? "island__header island__header--icon-label" : "island__header"}>
      {!labeled && title}
      <div
        className={labeled ? "editor-dots editor-dots--icon-label" : "editor-dots"}
        aria-label={t.island.editor}
        {...labelRowProps}
        ref={(node) => { dotsRef.current = node; }}
      >
        {agentInRow && agent}
        {labeled && (!agentInRow || showTitle) && title}
        {dots.map((dot) => {
          const Icon = PAGE_ICONS[dot];
          return (
            <button
              key={dot}
              className={[
                "dot-button",
                `dot-button--${dot}`,
                dotStyle,
                page === dot ? "dot-button--active" : "",
                draggingDot === dot ? "dot-button--dragging" : "",
              ].filter(Boolean).join(" ")}
              type="button"
              aria-label={dot === "todo" && updatePending ? t.island.todoListWithUpdate : dotLabels[dot]}
              aria-current={page === dot ? "page" : undefined}
              data-tip={t.island.pageNames[dot]}
              data-page-button={labeled ? dot : undefined}
              data-page-button-current={labeled && page === dot ? "" : undefined}
              {...dotProps(dot)}
              onClick={(event) => {
                event.stopPropagation();
                // The click that ends dragging a dot to a new place does not open its page.
                if (wasDotDragged()) return;
                if (dot === "translation") onOpenTranslator?.();
                else onPageChange(dot);
              }}
            >
              {showIcons && <PageButtonContent
                icon={<Icon size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />}
                label={labeled ? t.island.pageNames[dot] : undefined}
              />}
              {dot === "todo" && updatePending && <span className="island-update-dot" aria-hidden="true" />}
            </button>
          );
        })}
        {/* A plugin's page sits after the built-in ones: it is not reordered by dragging,
            since the plugin list itself is the order. */}
        {(features.pluginPages ?? []).map((info) => {
          const Icon = PLUGIN_PANEL_ICONS[info.icon];
          const label = info.name[locale];
          return (
            <button
              key={info.page}
              className={[
                "dot-button",
                "dot-button--plugin",
                showIcons ? "dot-button--icon" : "dot-button--capsule",
                page === info.page ? "dot-button--active" : "",
              ].filter(Boolean).join(" ")}
              type="button"
              aria-label={label}
              aria-current={page === info.page ? "page" : undefined}
              data-tip={label}
              onClick={(event) => {
                event.stopPropagation();
                onPageChange(info.page);
              }}
            >
              {showIcons && <Icon size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />}
              {info.attention && <span className="island-plugin-button__dot" aria-hidden="true" />}
            </button>
          );
        })}
        {/* Messages sit with the page buttons, after the draggable ones; they are not reordered. */}
        {isPageEnabled("qq", features) && (
          <button
            className={[
              "dot-button",
              "dot-button--messages",
              dotStyle,
              page === "qq" ? "dot-button--active" : "",
            ].filter(Boolean).join(" ")}
            type="button"
            aria-label={t.messages.label(messageBadgeLabel)}
            aria-pressed={page === "qq"}
            data-tip={t.messages.title}
            data-page-button={labeled ? "qq" : undefined}
            data-page-button-current={labeled && page === "qq" ? "" : undefined}
            onClick={(event) => {
              event.stopPropagation();
              onOpenMessages(wechatPending ? "wechat" : officePending ?? "qq");
            }}
          >
            {showIcons && <PageButtonContent
              icon={<Bell size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />}
              label={labeled ? t.messages.title : undefined}
            />}
            {(qqNotificationCount > 0 || wechatPending || officePending) && <span className="island-message-button__dot" aria-hidden="true" />}
          </button>
        )}
        {labeled && collapseTarget}
      </div>
      {!labeled && collapseTarget}

      <div className="window-actions">
        {pageActions}
        <button
          className={`icon-button island-settings-button${page === "settings" ? " island-settings-button--active" : ""}`}
          type="button"
          aria-label={communityPending ? t.island.settingsWithNews : t.settings.title}
          aria-pressed={page === "settings"}
          onClick={(event) => {
            event.stopPropagation();
            // The community dot is a one-time hint: the first click on it clears it for good.
            if (communityPending) community.markSeen();
            onOpenSettings();
          }}
        >
          <Settings size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
          {communityPending && <span className="island-settings-button__dot" aria-hidden="true" />}
        </button>
        {/* Only once the island has been moved: at its default place the button would do nothing. */}
        {isDetached && (
          <button
            className="icon-button island-reset-button island-reset-button--available"
            type="button"
            aria-label={t.island.resetPositionLabel}
            onClick={(event) => {
              event.stopPropagation();
              onResetPosition();
            }}
          >
            <RotateCcw size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
          </button>
        )}
        <button
          className="icon-button"
          type="button"
          aria-label={minimizesToTray ? t.island.minimizeToTray : t.island.tuckToTop}
          onClick={(event) => {
            event.stopPropagation();
            onMinimize();
          }}
        >
          <Minus size={16} strokeWidth={1.5} absoluteStrokeWidth />
        </button>
      </div>
    </header>
  );
}

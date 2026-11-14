import type { IslandSettings, CollapsedItem } from "../../features/appearance/types";
import type { AgentVisualState } from "../../features/agent-status/status";
import type { TodoTimer } from "../../features/todos/timer";

type Activity = {
  agentVisualState: AgentVisualState;
  collapsedItem: CollapsedItem | null;
  songPlaying: boolean;
  activeTodoId: string | null;
  timer: TodoTimer | null;
};
type KeepVisibleSettings = Pick<IslandSettings, "keepVisibleWhileAgentRunning" | "keepVisibleWhileLyrics"
  | "keepVisibleWhileTodoRunning" | "showCollapsedText" | "todoEnabled">;

/** Only holds idle tucking: navigation and game mode retain their own behavior. */
export function keepIslandVisible(settings: KeepVisibleSettings, activity: Activity, now: number): boolean {
  return (settings.keepVisibleWhileAgentRunning && activity.agentVisualState === "running")
    || (settings.keepVisibleWhileLyrics && settings.showCollapsedText
      && activity.collapsedItem === "lyrics" && activity.songPlaying)
    || (settings.keepVisibleWhileTodoRunning && settings.todoEnabled
      && (Boolean(activity.activeTodoId) || Boolean(activity.timer && activity.timer.endsAt > now)));
}

/**
 * When `keepIslandVisible` can next change by itself, with nothing else re-rendering: a
 * todo timer that holds the island stops holding it once it runs out. Null when only
 * outside changes (agent, song, settings) can change the answer.
 */
export function keepVisibleChangesAt(settings: KeepVisibleSettings, activity: Activity, now: number): number | null {
  const timer = activity.timer;
  if (!settings.keepVisibleWhileTodoRunning || !settings.todoEnabled || activity.activeTodoId || !timer) return null;
  return timer.endsAt > now ? timer.endsAt : null;
}

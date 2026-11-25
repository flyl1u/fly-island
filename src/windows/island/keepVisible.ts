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
  return keepVisibleReason(settings, activity, now) !== null;
}

export function keepVisibleReason(settings: KeepVisibleSettings, activity: Activity, now: number) {
  if (settings.keepVisibleWhileAgentRunning && activity.agentVisualState === "running") return "keep_visible_agent";
  if (settings.keepVisibleWhileLyrics && settings.showCollapsedText && activity.collapsedItem === "lyrics" && activity.songPlaying) return "keep_visible_lyrics";
  if (settings.keepVisibleWhileTodoRunning && settings.todoEnabled && (activity.activeTodoId || (activity.timer && activity.timer.endsAt > now))) {
    return "keep_visible_todo";
  }
  return null;
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

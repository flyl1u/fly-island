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

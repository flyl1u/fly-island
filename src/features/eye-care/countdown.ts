import { countdownSeconds, formatCountdown } from "../../utils/countdown.ts";

export const POSTPONEMENT_MINUTES = [10, 15, 20, 25, 30] as const;

export function breakCountdown(deadline: number, now: number): string {
  return formatCountdown(countdownSeconds(deadline, now), true);
}

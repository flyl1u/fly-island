import { useElapsed } from "../../lib/useElapsed";
import { formatCountdown } from "../../utils/countdown";

/** A running total since `from`, laid out like `Countdown`: a break counting its rest up. */
export function CountUp({ from, padMinutes = false }: { from: number; padMinutes?: boolean }) {
  const seconds = useElapsed(from);
  return <>{formatCountdown(seconds, padMinutes)}</>;
}

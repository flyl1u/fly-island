import { useCountdown } from "../../lib/useCountdown";
import { formatCountdown } from "../../utils/countdown";

export function Countdown({ deadline, padMinutes = false }: { deadline: number; padMinutes?: boolean }) {
  const seconds = useCountdown(deadline);
  return <>{formatCountdown(seconds, padMinutes)}</>;
}

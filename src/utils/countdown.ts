export function countdownSeconds(deadline: number | null, now: number): number {
  return deadline === null ? 0 : Math.max(0, Math.ceil((deadline - now) / 1000));
}

/** Wake when the displayed second changes, rather than one second after mounting. */
export function nextCountdownDelay(deadline: number | null, now: number): number | null {
  if (deadline === null || deadline <= now) return null;
  return Math.ceil((deadline - now) % 1000) || 1000;
}

export function formatCountdown(seconds: number, padMinutes = false): string {
  const minutes = Math.floor(seconds / 60);
  const part = (value: number) => String(value).padStart(2, "0");
  return minutes < 60 ? `${padMinutes ? part(minutes) : minutes}:${part(seconds % 60)}`
    : `${Math.floor(minutes / 60)}:${part(minutes % 60)}:${part(seconds % 60)}`;
}

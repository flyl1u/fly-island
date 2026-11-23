export const POSTPONEMENT_MINUTES = [10, 15, 20, 25, 30] as const;

export function breakCountdown(deadline: number, now: number): string {
  const seconds = Math.max(0, Math.ceil((deadline - now) / 1000));
  const minutes = Math.floor(seconds / 60);
  const part = (value: number) => String(value).padStart(2, "0");
  return minutes < 60 ? `${part(minutes)}:${part(seconds % 60)}`
    : `${Math.floor(minutes / 60)}:${part(minutes % 60)}:${part(seconds % 60)}`;
}

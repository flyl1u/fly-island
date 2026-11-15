export type QQPreviewTiming = {
  burstStartedAt: number;
  lastArrivalAt: number;
};

export function nextQQPreview(
  previous: QQPreviewTiming | null,
  now: number,
  seconds = 5,
): { timing: QQPreviewTiming; expiresAt: number | null } {
  const duration = seconds * 1_000;
  const burstStartedAt =
    previous && now - previous.lastArrivalAt <= duration
      ? previous.burstStartedAt
      : now;
  const deadline = burstStartedAt + 2 * duration;
  return {
    timing: { burstStartedAt, lastArrivalAt: now },
    expiresAt: now < deadline ? Math.min(now + duration, deadline) : null,
  };
}

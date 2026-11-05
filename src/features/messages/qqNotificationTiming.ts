export type QQPreviewTiming = {
  burstStartedAt: number;
  lastArrivalAt: number;
};

export function nextQQPreview(
  previous: QQPreviewTiming | null,
  now: number,
): { timing: QQPreviewTiming; expiresAt: number | null } {
  const burstStartedAt =
    previous && now - previous.lastArrivalAt <= 5_000
      ? previous.burstStartedAt
      : now;
  const deadline = burstStartedAt + 10_000;
  return {
    timing: { burstStartedAt, lastArrivalAt: now },
    expiresAt: now < deadline ? Math.min(now + 5_000, deadline) : null,
  };
}

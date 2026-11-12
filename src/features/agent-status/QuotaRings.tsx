/** Two concentric rings in the current `--quota-color`, drawn on a 24-unit grid. */
export function QuotaRings({ outer, inner, size = 22 }: { outer: number | null; inner: number | null; size?: number }) {
  return (
    <svg className="quota-rings" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <Ring radius={10} left={outer} />
      <Ring radius={5.5} left={inner} />
    </svg>
  );
}

function Ring({ radius, left }: { radius: number; left: number | null }) {
  // A sliver still shows that something is left; a full ring is drawn whole.
  const shown = left === null || left <= 0 ? 0 : Math.min(100, Math.max(left, 3));
  return (
    <>
      <circle className="quota-rings__track" cx={12} cy={12} r={radius} />
      {shown > 0 && (
        <circle className="quota-rings__fill" cx={12} cy={12} r={radius} pathLength={100}
          strokeDasharray={shown >= 100 ? undefined : `${shown} 100`} transform="rotate(-90 12 12)" />
      )}
    </>
  );
}

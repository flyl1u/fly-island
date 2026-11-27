import { IslandHoverCard } from "../../components/IslandHoverCard";
import { AgentProviderMark } from "./AgentProviderMark";
import type { AgentProvider } from "./api";
import type { CSSProperties } from "react";

/** Two separate arcs: the short window above the app, the weekly window below it. */
export function QuotaRings({ outer, inner, size = 26, provider, hints }: {
  outer: number | null;
  inner: number | null;
  size?: number;
  provider?: AgentProvider;
  hints?: readonly [string, string];
}) {
  return <span className="quota-rings" style={{ "--quota-size": `${size}px` } as CSSProperties}>
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <Arc position="top" path="M 2.34 9.41 A 10 10 0 0 1 21.66 9.41" left={outer} />
      <Arc position="bottom" path="M 2.34 14.59 A 10 10 0 0 0 21.66 14.59" left={inner} />
    </svg>
    {provider && <span className="quota-rings__logo" aria-hidden="true"><AgentProviderMark provider={provider} size={size * 13.5 / 22} /></span>}
    {hints?.map((hint, index) => <IslandHoverCard key={index} lines={[{ text: hint }]} placement="right" compact
      alignTo=".quota-rings" anchorClassName={`quota-rings__half quota-rings__half--${index === 0 ? "top" : "bottom"}`}>
      <button type="button" className="quota-rings__target" aria-label={hint} />
    </IslandHoverCard>)}
  </span>;
}

function Arc({ path, left, position }: { path: string; left: number | null; position: "top" | "bottom" }) {
  const shown = left === null ? 100 : left <= 0 ? 0 : Math.min(100, Math.max(left, 3));
  return (
    <g className={`quota-rings__arc quota-rings__arc--${position}`}>
      <path className="quota-rings__track" d={path} />
      {shown > 0 && (
        <path className={`quota-rings__fill${left === null ? " quota-rings__fill--unknown" : ""}`} d={path} pathLength={100}
          strokeDasharray={shown >= 100 ? undefined : `${shown} 100`} />
      )}
    </g>
  );
}

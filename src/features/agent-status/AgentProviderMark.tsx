import type { CSSProperties } from "react";
import { AgentProviderIcon } from "./AgentProviderIcon";
import type { AgentProvider } from "./api";
import claudeMark from "../../assets/brands/marks/claude.svg";
import codexMark from "../../assets/brands/marks/codex.svg";
import kimiMark from "../../assets/brands/marks/kimi-code.svg";
import zcodeMark from "../../assets/brands/marks/zcode.svg";
import workbuddyMark from "../../assets/brands/marks/workbuddy.svg";
import antigravityMark from "../../assets/brands/marks/antigravity.svg";
import deepseekMark from "../../assets/brands/marks/deepseek.svg";
import "./AgentProviderMark.css";

const MONOCHROME: Partial<Record<AgentProvider, string>> = {
  claudeCode: claudeMark, codex: codexMark, kimiCode: kimiMark, zcode: zcodeMark, workbuddy: workbuddyMark,
};
const OPTICAL_SCALE: Partial<Record<AgentProvider, number>> = { kimiCode: 0.94, zcode: 0.98, workbuddy: 1.04 };

/** The brand mark alone, without an app tile or its padding, for the centre of quota arcs. */
export function AgentProviderMark({ provider, size }: { provider: AgentProvider; size: number }) {
  const source = MONOCHROME[provider];
  const className = `agent-provider-mark agent-provider-mark--${provider}`;
  const style = { "--agent-mark-size": `${size}px`, "--agent-mark-scale": OPTICAL_SCALE[provider] ?? 1 } as CSSProperties;
  if (source) return <span className={className} aria-hidden="true"
    style={{ ...style, "--agent-mark": `url("${source}")` } as CSSProperties} />;
  if (provider === "antigravity" || provider === "dsh") return <img className={`${className} agent-provider-mark--color`}
    src={provider === "antigravity" ? antigravityMark : deepseekMark} style={style} alt="" aria-hidden="true" width={size} height={size} draggable={false} />;
  return <AgentProviderIcon provider={provider} size={size} />;
}

import claudeCodeIcon from "../../assets/brands/claude-code.png";
import codexIcon from "../../assets/brands/codex.webp";
import type { AgentProvider } from "./api";
import "./AgentProviderIcon.css";

const PROVIDER_ICONS: Record<Exclude<AgentProvider, "dsh">, string> = {
  claudeCode: claudeCodeIcon,
  codex: codexIcon,
};

export function AgentProviderIcon({ provider, size = 16 }: { provider: AgentProvider; size?: number }) {
  if (provider === "dsh") return <span className="agent-provider-icon agent-provider-icon--dsh" style={{ width: size, height: size, fontSize: size * 0.45 }} aria-hidden="true">DS</span>;
  return (
    <img
      className={`agent-provider-icon agent-provider-icon--${provider}`}
      src={PROVIDER_ICONS[provider]}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      draggable={false}
    />
  );
}

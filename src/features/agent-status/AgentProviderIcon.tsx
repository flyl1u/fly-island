import claudeCodeIcon from "../../assets/brands/claude-code.png";
import codexIcon from "../../assets/brands/codex.webp";
import type { AgentProvider } from "./api";
import "./AgentProviderIcon.css";

const PROVIDER_ICONS: Record<AgentProvider, string> = {
  claudeCode: claudeCodeIcon,
  codex: codexIcon,
};

export function AgentProviderIcon({ provider, size = 16 }: { provider: AgentProvider; size?: number }) {
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

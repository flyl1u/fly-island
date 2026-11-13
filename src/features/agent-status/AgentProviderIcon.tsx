import claudeCodeIcon from "../../assets/brands/claude-code.png";
import codexIcon from "../../assets/brands/codex.webp";
import deepseekIcon from "../../assets/brands/deepseek.png";
import type { AgentProvider } from "./api";
import "./AgentProviderIcon.css";

/** Each source's own app tile; DSH uses DeepSeek's mark on a light tile, as its desktop app does. */
const PROVIDER_ICONS: Record<AgentProvider, string> = {
  claudeCode: claudeCodeIcon,
  codex: codexIcon,
  dsh: deepseekIcon,
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

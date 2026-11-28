import claudeCodeIcon from "../../assets/brands/claude-code.png";
import codexIcon from "../../assets/brands/codex.webp";
import deepseekIcon from "../../assets/brands/deepseek.png";
import workbuddyIcon from "../../assets/brands/workbuddy.png";
import cursorIcon from "../../assets/brands/cursor.svg";
import kimiCodeIcon from "../../assets/brands/kimi-code.svg";
import hermesIcon from "../../assets/brands/hermes.svg";
import zcodeIcon from "../../assets/brands/zcode.svg";
import codebuddyIcon from "../../assets/brands/codebuddy.svg";
import antigravityIcon from "../../assets/brands/antigravity.svg";
import relayIcon from "../../assets/plugins/relay.svg";
import type { AgentProvider } from "./api";
import { Puzzle } from "lucide-react";
import "./AgentProviderIcon.css";

/** Each source's own app tile; DSH uses DeepSeek's mark on a light tile, as its desktop app does. */
const PROVIDER_ICONS: Record<Exclude<AgentProvider, "plugin">, string> = {
  claudeCode: claudeCodeIcon,
  codex: codexIcon,
  dsh: deepseekIcon,
  workbuddy: workbuddyIcon,
  cursor: cursorIcon,
  kimiCode: kimiCodeIcon,
  hermes: hermesIcon,
  zcode: zcodeIcon,
  codebuddy: codebuddyIcon,
  antigravity: antigravityIcon,
  relay: relayIcon,
};

export function AgentProviderIcon({ provider, size = 16 }: { provider: AgentProvider; size?: number }) {
  if (provider === "plugin") return <Puzzle size={size} aria-hidden="true" />;
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

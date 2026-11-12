import { act } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import "../../src/styles/tokens.css";
import { I18nProvider, LOCALE_STORAGE_KEY } from "../../src/i18n";
import { AgentSessionsPanel } from "../../src/features/agent-status/AgentSessionsPanel";
import type { AgentSessionSummary } from "../../src/features/agent-status/api";
import { DSH_USAGE, checkDsh } from "./agent-dsh";

Object.assign(globalThis, { isTauri: true, IS_REACT_ACT_ENVIRONMENT: true });
const params = new URLSearchParams(location.search);
localStorage.setItem(LOCALE_STORAGE_KEY, params.get("locale") === "en" ? "en" : "zh-CN");
const now = Date.now();
const focusCalls: Record<string, unknown>[] = [];
mockIPC((command, payload) => {
  if (command === "focus_agent_window") { focusCalls.push((payload ?? {}) as Record<string, unknown>); return true; }
  if (command === "list_agent_effort_labels") return {};
  return null;
});
const sessions: AgentSessionSummary[] = ["dsh", "claudeCode", "codex"].map((provider, index) => ({
  provider: provider as AgentSessionSummary["provider"], sessionId: `example-${index}`, cwd: "D:\\example-project",
  title: ["Fictional DSH session", "Fictional Claude session", "Fictional Codex session"][index],
  model: ["deepseek-v4", "Opus 5.5", "gpt-6-astra"][index], effort: "high", phase: "running",
  lastMessage: "Example response for visual verification.", updatedAt: now - index * 10000, turnStartedAt: now - 60000,
  host: { name: ["DeepSeek Harness", "Claude", "Codex"][index], kind: "app", exe: null },
}));
const window = (used: number) => ({ name: "", used, resetsAt: now + 3600000 });
const usages = { claude: { updatedAt: now, fiveHour: window(20), sevenDay: window(50), models: [], plan: null },
  codex: { updatedAt: now, fiveHour: window(30), sevenDay: window(60), models: [], plan: null }, dsh: DSH_USAGE, readAt: now };
const root = createRoot(document.getElementById("fixture")!);
const results = document.getElementById("results")!;
try {
  if (params.has("test")) {
    const messages: string[] = [];
    await checkDsh(root, sessions, usages, (condition, message) => {
      if (!condition) throw new Error(message);
      messages.push(`PASS ${message}`);
    }, focusCalls);
    results.textContent = messages.join("\n");
    results.dataset.result = "passed";
  } else {
    await act(async () => root.render(<I18nProvider><AgentSessionsPanel sessions={sessions} sort="recent" hostDisplay="both" showUsage usages={usages} /></I18nProvider>));
  }
} catch (error) {
  results.textContent = `FAIL ${String(error)}`;
  results.dataset.result = "failed";
}

import { useEffect, useState } from "react";
import { CircleAlert } from "lucide-react";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsLinkButton } from "../../components/settings/SettingsLinkButton";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { useTranslation } from "../../i18n";
import { getAgentHooksState } from "./api";
import { getAgentHooksNotice, type AgentHooksNotice as Notice } from "./status";

/**
 * On the Sessions page, a row saying the hooks are missing or old, with the way to the
 * Connection page where they are installed. Nothing while they are current.
 */
export function AgentHooksNotice({ onOpenConnect }: { onOpenConnect: () => void }) {
  const text = useTranslation().settings.agent;
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getAgentHooksState()
      .then((state) => {
        // An older native side, or a page mocking it, may give nothing usable.
        if (!cancelled) setNotice(state && typeof state === "object" ? getAgentHooksNotice(state) : null);
      })
      .catch((error: unknown) => console.error("Failed to read agent hooks state", error));
    return () => {
      cancelled = true;
    };
  }, []);

  if (!notice) return null;
  return (
    <SettingsGroup>
      <SettingsRow searchable={false}
        title={
          <span className="agent-hooks-message agent-hooks-message--attention">
            <CircleAlert size={13} strokeWidth={2.4} aria-hidden="true" />
            {notice === "update" ? text.hooksOutdated : text.hooksMissing}
          </span>
        }
        control={<SettingsLinkButton onClick={onOpenConnect}>{text.install}</SettingsLinkButton>}
      />
    </SettingsGroup>
  );
}

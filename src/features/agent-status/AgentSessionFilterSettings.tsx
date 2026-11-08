import { useState } from "react";
import { X } from "lucide-react";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsInput } from "../../components/settings/SettingsInput";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { SettingsSelect } from "../../components/settings/SettingsSelect";
import { SettingsLinkButton } from "../../components/settings/SettingsLinkButton";
import { useTranslation } from "../../i18n";
import type { SessionFilter } from "./sessionFilters";
import { useSessionFilters } from "./useSessionFilters";
import "./AgentSessionFilterSettings.css";

/** Settings → AI Agent: rules that hide agent sessions by folder or prompt text (roadmap B6.4.3). */
export function AgentSessionFilterSettings() {
  const text = useTranslation().settings.agent.filters;
  const [filters, setFilters] = useSessionFilters();
  const [kind, setKind] = useState<SessionFilter["kind"]>("folder");
  const [value, setValue] = useState("");

  const add = () => {
    if (!value.trim()) return;
    setFilters([...filters, { kind, value }]);
    setValue("");
  };

  return (
    <SettingsGroup title={text.title} footer={text.hint}>
      {filters.map((filter, index) => (
        <SettingsRow searchable={false}
          key={`${filter.kind}:${filter.value}`}
          title={<span className="session-filter__value">{filter.value}</span>}
          description={text.kinds[filter.kind]}
          control={
            <button
              className="session-filter__remove"
              type="button"
              aria-label={text.remove(filter.value)}
              onClick={() => setFilters(filters.filter((_, other) => other !== index))}
            >
              <X size={14} strokeWidth={2.2} />
            </button>
          }
        />
      ))}
      <SettingsRow
        title={text.add}
        control={
          <SettingsSelect
            value={kind}
            options={(["folder", "prompt"] as const).map((option) => ({ value: option, label: text.kinds[option] }))}
            ariaLabel={text.kindLabel}
            onChange={(next) => setKind(next as SessionFilter["kind"])}
          />
        }
      >
        <form
          className="session-filter__form"
          onSubmit={(event) => {
            event.preventDefault();
            add();
          }}
        >
          <SettingsInput
            monospace={kind === "folder"}
            value={value}
            placeholder={kind === "folder" ? text.folderPlaceholder : text.promptPlaceholder}
            aria-label={text.add}
            onChange={(event) => setValue(event.target.value)}
          />
          <SettingsLinkButton disabled={!value.trim()} onClick={add}>{text.addButton}</SettingsLinkButton>
        </form>
      </SettingsRow>
    </SettingsGroup>
  );
}

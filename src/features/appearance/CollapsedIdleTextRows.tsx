import { SettingsInput } from "../../components/settings/SettingsInput";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { SettingsSelect } from "../../components/settings/SettingsSelect";
import { useTranslation } from "../../i18n";
import { IDLE_TEXT_MAX_LENGTH, normalizeIdleText } from "./idleText";
import type { IslandSettings } from "./types";

type Props = { settings: IslandSettings; onChange: (settings: IslandSettings) => void };

/** Appearance → Collapsed island: the text the idle island shows, and what "todos left" shows. */
export function CollapsedIdleTextRows({ settings, onChange }: Props) {
  const text = useTranslation().settings.appearance.collapsedIsland.idleText;
  return (
    <>
      <SettingsRow title={text.title} description={text.hint} labelFor="collapsed-idle-text">
        <SettingsInput
          id="collapsed-idle-text"
          value={settings.idleText}
          maxLength={IDLE_TEXT_MAX_LENGTH}
          placeholder={text.placeholder}
          onChange={(event) => onChange({ ...settings, idleText: event.target.value.slice(0, IDLE_TEXT_MAX_LENGTH) })}
          onBlur={() => { const idleText = normalizeIdleText(settings.idleText); if (idleText !== settings.idleText) onChange({ ...settings, idleText }); }}
        />
      </SettingsRow>
      <SettingsRow title={text.pendingTitle} description={text.pendingHint} control={
        <SettingsSelect value={settings.todoPendingDisplay} ariaLabel={text.pendingTitle}
          options={[{ value: "pendingCount", label: text.pendingCount }, { value: "idleText", label: text.pendingIdleText }]}
          onChange={(todoPendingDisplay) => onChange({ ...settings, todoPendingDisplay })} />
      } />
    </>
  );
}

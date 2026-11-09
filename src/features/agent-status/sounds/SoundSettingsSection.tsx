import { useCallback, useEffect, useState } from "react";
import { Play } from "lucide-react";
import { SettingsGroup } from "../../../components/settings/SettingsGroup";
import { SettingsLinkButton } from "../../../components/settings/SettingsLinkButton";
import { SettingsRow } from "../../../components/settings/SettingsRow";
import { SettingsSelect } from "../../../components/settings/SettingsSelect";
import { SettingsSliderRow } from "../../../components/settings/SettingsSliderRow";
import { SettingsSwitch } from "../../../components/settings/SettingsSwitch";
import { SettingsToggleRow } from "../../../components/settings/SettingsToggleRow";
import { useLocale, useTranslation } from "../../../i18n";
import { listSoundPacks, soundPackName, type SoundPack } from "./api";
import { AGENT_SOUND_EVENTS } from "./events";
import { forgetSoundPacks, previewAgentSound } from "./player";
import { SoundPacksGroup } from "./SoundPacksGroup";
import { BUILTIN_PACK, DEFAULT_AGENT_SOUND_SETTINGS, type AgentSoundSettings } from "./storage";
import { useAgentSoundSettings } from "./useAgentSoundSettings";
import "./SoundSettingsSection.css";

/** Settings → Sounds: agent sounds on or off, volume, which pack, each event, quiet times and packs. */
export function SoundSettingsSection() {
  const t = useTranslation();
  const { locale } = useLocale();
  const text = t.settings.sounds;
  const [settings, setSettings] = useAgentSoundSettings();
  const [packs, setPacks] = useState<SoundPack[]>([]);
  const update = (patch: Partial<AgentSoundSettings>) => setSettings((current) => ({ ...current, ...patch }));

  const reloadPacks = useCallback(() => {
    forgetSoundPacks();
    void listSoundPacks()
      .then(setPacks)
      .catch((error: unknown) => console.error("Failed to list the sound packs", error));
  }, []);
  useEffect(reloadPacks, [reloadPacks]);

  const packOptions = [
    { value: BUILTIN_PACK, label: text.builtinPack },
    ...packs.map((pack) => ({ value: pack.id, label: soundPackName(pack, locale) })),
  ];
  // A removed pack falls back to the built-in sounds.
  const packValue = packOptions.some((option) => option.value === settings.pack) ? settings.pack : BUILTIN_PACK;

  return (
    <>
      <SettingsGroup title={text.title}>
        <SettingsToggleRow
          title={text.enabled}
          description={text.enabledHint}
          checked={settings.enabled}
          onChange={(enabled) => update({ enabled })}
        />
        {settings.enabled && (
          <>
            <SettingsSliderRow
              indent
              title={text.volume}
              value={settings.volume}
              min={0}
              max={100}
              step={5}
              format={(value) => `${Math.round(value)}%`}
              defaultValue={DEFAULT_AGENT_SOUND_SETTINGS.volume}
              resetLabel={t.settings.layout.resetToDefault}
              onChange={(volume) => update({ volume })}
            />
            <SettingsRow
              indent
              title={text.pack}
              control={
                <SettingsSelect
                  value={packValue}
                  options={packOptions}
                  ariaLabel={text.pack}
                  onChange={(pack) => {
                    update({ pack });
                    void previewAgentSound("complete", pack, settings.volume);
                  }}
                />
              }
            />
          </>
        )}
      </SettingsGroup>

      {settings.enabled && (
        <SettingsGroup title={text.eventsTitle}>
          {AGENT_SOUND_EVENTS.map((event) => (
            <SettingsRow
              key={event}
              title={text.events[event].title}
              description={text.events[event].hint}
              control={
                <>
                  <SettingsLinkButton onClick={() => void previewAgentSound(event, packValue, settings.volume)}>
                    <Play size={12} strokeWidth={2.4} aria-hidden="true" />
                    {text.preview}
                  </SettingsLinkButton>
                  <SettingsSwitch
                    id={`agent-sound-${event}`}
                    checked={settings.events[event]}
                    onChange={(on) => update({ events: { ...settings.events, [event]: on } })}
                  />
                </>
              }
              labelFor={`agent-sound-${event}`}
            />
          ))}
        </SettingsGroup>
      )}

      {settings.enabled && (
        <SettingsGroup title={text.quietTitle} footer={text.quietFooter}>
          <SettingsToggleRow
            title={text.quietWhenInFront}
            description={text.quietWhenInFrontHint}
            checked={settings.quietWhenInFront}
            onChange={(quietWhenInFront) => update({ quietWhenInFront })}
          />
          <SettingsToggleRow
            title={text.quietHours}
            description={text.quietHoursHint}
            checked={settings.quietHours.enabled}
            onChange={(enabled) => update({ quietHours: { ...settings.quietHours, enabled } })}
          />
          {settings.quietHours.enabled && (
            <SettingsRow
              indent
              title={text.quietRange}
              control={
                <span className="sound-settings__times">
                  <input
                    type="time"
                    aria-label={text.quietFrom}
                    value={settings.quietHours.start}
                    onChange={(event) => event.currentTarget.value && update({ quietHours: { ...settings.quietHours, start: event.currentTarget.value } })}
                  />
                  <span aria-hidden="true">–</span>
                  <input
                    type="time"
                    aria-label={text.quietTo}
                    value={settings.quietHours.end}
                    onChange={(event) => event.currentTarget.value && update({ quietHours: { ...settings.quietHours, end: event.currentTarget.value } })}
                  />
                </span>
              }
            />
          )}
        </SettingsGroup>
      )}

      <SoundPacksGroup
        packs={packs}
        onChanged={(imported) => {
          reloadPacks();
          if (imported) update({ pack: imported.id });
        }}
      />
    </>
  );
}

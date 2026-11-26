import { SettingsColor } from "../../components/settings/SettingsColor";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { useTranslation } from "../../i18n";
import type { IslandSettings } from "./types";
import { HexColorInput } from "./HexColorInput";
import { Undo2 } from "lucide-react";
import { loadColorBackup, swapColorBackup } from "./storage";
import "./ColorSettingsSection.css";
import { ColorPresetRow } from "./ColorPresetRow";
import { SettingsLinkButton } from "../../components/settings/SettingsLinkButton";
import { resolveSchemeColors } from "./theme";
import { useResolvedScheme } from "./useDocumentTheme";

type ColorKey = "islandBackgroundColor" | "taskTextColor" | "pulseColor";

/** Appearance → Colours: the island, its text and its status light. */
export function ColorSettingsSection({
  settings,
  onSettingsChange,
}: {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings) => void;
}) {
  const t = useTranslation();
  const text = t.settings.colors;
  const backup = loadColorBackup();
  // A colour never changed shows what the scheme draws; picking one makes it the user's own.
  const drawn = resolveSchemeColors(settings, useResolvedScheme(settings.colorScheme));
  // Unset, the page text is the scheme's ink (--ink-rgb in tokens.css).
  const schemeInk = drawn.tone === "light" ? "#1A1A20" : "#F8F6F0";
  const colors: readonly [ColorKey, string][] = [
    ["islandBackgroundColor", text.islandBackground],
    ["taskTextColor", text.taskText],
    ["pulseColor", text.pulse],
  ];

  return (
    <SettingsGroup title={text.title} action={backup && (
      <button className="appearance-color-restore" type="button" aria-label={text.restore}
        onClick={() => onSettingsChange(swapColorBackup(settings))}>
        <Undo2 size={15} aria-hidden="true" />
      </button>
    )}>
      <div className="appearance-color-grid">
        {colors.map(([key, label]) => (
          <SettingsRow
            key={key}
            title={label}
            control={
              <SettingsColor
                value={drawn[key]}
                ariaLabel={label}
                onChange={(value) => onSettingsChange({ ...settings, [key]: value.toUpperCase() })}
                valueControl={<HexColorInput value={drawn[key]} ariaLabel={label} onChange={(value) => onSettingsChange({ ...settings, [key]: value })} />}
              />
            }
          />
        ))}
        <SettingsRow
          title={text.pageText}
          control={
            <>
              {settings.pageTextColor && (
                <SettingsLinkButton onClick={() => onSettingsChange({ ...settings, pageTextColor: "" })}>{text.pageTextAuto}</SettingsLinkButton>
              )}
              <SettingsColor
                value={settings.pageTextColor || schemeInk}
                ariaLabel={text.pageText}
                onChange={(value) => onSettingsChange({ ...settings, pageTextColor: value.toUpperCase() })}
                valueControl={<HexColorInput value={settings.pageTextColor || schemeInk} ariaLabel={text.pageText}
                  onChange={(value) => onSettingsChange({ ...settings, pageTextColor: value })} />}
              />
            </>
          }
        />
      </div>
      <ColorPresetRow settings={settings} onSettingsChange={onSettingsChange} />
    </SettingsGroup>
  );
}

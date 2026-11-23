import { useEffect, useState } from "react";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { SettingsSelect } from "../../components/settings/SettingsSelect";
import { useLocale, useTranslation } from "../../i18n";
import { listInstalledFonts, type InstalledFont } from "./api";
import { normalizeLocalFontFamily } from "./localFont";
import type { IslandSettings } from "./types";

const LOCAL = "local:";

export function IslandFontRow({ settings, onSettingsChange }: {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings) => void;
}) {
  const { locale } = useLocale();
  const text = useTranslation().settings.appearance;
  const [requested, setRequested] = useState(false);
  const [fonts, setFonts] = useState<{ locale: string; entries: InstalledFont[] } | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!requested) return;
    let cancelled = false;
    void listInstalledFonts(locale).then((entries) => {
      if (cancelled) return;
      const installed = entries.filter(({ family }) => family && normalizeLocalFontFamily(family) === family);
      const collator = new Intl.Collator(locale);
      installed.sort((a, b) => collator.compare(a.label, b.label));
      setFonts({ locale, entries: installed });
    }).catch(() => { if (!cancelled) setFonts({ locale, entries: [] }); });
    return () => { cancelled = true; };
  }, [locale, requested, retry]);

  const entries = fonts?.locale === locale ? fonts.entries : null;
  const failed = entries?.length === 0;
  const family = settings.fontFamily === "local" ? settings.localFontFamily : "";
  const savedFont = family ? entries?.find((font) => font.family === family) : undefined;
  const options = [
    { value: "system", label: text.systemFont },
    { value: "pixel", label: text.pixelFont },
    ...(family ? [{ value: LOCAL + family, label: savedFont?.label ?? family }] : []),
    ...(entries?.filter((font) => font.family !== family)
      .map(({ family, label }) => ({ value: LOCAL + family, label })) ?? []),
  ];
  const selection = family ? LOCAL + family : settings.fontFamily === "pixel" ? "pixel" : "system";
  const description = failed ? text.localFontsFailed
    : requested && !entries ? text.loadingLocalFonts
      : family && entries && !savedFont ? text.localFontMissing : undefined;

  return (
    <SettingsRow title={text.font} description={description}
      control={
        <SettingsSelect value={selection} options={options} ariaLabel={text.fontLabel}
          onOpen={() => {
            setRequested(true);
            if (failed) { setFonts(null); setRetry((n) => n + 1); }
          }}
          onChange={(option) => {
            if (option === "system" || option === "pixel") onSettingsChange({ ...settings, fontFamily: option });
            else onSettingsChange({ ...settings, fontFamily: "local", localFontFamily: option.slice(LOCAL.length) });
          }} />
      }
    />
  );
}

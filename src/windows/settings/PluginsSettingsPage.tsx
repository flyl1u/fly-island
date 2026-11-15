import { useEffect, useState } from "react";
import { Puzzle, ShieldCheck } from "lucide-react";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { SettingsToggleRow } from "../../components/settings/SettingsToggleRow";
import { SettingsInput } from "../../components/settings/SettingsInput";
import { SettingsLinkButton } from "../../components/settings/SettingsLinkButton";
import { PluginSettingRow } from "../../features/plugins/PluginSettingRow";
import { usePlugins, refreshPlugins } from "../../features/plugins/usePlugins";
import { configurePlugins, getPluginsIndex, installPlugin, loadDevelopmentPlugin, runPluginAction, setPluginEnabled, setPluginSetting, uninstallPlugin, type PluginIndexEntry } from "../../features/plugins/api";
import { useLocale, useTranslation } from "../../i18n";
import "./PluginsSettingsPage.css";

export function PluginsSettingsPage() {
  const t = useTranslation().settings.plugins;
  const { locale } = useLocale();
  const { registry, live } = usePlugins();
  const [catalog, setCatalog] = useState<PluginIndexEntry[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showDeveloper, setShowDeveloper] = useState(false);
  const [directory, setDirectory] = useState("");
  const [index, setIndex] = useState(registry.indexUrl);
  const perform = async (action: () => Promise<unknown>) => {
    setBusy(true); setError("");
    try { await action(); await refreshPlugins(); }
    catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  };
  const refreshCatalog = () => perform(async () => setCatalog(await getPluginsIndex()));
  useEffect(() => { let disposed = false; void getPluginsIndex().then((entries) => { if (!disposed) setCatalog(entries); }).catch((e: unknown) => { if (!disposed) setError(String(e)); }); return () => { disposed = true; }; }, []);
  const installed = Object.values(registry.installed);
  return <section className="settings-section settings-section--list plugins-settings" onKeyDown={(e) => { if (e.ctrlKey && e.shiftKey && e.key === "D") setShowDeveloper(true); }}>
    <SettingsGroup title={t.installed} action={<SettingsLinkButton disabled={busy} onClick={() => { void refreshCatalog(); }} >{t.retry}</SettingsLinkButton>}>
      {installed.length === 0 && <SettingsRow title={t.empty} control={<Puzzle size={18} aria-hidden="true" />} />}
      {installed.map((p) => <div key={p.manifest.id}>
        <SettingsRow title={p.manifest.name[locale]} description={`${p.manifest.version} · ${t.status[live[p.manifest.id]?.status ?? "stopped"] ?? ""}`} control={<span className="plugins-settings__actions">
          {catalog.some((e) => e.id === p.manifest.id && e.version !== p.manifest.version) && <SettingsLinkButton disabled={busy} onClick={() => { void perform(() => installPlugin(p.manifest.id)); }}>{t.update}</SettingsLinkButton>}
          <SettingsLinkButton disabled={busy} onClick={() => { void perform(() => uninstallPlugin(p.manifest.id)); }}>{t.uninstall}</SettingsLinkButton>
        </span>} />
        <SettingsToggleRow title={t.enabled} checked={p.enabled} disabled={busy} onChange={(enabled) => { void perform(() => setPluginEnabled(p.manifest.id, enabled)); }} />
        <SettingsRow title={<span className="plugins-settings__permissions"><ShieldCheck size={14} aria-hidden="true" />{t.permissions}</span>}>
          <div className="plugins-settings__permissions">{p.manifest.permissions.map((permission) => <span key={permission} className="plugins-settings__permission">{t.permission[permission] ?? permission}</span>)}</div>
        </SettingsRow>
        {p.manifest.settings.map((s) => <PluginSettingRow key={`${p.manifest.id}/${s.key}/${JSON.stringify(p.settings[s.key])}`} setting={s} value={p.settings[s.key] ?? s.default} disabled={busy} onSave={(value) => { void perform(() => setPluginSetting(p.manifest.id, s.key, value)); }} />)}
        {p.manifest.actions.map((action) => <SettingsRow key={action.id} title={action.label[locale]} control={<SettingsLinkButton disabled={busy || !p.enabled} onClick={() => { void perform(() => runPluginAction(p.manifest.id, action.id)); }}>{action.label[locale]}</SettingsLinkButton>} />)}
      </div>)}
    </SettingsGroup>
    {catalog.some((e) => !registry.installed[e.id]) && <SettingsGroup title={t.available}>
      {catalog.filter((e) => !registry.installed[e.id]).map((entry) => <SettingsRow key={entry.id} title={entry.name[locale]} description={entry.description[locale]} control={<SettingsLinkButton disabled={busy} onClick={() => { void perform(() => installPlugin(entry.id)); }}>{t.install}</SettingsLinkButton>} />)}
    </SettingsGroup>}
    {error && <p className="plugins-settings__error" role="alert">{error}</p>}
    {(showDeveloper || registry.developerMode) && <SettingsGroup title={t.developer}>
      <SettingsToggleRow title={t.developer} checked={registry.developerMode} disabled={busy} onChange={(enabled) => { void perform(() => configurePlugins(enabled, registry.indexUrl)); }} />
      {registry.developerMode && <>
        <SettingsRow title={t.index} control={<SettingsLinkButton disabled={busy} onClick={() => { void perform(() => configurePlugins(true, index)); }}>{t.save}</SettingsLinkButton>}><SettingsInput aria-label={t.index} value={index} onChange={(e) => setIndex(e.target.value)} /></SettingsRow>
        <SettingsRow title={t.directory} control={<SettingsLinkButton disabled={busy || !directory} onClick={() => { void perform(() => loadDevelopmentPlugin(directory)); }}>{t.load}</SettingsLinkButton>}><SettingsInput aria-label={t.directory} value={directory} onChange={(e) => setDirectory(e.target.value)} /></SettingsRow>
      </>}
    </SettingsGroup>}
  </section>;
}

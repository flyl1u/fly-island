import { useEffect, useState } from "react";
import { ArrowUpRight, Puzzle, ShieldCheck } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { SettingsToggleRow } from "../../components/settings/SettingsToggleRow";
import { SettingsInput } from "../../components/settings/SettingsInput";
import { SettingsLinkButton } from "../../components/settings/SettingsLinkButton";
import { PluginSettingRow } from "../../features/plugins/PluginSettingRow";
import { usePlugins, refreshPlugins } from "../../features/plugins/usePlugins";
import { PLUGINS_ENABLED } from "../../features/plugins";
import { configurePlugins, getPluginsIndex, installPlugin, loadDevelopmentPlugin, PLUGIN_INDEX_UNAVAILABLE, runPluginAction, setPluginEnabled, setPluginSetting, uninstallPlugin, type PluginIndexEntry } from "../../features/plugins/api";
import { useLocale, useTranslation } from "../../i18n";
import { PluginDevelopmentPage } from "./PluginDevelopmentPage";
import { PluginMarket } from "./PluginMarket";
import "./PluginsSettingsPage.css";

/** The built-in plugin market comes first; the external data host below follows the release flag. */
export function PluginsSettingsPage() {
  return <div className="plugins-page">
    <PluginMarket />
    {PLUGINS_ENABLED ? <EnabledPluginsSettingsPage /> : <PluginDevelopmentPage />}
  </div>;
}

function EnabledPluginsSettingsPage() {
  const t = useTranslation().settings.plugins;
  const { locale } = useLocale();
  const { registry, live } = usePlugins();
  const [catalog, setCatalog] = useState<PluginIndexEntry[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogRevision, setCatalogRevision] = useState(0);
  const [catalogUnavailable, setCatalogUnavailable] = useState(false);
  const [directory, setDirectory] = useState("");
  const [index, setIndex] = useState<string | null>(null);
  const disabled = busy || catalogLoading;
  const perform = async (action: () => Promise<unknown>, block = true) => {
    if (block) setBusy(true);
    setError("");
    try { await action(); await refreshPlugins(); }
    catch (e) {
      if (String(e) === PLUGIN_INDEX_UNAVAILABLE) { setCatalog([]); setCatalogUnavailable(true); }
      else setError(String(e));
    }
    finally { if (block) setBusy(false); }
  };
  const refreshCatalog = () => setCatalogRevision((revision) => revision + 1);
  useEffect(() => {
    let disposed = false;
    setCatalogLoading(true);
    void getPluginsIndex().then((entries) => {
      if (!disposed) { setCatalog(entries); setCatalogUnavailable(false); }
    }).catch((e: unknown) => {
      console.error("Plugin index unavailable", e);
      if (!disposed) { setCatalog([]); setCatalogUnavailable(true); }
    }).finally(() => { if (!disposed) setCatalogLoading(false); });
    return () => { disposed = true; };
  }, [registry.developerMode, registry.indexUrl, catalogRevision]);
  const installed = Object.values(registry.installed);
  return <section className="settings-section settings-section--list plugins-settings">
    <SettingsGroup title={t.installed} action={<SettingsLinkButton disabled={disabled} onClick={() => { void refreshCatalog(); }} >{t.retry}</SettingsLinkButton>}>
      {installed.length === 0 && <SettingsRow title={t.empty} control={<Puzzle size={18} aria-hidden="true" />} />}
      {installed.map((p) => <div key={p.manifest.id}>
        <SettingsRow title={p.manifest.name[locale]} description={`${p.manifest.version} · ${t.status[live[p.manifest.id]?.status ?? "stopped"] ?? ""}`} control={<span className="plugins-settings__actions">
          {catalog.some((e) => e.id === p.manifest.id && e.version !== p.manifest.version) && <SettingsLinkButton disabled={disabled} onClick={() => { void perform(() => installPlugin(p.manifest.id)); }}>{t.update}</SettingsLinkButton>}
          <SettingsLinkButton disabled={disabled} onClick={() => { void perform(() => uninstallPlugin(p.manifest.id)); }}>{t.uninstall}</SettingsLinkButton>
        </span>} />
        <SettingsToggleRow title={t.enabled} checked={p.enabled} disabled={disabled} onChange={(enabled) => { void perform(() => setPluginEnabled(p.manifest.id, enabled)); }} />
        <SettingsRow title={<span className="plugins-settings__permissions"><ShieldCheck size={14} aria-hidden="true" />{t.permissions}</span>}>
          <div className="plugins-settings__permissions">{p.manifest.permissions.map((permission) => <span key={permission} className="plugins-settings__permission">{t.permission[permission] ?? permission}</span>)}</div>
        </SettingsRow>
        {p.manifest.settings.map((s) => <PluginSettingRow key={`${p.manifest.id}/${s.key}/${s.type === "number" ? "number" : JSON.stringify(p.settings[s.key])}`} setting={s} value={p.settings[s.key] ?? s.default} disabled={disabled} onSave={(value) => { void perform(() => setPluginSetting(p.manifest.id, s.key, value), s.type !== "number"); }} />)}
        {!p.manifest.contributes.includes("panel") && p.manifest.actions.map((action) => <SettingsRow key={action.id} title={action.label[locale]} control={<SettingsLinkButton disabled={disabled || !p.enabled} onClick={() => { void perform(() => runPluginAction(p.manifest.id, action.id)); }}>{action.label[locale]}</SettingsLinkButton>} />)}
      </div>)}
    </SettingsGroup>
    {catalog.some((e) => !registry.installed[e.id]) && <SettingsGroup title={t.available}>
      {catalog.filter((e) => !registry.installed[e.id]).map((entry) => <SettingsRow key={entry.id} title={entry.name[locale]} description={entry.description[locale]} control={<SettingsLinkButton disabled={disabled} onClick={() => { void perform(() => installPlugin(entry.id)); }}>{t.install}</SettingsLinkButton>} />)}
    </SettingsGroup>}
    {catalogUnavailable && <SettingsGroup><SettingsRow title={t.unavailable} control={<SettingsLinkButton disabled={disabled} onClick={() => { void refreshCatalog(); }}>{t.retry}</SettingsLinkButton>} /></SettingsGroup>}
    {error && <p className="plugins-settings__error" role="alert">{error}</p>}
    <details className="plugins-settings__developer"><summary>{t.developer}</summary><SettingsGroup>
      <SettingsToggleRow title={t.developerMode} checked={registry.developerMode} disabled={busy} onChange={(enabled) => { void perform(() => configurePlugins(enabled, registry.indexUrl)); }} />
      {registry.developerMode && <>
        <SettingsRow title={t.index} control={<SettingsLinkButton disabled={busy} onClick={() => { void perform(async () => { await configurePlugins(true, index ?? registry.indexUrl); setIndex(null); }); }}>{t.save}</SettingsLinkButton>}><SettingsInput aria-label={t.index} value={index ?? registry.indexUrl} onChange={(e) => setIndex(e.target.value)} /></SettingsRow>
        <SettingsRow title={t.directory} control={<SettingsLinkButton disabled={busy || !directory} onClick={() => { void perform(() => loadDevelopmentPlugin(directory)); }}>{t.load}</SettingsLinkButton>}><SettingsInput aria-label={t.directory} value={directory} onChange={(e) => setDirectory(e.target.value)} /></SettingsRow>
      </>}
      <SettingsRow title={t.develop} control={<SettingsLinkButton ariaLabel={t.develop} onClick={() => { void openUrl("https://github.com/flyl1u/fly-island/blob/main/docs/plugins/README.md").catch(console.error); }}><ArrowUpRight size={16} aria-hidden="true" /></SettingsLinkButton>} />
    </SettingsGroup></details>
  </section>;
}

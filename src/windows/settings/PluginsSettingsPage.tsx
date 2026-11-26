import { useEffect, useState } from "react";
import { ArrowUpRight, Puzzle, ShieldCheck } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { SettingsToggleRow } from "../../components/settings/SettingsToggleRow";
import { SettingsInput } from "../../components/settings/SettingsInput";
import { SettingsLinkButton } from "../../components/settings/SettingsLinkButton";
import { PACKAGED_MARKET_PLUGINS } from "../../features/plugins/native/catalog";
import type { PlacedPlugin } from "../../features/plugins/placement.ts";
import { usePlacedPlugins } from "../../features/plugins/usePlacedPlugins";
import { usePlugins, refreshPlugins } from "../../features/plugins/usePlugins";
import { PLUGINS_ENABLED } from "../../features/plugins";
import { PLUGIN_MARKET_ENABLED } from "../../features/releaseFlags.ts";
import { configurePlugins, getPluginsIndex, installPlugin, loadDevelopmentPlugin, setPluginEnabled, uninstallPlugin, type PluginIndexEntry } from "../../features/plugins/api";
import { pluginFailureCode, type PluginFailure } from "../../features/plugins/errors";
import { useLocale, useTranslation } from "../../i18n";
import { PluginDevelopmentPage } from "./PluginDevelopmentPage";
import { PluginMarket } from "./PluginMarket";
import type { IslandSettings } from "../../features/appearance/types";
import "./PluginsSettingsPage.css";

type OpenSettings = (plugin: PlacedPlugin) => void;

/**
 * The built-in plugin market comes first; the external data host below follows the release flag.
 * Only installing and managing happen here: a plugin's settings live on the page its catalog entry names.
 */
export function PluginsSettingsPage({ settings, onSettingsChange, onOpenSettings }: {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings) => void;
  onOpenSettings: OpenSettings;
}) {
  return <div className="plugins-page">
    {PLUGIN_MARKET_ENABLED && <PluginMarket settings={settings} onSettingsChange={onSettingsChange} onOpenSettings={onOpenSettings} />}
    {(PLUGINS_ENABLED || PLUGIN_MARKET_ENABLED) && <EnabledPluginsSettingsPage onOpenSettings={onOpenSettings} />}
    {!PLUGINS_ENABLED && <PluginDevelopmentPage />}
  </div>;
}

/** Plugins without a market card (a custom index, developer mode) and the developer options. */
function EnabledPluginsSettingsPage({ onOpenSettings }: { onOpenSettings: OpenSettings }) {
  const t = useTranslation().settings.plugins;
  const placed = usePlacedPlugins();
  const { locale } = useLocale();
  const { registry, live } = usePlugins();
  const [catalog, setCatalog] = useState<PluginIndexEntry[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(PLUGINS_ENABLED);
  const [catalogRevision, setCatalogRevision] = useState(0);
  const [catalogFailure, setCatalogFailure] = useState<PluginFailure | null>(null);
  const [directory, setDirectory] = useState("");
  const [index, setIndex] = useState<string | null>(null);
  const disabled = busy || catalogLoading;
  const perform = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try { await action(); await refreshPlugins(); }
    catch (e) {
      const code = pluginFailureCode(e);
      if (code === "plugin_index_unavailable" || code === "plugin_index_incompatible") { setCatalog([]); setCatalogFailure(code); }
      else setError(code ? t.market.failure[code] : String(e));
    }
    finally { setBusy(false); }
  };
  const refreshCatalog = () => setCatalogRevision((revision) => revision + 1);
  useEffect(() => {
    if (!PLUGINS_ENABLED && catalogRevision === 0) return;
    let disposed = false;
    setCatalogLoading(true);
    void getPluginsIndex().then((entries) => {
      if (!disposed) { setCatalog(entries); setCatalogFailure(null); }
    }).catch((e: unknown) => {
      if (!disposed) { setCatalog([]); setCatalogFailure(pluginFailureCode(e) ?? "plugin_index_unavailable"); }
    }).finally(() => { if (!disposed) setCatalogLoading(false); });
    return () => { disposed = true; };
  }, [registry.developerMode, registry.indexUrl, catalogRevision]);
  const installed = Object.values(registry.installed).filter((p) => !PLUGIN_MARKET_ENABLED || p.development
    || !PACKAGED_MARKET_PLUGINS.some((entry) => entry.id === p.manifest.id));
  if (!PLUGINS_ENABLED && installed.length === 0) return null;
  return <section className="settings-section settings-section--list plugins-settings">
    <SettingsGroup title={t.installed} action={<SettingsLinkButton disabled={disabled} onClick={() => { void refreshCatalog(); }} >{PLUGINS_ENABLED ? t.retry : t.checkUpdate}</SettingsLinkButton>}>
      {installed.length === 0 && <SettingsRow title={t.empty} control={<Puzzle size={18} aria-hidden="true" />} />}
      {installed.map((p) => {
        const target = placed.find((plugin) => plugin.id === p.manifest.id);
        return <div key={p.manifest.id}>
          <SettingsRow title={p.manifest.name[locale]} description={`${p.manifest.version} · ${t.status[live[p.manifest.id]?.status ?? "stopped"] ?? ""}`} control={<span className="plugins-settings__actions">
            {target && <SettingsLinkButton ariaLabel={t.market.openSettingsNamed(p.manifest.name[locale])} onClick={() => onOpenSettings(target)}>{t.openSettings}</SettingsLinkButton>}
            {catalog.some((e) => e.id === p.manifest.id && e.version !== p.manifest.version) && <SettingsLinkButton disabled={disabled} onClick={() => { void perform(() => installPlugin(p.manifest.id)); }}>{t.update}</SettingsLinkButton>}
            {PLUGINS_ENABLED && <SettingsLinkButton disabled={disabled} onClick={() => { void perform(() => uninstallPlugin(p.manifest.id)); }}>{t.uninstall}</SettingsLinkButton>}
          </span>} />
          {PLUGINS_ENABLED && <SettingsToggleRow title={t.enabled} checked={p.enabled} disabled={disabled} onChange={(enabled) => { void perform(() => setPluginEnabled(p.manifest.id, enabled)); }} />}
          <SettingsRow title={<span className="plugins-settings__permissions"><ShieldCheck size={14} aria-hidden="true" />{t.permissions}</span>}>
            <div className="plugins-settings__permissions">{p.manifest.permissions.map((permission) => <span key={permission} className="plugins-settings__permission">{t.permission[permission] ?? permission}</span>)}</div>
          </SettingsRow>
        </div>;
      })}
    </SettingsGroup>
    {PLUGINS_ENABLED && catalog.some((e) => !registry.installed[e.id]) && <SettingsGroup title={t.available}>
      {catalog.filter((e) => !registry.installed[e.id]).map((entry) => <SettingsRow key={entry.id} title={entry.name[locale]} description={entry.description[locale]} control={<SettingsLinkButton disabled={disabled} onClick={() => { void perform(() => installPlugin(entry.id)); }}>{t.install}</SettingsLinkButton>} />)}
    </SettingsGroup>}
    {catalogFailure && <SettingsGroup><SettingsRow title={t.market.failure[catalogFailure]} control={<SettingsLinkButton disabled={disabled} onClick={() => { void refreshCatalog(); }}>{t.retry}</SettingsLinkButton>} /></SettingsGroup>}
    {error && <p className="plugins-settings__error" role="alert">{error}</p>}
    {PLUGINS_ENABLED && <details className="plugins-settings__developer"><summary>{t.developer}</summary><SettingsGroup>
      <SettingsToggleRow title={t.developerMode} checked={registry.developerMode} disabled={busy} onChange={(enabled) => { void perform(() => configurePlugins(enabled, registry.indexUrl)); }} />
      {registry.developerMode && <>
        <SettingsRow title={t.index} control={<SettingsLinkButton disabled={busy} onClick={() => { void perform(async () => { await configurePlugins(true, index ?? registry.indexUrl); setIndex(null); }); }}>{t.save}</SettingsLinkButton>}><SettingsInput aria-label={t.index} value={index ?? registry.indexUrl} onChange={(e) => setIndex(e.target.value)} /></SettingsRow>
        <SettingsRow title={t.directory} control={<SettingsLinkButton disabled={busy || !directory} onClick={() => { void perform(() => loadDevelopmentPlugin(directory)); }}>{t.load}</SettingsLinkButton>}><SettingsInput aria-label={t.directory} value={directory} onChange={(e) => setDirectory(e.target.value)} /></SettingsRow>
      </>}
      <SettingsRow title={t.develop} control={<SettingsLinkButton ariaLabel={t.develop} onClick={() => { void openUrl("https://github.com/flyl1u/fly-island/blob/main/docs/plugins/README.md").catch(console.error); }}><ArrowUpRight size={16} aria-hidden="true" /></SettingsLinkButton>} />
    </SettingsGroup></details>}
  </section>;
}

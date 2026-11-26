import { Fragment, useState, type ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsLinkButton } from "../../components/settings/SettingsLinkButton";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { PluginIcon } from "../../features/plugins/PluginIcon";
import { PluginSettingRow } from "../../features/plugins/PluginSettingRow";
import { runPluginAction, setPluginSetting, type InstalledPlugin } from "../../features/plugins/api";
import { pluginFailureCode } from "../../features/plugins/errors";
import type { NativePluginId } from "../../features/plugins/native/catalog";
import { pluginsOnPage, type PlacedPlugin, type PluginPageCategory } from "../../features/plugins/placement.ts";
import { refreshPlugins, usePlugins } from "../../features/plugins/usePlugins";
import { usePlacedPlugins, usePluginName } from "../../features/plugins/usePlacedPlugins";
import { useLocale, useTranslation } from "../../i18n";
import "./PluginSettingsGroup.css";

/**
 * A packaged plugin's group on the page its settings were declared for: the settings and the
 * action buttons that belong on this page, then its version, state and permissions.
 */
export function ExternalPluginGroup({ plugin, external, page }: { plugin: PlacedPlugin; external: InstalledPlugin; page: PluginPageCategory }) {
  const t = useTranslation().settings.plugins;
  const { locale } = useLocale();
  const { live } = usePlugins();
  const name = usePluginName()(plugin);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { manifest } = external;
  const home = plugin.category === page;
  // A plugin with its own island page offers its actions there.
  const actions = plugin.actionsCategory === page && !manifest.contributes.includes("panel") ? manifest.actions : [];
  const settings = home ? manifest.settings : [];
  // A group that would only repeat the version belongs to the plugin's main page.
  if (!home && actions.length === 0) return null;
  const perform = async (action: () => Promise<unknown>, block: boolean) => {
    if (block) setBusy(true);
    setError("");
    try { await action(); await refreshPlugins(); }
    catch (failure) {
      const code = pluginFailureCode(failure);
      setError(code ? t.market.failure[code] : t.market.operationFailed(name));
    }
    finally { if (block) setBusy(false); }
  };
  // A standalone page is already titled with the plugin's name.
  const titled = !plugin.standalone;
  return <SettingsGroup anchor={plugin.id}
    title={titled ? name : undefined} icon={titled ? <PluginIcon id={plugin.id} size={16} /> : undefined}
    footer={error ? <span className="plugins-settings__error" role="alert">{error}</span> : undefined}>
    {settings.map((setting) => <PluginSettingRow
      key={`${plugin.id}/${setting.key}/${setting.type === "number" ? "number" : JSON.stringify(external.settings[setting.key])}`}
      setting={setting} value={external.settings[setting.key] ?? setting.default} disabled={busy}
      onSave={(value) => { void perform(() => setPluginSetting(plugin.id, setting.key, value), setting.type !== "number"); }} />)}
    {actions.map((action) => <SettingsRow key={action.id} title={action.label[locale]} control={
      <SettingsLinkButton disabled={busy} ariaLabel={action.label[locale]}
        onClick={() => { void perform(() => runPluginAction(plugin.id, action.id), true); }}>{t.runAction}</SettingsLinkButton>} />)}
    {home && <SettingsRow description={`${manifest.version} · ${t.status[live[plugin.id]?.status ?? "stopped"] ?? ""}`}
      title={<span className="plugin-group__permissions"><ShieldCheck size={14} aria-hidden="true" />{t.permissions}</span>}>
      <div className="plugin-group__permissions">{manifest.permissions.map((permission) =>
        <span key={permission} className="plugin-group__permission">{t.permission[permission] ?? permission}</span>)}</div>
    </SettingsRow>}
  </SettingsGroup>;
}

/**
 * The groups of the plugins that declared this page, in catalog order and after the page's own
 * groups. Built-in plugins have no manifest, so the page that hosts them draws their group.
 */
export function PluginPageGroups({ page, renderNative }: {
  page: PluginPageCategory;
  renderNative?: (id: NativePluginId) => ReactNode;
}) {
  const placed = usePlacedPlugins();
  return <>{pluginsOnPage(placed, page).map((plugin) => plugin.external
    ? <ExternalPluginGroup key={plugin.id} plugin={plugin} external={plugin.external} page={page} />
    : <Fragment key={plugin.id}>{renderNative?.(plugin.native)}</Fragment>)}</>;
}

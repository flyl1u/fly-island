import { useCallback, useEffect, useMemo, useRef } from "react";
import type { IslandSettings } from "../../features/appearance/types";
import type { MessageView } from "../../features/messages/Messages";
import type { MailController } from "../../features/messages/mail/MailPanel";
import { useOfficeSources } from "../../features/messages/office-im/useOfficeIm";
import { usePlugins } from "../../features/plugins";
import { PLUGIN_RUNTIME_ENABLED } from "../../features/releaseFlags.ts";
import { islandPageFor, pluginPagesFrom, resolveIslandPage, resolveMessageSource, type IslandFeatures } from "./features";
import type { IslandPage } from "./types";
import type { IslandModeReason } from "./diagnosticMode";

type IslandFeatureOptions = {
  settings: IslandSettings;
  clipboardEnabled: boolean;
  qqEnabled: boolean;
  wechatEnabled: boolean;
  telegramEnabled: boolean;
  qqMail: MailController;
  page: IslandPage;
  /** The Battery plugin is installed and this computer has a battery. */
  hasBattery: boolean;
  messageSource: MessageView;
  setPage: (page: IslandPage) => void;
  setMessageSource: (source: MessageView) => void;
  openIslandPage: (page: IslandPage, reason?: IslandModeReason) => void;
};

/**
 * The modules switched on, and the island kept consistent with them: an open page or
 * message source that gets switched off moves to one still on, opening a page that is
 * off opens the first one on instead (or nothing when all are off), and switching mail
 * off pauses its sync until it is switched back on.
 */
export function useIslandFeatures({
  settings,
  clipboardEnabled,
  qqEnabled,
  wechatEnabled,
  telegramEnabled,
  qqMail,
  page,
  hasBattery,
  messageSource,
  setPage,
  setMessageSource,
  openIslandPage,
}: IslandFeatureOptions) {
  const plugins = usePlugins();
  const office = useOfficeSources();
  const hasPluginMessages = Object.values(plugins.registry.installed).some((p) => p.enabled && p.manifest.contributes.includes("notifications"));
  const pluginPages = useMemo(
    () => (PLUGIN_RUNTIME_ENABLED ? pluginPagesFrom(plugins.registry.installed, plugins.live) : []),
    [plugins],
  );
  const features = useMemo<IslandFeatures>(() => ({
    plugin: hasPluginMessages,
    dingtalk: office.dingtalk,
    feishu: office.feishu,
    wecom: office.wecom,
    todo: settings.todoEnabled,
    music: settings.musicEnabled,
    clipboard: clipboardEnabled,
    shelf: settings.shelfEnabled,
    qq: qqEnabled,
    wechat: wechatEnabled,
    telegram: telegramEnabled,
    qqMail: settings.mailEnabled,
    agents: settings.agentStatusEnabled,
    translation: settings.translationEnabled && settings.translationTarget === "island",
    pluginPages,
    battery: hasBattery,
  }), [clipboardEnabled, qqEnabled, settings.agentStatusEnabled, settings.mailEnabled, settings.musicEnabled, settings.shelfEnabled, settings.todoEnabled, settings.translationEnabled, settings.translationTarget, wechatEnabled, hasBattery, telegramEnabled, hasPluginMessages, pluginPages, office.dingtalk, office.feishu, office.wecom]);

  useEffect(() => {
    const next = islandPageFor(page, features, settings.clipboardDetached);
    if (next && next !== page) setPage(next);
    else if (!next && page === "battery") setPage("settings");
  }, [features, page, setPage, settings.clipboardDetached]);

  useEffect(() => {
    const next = resolveMessageSource(messageSource, features);
    if (next !== messageSource) setMessageSource(next);
  }, [features, messageSource, setMessageSource]);

  // Switching mail off pauses every mailbox; switching it back on resumes them.
  // While mail is on, the panel's own receive switch is left to the user.
  const mailConfigured = qqMail.anyConfigured;
  const mailReceiving = qqMail.anyReceiving;
  const setMailReceiving = qqMail.setAllEnabled;
  const mailSwitch = settings.mailEnabled;
  const lastMailSwitchRef = useRef(mailSwitch);
  useEffect(() => {
    if (!mailConfigured) return;
    if (!mailSwitch && mailReceiving) {
      void setMailReceiving(false);
    } else if (mailSwitch && !lastMailSwitchRef.current && !mailReceiving) {
      void setMailReceiving(true);
    }
    lastMailSwitchRef.current = mailSwitch;
  }, [mailConfigured, mailReceiving, mailSwitch, setMailReceiving]);

  const openEnabledPage = useCallback((target: IslandPage, reason?: IslandModeReason) => {
    const next = resolveIslandPage(target, features);
    if (next) openIslandPage(next, reason);
  }, [features, openIslandPage]);

  return { features, openEnabledPage };
}

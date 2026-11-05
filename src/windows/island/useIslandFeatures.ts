import { useCallback, useEffect, useMemo, useRef } from "react";
import type { IslandSettings } from "../../features/appearance/types";
import type { MessageView } from "../../features/messages/Messages";
import type { QQMailController } from "../../features/messages/qq-mail/QQMail";
import { resolveIslandPage, resolveMessageSource, type IslandFeatures } from "./features";
import type { IslandPage, PluginPageId } from "./types";

type IslandFeatureOptions = {
  settings: IslandSettings;
  clipboardEnabled: boolean;
  qqEnabled: boolean;
  wechatEnabled: boolean;
  qqMail: QQMailController;
  page: IslandPage;
  messageSource: MessageView;
  setPage: (page: IslandPage) => void;
  setMessageSource: (source: MessageView) => void;
  openIslandPage: (page: IslandPage) => void;
  /** Plugin pages to show, in order. */
  pluginPages?: readonly PluginPageId[];
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
  qqMail,
  page,
  messageSource,
  setPage,
  setMessageSource,
  openIslandPage,
  pluginPages,
}: IslandFeatureOptions) {
  const features = useMemo<IslandFeatures>(() => ({
    todo: settings.todoEnabled,
    music: settings.musicEnabled,
    clipboard: clipboardEnabled,
    shelf: settings.shelfEnabled,
    qq: qqEnabled,
    wechat: wechatEnabled,
    qqMail: settings.mailEnabled,
    agents: settings.agentStatusEnabled,
    translation: settings.translationEnabled && settings.translationTarget === "island",
    pluginPages,
  }), [pluginPages, clipboardEnabled, qqEnabled, settings.agentStatusEnabled, settings.mailEnabled, settings.musicEnabled, settings.shelfEnabled, settings.todoEnabled, settings.translationEnabled, settings.translationTarget, wechatEnabled]);

  useEffect(() => {
    const next = resolveIslandPage(page, features);
    if (next && next !== page) setPage(next);
  }, [features, page, setPage]);

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

  const openEnabledPage = useCallback((target: IslandPage) => {
    const next = resolveIslandPage(target, features);
    if (next) openIslandPage(next);
  }, [features, openIslandPage]);

  return { features, openEnabledPage };
}

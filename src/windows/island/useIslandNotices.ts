import { useQQNotifications } from "../../features/messages/qq-notifications/QQNotifications";
import { useWeChatReminders } from "../../features/messages/wechat/WeChatReminders";
import { useMail } from "../../features/messages/mail/MailPanel";
import { usePluginNotifications } from "../../features/plugins/usePluginNotifications";
import { useDeviceUse } from "../../features/device-use/useDeviceUse";
import { useLevelPopup } from "../../features/system-levels/useLevelPopup";
import { usePluginPermissionPrompts } from "../../features/plugins/usePluginPermissionPrompts";
import type { IslandSettings } from "../../features/appearance/types";
import type { IslandMode } from "./types";

/**
 * What can pop up on the collapsed island: message previews (QQ, WeChat, mail, plugins), the
 * camera / microphone hint, the volume or brightness popup and plugins' permission questions.
 */
export function useIslandNotices(settings: IslandSettings, { mode, isTucked, quiet }: { mode: IslandMode; isTucked: boolean; quiet: boolean }) {
  // A tucked island still takes message previews when it will slide out to show them.
  const canPreviewMessages = !quiet && mode === "collapsed" && (!isTucked || settings.revealOnMessage);
  const qqNotifications = useQQNotifications(canPreviewMessages);
  const wechatReminders = useWeChatReminders(canPreviewMessages);
  const qqMail = useMail(canPreviewMessages);
  const pluginNotifications = usePluginNotifications(canPreviewMessages);
  const deviceUse = useDeviceUse(settings.deviceUseIndicator);
  const levelPopup = useLevelPopup(settings.levelPopup, !quiet && mode === "collapsed" && !isTucked);
  const permissionPrompts = usePluginPermissionPrompts();
  const hasMessagePreview = Boolean(
    qqNotifications.preview || wechatReminders.previewReceivedAt !== null || qqMail.preview || pluginNotifications.notification,
  );
  return { qqNotifications, wechatReminders, qqMail, pluginNotifications, deviceUse, levelPopup, permissionPrompts, hasMessagePreview };
}

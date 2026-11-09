import { useQQNotifications } from "../../features/messages/qq-notifications/QQNotifications";
import { useWeChatReminders } from "../../features/messages/wechat/WeChatReminders";
import { useMail } from "../../features/messages/mail/MailPanel";
import type { IslandSettings } from "../../features/appearance/types";
import type { IslandMode } from "./types";

/** What can pop up on the collapsed island: message previews (QQ, WeChat, mail). */
export function useIslandNotices(settings: IslandSettings, { mode, isTucked, quiet }: { mode: IslandMode; isTucked: boolean; quiet: boolean }) {
  // A tucked island still takes message previews when it will slide out to show them.
  const canPreviewMessages = !quiet && mode === "collapsed" && (!isTucked || settings.revealOnMessage);
  const qqNotifications = useQQNotifications(canPreviewMessages);
  const wechatReminders = useWeChatReminders(canPreviewMessages);
  const qqMail = useMail(canPreviewMessages);
  const hasMessagePreview = Boolean(
    qqNotifications.preview || wechatReminders.previewReceivedAt !== null || qqMail.preview,
  );
  return { qqNotifications, wechatReminders, qqMail, hasMessagePreview };
}

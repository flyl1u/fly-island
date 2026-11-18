import { useState } from "react";
import { useQQNotifications } from "../../features/messages/qq-notifications/QQNotifications";
import { useWeChatReminders } from "../../features/messages/wechat/WeChatReminders";
import { useMail } from "../../features/messages/mail/MailPanel";
import { usePluginPreview } from "../../features/messages/pluginNotifications";
import { latestMessagePreview, type MessagePreview } from "../../features/messages/messagePreview";
import type { QQNotificationsController } from "../../features/messages/qq-notifications/QQNotifications";
import type { WeChatRemindersController } from "../../features/messages/wechat/WeChatReminders";
import type { MailController } from "../../features/messages/mail/MailPanel";
import type { IslandSettings } from "../../features/appearance/types";
import type { IslandMode } from "./types";
import { canPreviewNotice, previewSecondsFor } from "./noticeRules";

/** What can pop up on the collapsed island: message previews (QQ, WeChat, mail). */
export function useIslandNotices(settings: IslandSettings, { mode, isTucked, quiet }: { mode: IslandMode; isTucked: boolean; quiet: boolean }) {
  // A tucked island still takes message previews when it will slide out to show them. Game mode
  // holds them back unless asked to show them anyway (gameShowNotices), then without taking clicks.
  const canPreviewMessages = canPreviewNotice(settings, quiet, mode, isTucked);
  const previewSeconds = previewSecondsFor(settings, quiet);
  const qqNotifications = useQQNotifications(canPreviewMessages, previewSeconds);
  const wechatReminders = useWeChatReminders(canPreviewMessages, { previewSeconds });
  const qqMail = useMail(canPreviewMessages, { previewSeconds, autoCopyOtp: settings.autoCopyOtp, previewBody: settings.messageAutoExpand });
  // Plugin previews keep their own 8 s unless an adaptive or game-mode duration applies.
  const pluginPreview = usePluginPreview(canPreviewMessages, settings.messageAutoExpand || quiet ? previewSeconds : undefined);
  const preview = useLatestPreview(qqNotifications, wechatReminders, pluginPreview, qqMail);
  const hasMessagePreview = Boolean(
    qqNotifications.preview || wechatReminders.preview || qqMail.preview || pluginPreview,
  );
  return { qqNotifications, wechatReminders, qqMail, preview, hasMessagePreview };
}

/**
 * The newest preview of the sources, for the collapsed island; one that arrived earlier never takes
 * the place of a newer one, even when the newer one has already gone.
 */
export function useLatestPreview(
  qqNotifications: QQNotificationsController,
  wechatReminders: WeChatRemindersController,
  pluginPreview: MessagePreview | null,
  qqMail: MailController,
): MessagePreview | null {
  const [latestPreviewAt, setLatestPreviewAt] = useState(0);
  const qqPreview = qqNotifications.preview;
  const preview = latestMessagePreview([
    qqPreview ? { ...qqPreview, source: "qq", receivedAt: qqNotifications.previewReceivedAt ?? 0 } : null,
    wechatReminders.preview,
    pluginPreview,
    qqMail.preview ? { source: "qqMail", title: qqMail.preview.sender, body: qqMail.preview.subject, detail: qqMail.previewContent,
      detailLoading: qqMail.previewContentLoading, detailError: qqMail.previewContentError,
      otpCode: qqMail.preview.otpCode, receivedAt: qqMail.previewReceivedAt ?? 0 } : null,
  ], latestPreviewAt);
  if (preview && preview.receivedAt > latestPreviewAt) setLatestPreviewAt(preview.receivedAt);
  return preview;
}

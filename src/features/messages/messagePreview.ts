import zhCN from "../../i18n/locales/zh-CN.ts";
import type { Translations } from "../../i18n/types";

export type OfficeSource = "dingtalk" | "feishu" | "wecom";
export type MessageSource = "qq" | "wechat" | "qqMail" | "plugin" | OfficeSource;
export const OFFICE_SOURCES: readonly OfficeSource[] = ["dingtalk", "feishu", "wecom"];
export function isOfficeSource(source: MessageSource): source is OfficeSource {
  return (OFFICE_SOURCES as readonly string[]).includes(source);
}
export type MessagePreview = {
  source: MessageSource;
  title: string;
  body: string;
  /** Loaded on demand for adaptive mail notices; the ordinary one-line preview keeps its subject. */
  detail?: string | null;
  detailLoading?: boolean;
  detailError?: string | null;
  receivedAt: number;
  wechatMessageId?: string;
  otpCode?: string | null;
};

export const MESSAGE_SOURCE_LABELS: Record<MessageSource, string> = zhCN.messages.sourceLabels;

export function messagePreviewText(preview: MessagePreview, copy: Translations["messages"] = zhCN.messages): string {
  if (preview.source === "wechat" && !preview.title.trim()) return copy.wechatPreview;
  if (isOfficeSource(preview.source)) return copy.newMessage;
  if (preview.source === "qqMail") return preview.otpCode
    ? `${preview.body.trim() || copy.newMail} · ${preview.otpCode}` : preview.body.trim() || copy.newMail;
  return copy.qqPreview(preview.title.trim() || "QQ", preview.body.trim() || copy.newMessage);
}

/**
 * The preview split for the adaptive reader (MessageNoticeReader): who sent it, and the whole
 * text. Mail shows the sender and the subject; a WeChat reminder without a sender its generic line.
 */
export function noticeText(preview: MessagePreview, copy: Translations["messages"] = zhCN.messages): { sender: string; body: string } {
  if (preview.source === "wechat" && !preview.title.trim()) return { sender: copy.sourceLabels.wechat, body: copy.wechatPreview };
  if (preview.source === "qqMail") return { sender: preview.title.trim() || copy.sourceLabels.qqMail,
    body: [preview.body.trim() || copy.newMail, preview.detail?.trim()].filter(Boolean).join("\n\n") };
  return { sender: preview.title.trim() || copy.sourceLabels[preview.source], body: preview.body.trim() || copy.newMessage };
}

export function latestMessagePreview(candidates: (MessagePreview | null)[], latestReceivedAt = -Infinity): MessagePreview | null {
  return candidates.reduce<MessagePreview | null>(
    (latest, candidate) => candidate && candidate.receivedAt >= latestReceivedAt
      && (!latest || candidate.receivedAt > latest.receivedAt) ? candidate : latest,
    null,
  );
}

export function mailBadgeCount(count: number): string {
  return count > 99 ? "99+" : String(count);
}

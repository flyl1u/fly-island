import qqIcon from "../../assets/brands/qq.png";
import wechatIcon from "../../assets/brands/wechat.png";
import qqMailIcon from "../../assets/brands/qq-mail.png";
import { Puzzle } from "lucide-react";
import type { MessageSource, PreviewSource } from "./messagePreview";
import "./MessageSourceIcon.css";

const SOURCE_ICONS: Record<MessageSource, string> = {
  qq: qqIcon,
  wechat: wechatIcon,
  qqMail: qqMailIcon,
};

export function MessageSourceIcon({ source, size = 16 }: { source: PreviewSource; size?: number }) {
  if (source === "plugin") {
    return <Puzzle className="message-brand-icon message-brand-icon--plugin" size={size} strokeWidth={2.2} aria-hidden="true" />;
  }
  return <img className={`message-brand-icon message-brand-icon--${source}`} src={SOURCE_ICONS[source]} alt="" aria-hidden="true" width={size} height={size} draggable={false} />;
}

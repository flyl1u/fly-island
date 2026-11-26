import dingtalkIcon from "../../../assets/brands/dingtalk.svg";
import feishuIcon from "../../../assets/brands/feishu.svg";
import wecomIcon from "../../../assets/brands/wecom.svg";
import telegramIcon from "../../../assets/brands/telegram.svg";
import cursorIcon from "../../../assets/brands/cursor.svg";
import kimiCodeIcon from "../../../assets/brands/kimi-code.svg";
import zcodeIcon from "../../../assets/brands/zcode.svg";
import hermesIcon from "../../../assets/brands/hermes.svg";
import type { NativePluginId } from "./catalog";
import "./NativePluginIcon.css";

const BRAND_ICONS = {
  dingtalk: dingtalkIcon,
  feishu: feishuIcon,
  wecom: wecomIcon,
  telegram: telegramIcon,
  cursor: cursorIcon,
  kimiCode: kimiCodeIcon,
  zcode: zcodeIcon,
  hermes: hermesIcon,
} satisfies Partial<Record<NativePluginId, string>>;

export type BrandPluginId = keyof typeof BRAND_ICONS;

export function isBrandPluginId(id: string): id is BrandPluginId {
  return id in BRAND_ICONS;
}

/** A branded plugin's square app tile, rounded like the WeChat and Agent icons. */
export function NativePluginIcon({ id, size = 16, className = "" }: { id: BrandPluginId; size?: number; className?: string }) {
  return <img className={`native-plugin-icon ${className}`.trim()} src={BRAND_ICONS[id]} alt="" aria-hidden="true" width={size} height={size} draggable={false} />;
}

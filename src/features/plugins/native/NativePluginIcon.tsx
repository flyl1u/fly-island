import dingtalkIcon from "../../../assets/brands/dingtalk.svg";
import feishuIcon from "../../../assets/brands/feishu.svg";
import wecomIcon from "../../../assets/brands/wecom.svg";
import cursorIcon from "../../../assets/brands/cursor.svg";
import kimiCodeIcon from "../../../assets/brands/kimi-code.svg";
import zcodeIcon from "../../../assets/brands/zcode.svg";
import hermesIcon from "../../../assets/brands/hermes.svg";
import type { NativePluginId } from "./catalog";
import "./NativePluginIcon.css";

export const NATIVE_PLUGIN_ICONS: Record<NativePluginId, string> = {
  dingtalk: dingtalkIcon,
  feishu: feishuIcon,
  wecom: wecomIcon,
  cursor: cursorIcon,
  kimiCode: kimiCodeIcon,
  zcode: zcodeIcon,
  hermes: hermesIcon,
};

/** A plugin's square app tile, rounded like the WeChat and Agent icons. */
export function NativePluginIcon({ id, size = 16, className = "" }: { id: NativePluginId; size?: number; className?: string }) {
  return <img className={`native-plugin-icon ${className}`.trim()} src={NATIVE_PLUGIN_ICONS[id]} alt="" aria-hidden="true" width={size} height={size} draggable={false} />;
}

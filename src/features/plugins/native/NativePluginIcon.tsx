import { BatteryCharging, CalendarDays, CloudSun } from "lucide-react";
import dingtalkIcon from "../../../assets/brands/dingtalk.svg";
import feishuIcon from "../../../assets/brands/feishu.svg";
import wecomIcon from "../../../assets/brands/wecom.svg";
import cursorIcon from "../../../assets/brands/cursor.svg";
import kimiCodeIcon from "../../../assets/brands/kimi-code.svg";
import zcodeIcon from "../../../assets/brands/zcode.svg";
import hermesIcon from "../../../assets/brands/hermes.svg";
import type { NativePluginId } from "./catalog";
import "./NativePluginIcon.css";

export const NATIVE_PLUGIN_ICONS: Record<Exclude<NativePluginId, "clockWeather" | "calendarMarks" | "battery">, string> = {
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
  if (id === "calendarMarks") return <span className={`native-plugin-icon native-plugin-icon--calendar ${className}`.trim()}
    style={{ width: size, height: size }} aria-hidden="true"><CalendarDays size={size * 0.72} strokeWidth={1.5} /></span>;
  if (id === "clockWeather") return <span className={`native-plugin-icon native-plugin-icon--weather ${className}`.trim()}
    style={{ width: size, height: size }} aria-hidden="true"><CloudSun size={size * 0.72} strokeWidth={1.5} /></span>;
  if (id === "battery") return <span className={`native-plugin-icon native-plugin-icon--battery ${className}`.trim()}
    style={{ width: size, height: size }} aria-hidden="true"><BatteryCharging size={size * 0.64} strokeWidth={2} /></span>;
  return <img className={`native-plugin-icon ${className}`.trim()} src={NATIVE_PLUGIN_ICONS[id]} alt="" aria-hidden="true" width={size} height={size} draggable={false} />;
}

import centeredClockIcon from "../../../assets/plugins/centered-clock.svg";
import relayIcon from "../../../assets/plugins/relay.svg";
import appleMusicLyricsIcon from "../../../assets/plugins/apple-music-lyrics.svg";
import screenshotIcon from "../../../assets/plugins/screenshot.svg";
import batteryIcon from "../../../assets/plugins/battery.svg";
import dingtalkIcon from "../../../assets/brands/dingtalk.svg";
import feishuIcon from "../../../assets/brands/feishu.svg";
import wecomIcon from "../../../assets/brands/wecom.svg";
import telegramIcon from "../../../assets/brands/telegram.svg";
import cursorIcon from "../../../assets/brands/cursor.svg";
import kimiCodeIcon from "../../../assets/brands/kimi-code.svg";
import zcodeIcon from "../../../assets/brands/zcode.svg";
import hermesIcon from "../../../assets/brands/hermes.svg";
import codebuddyIcon from "../../../assets/brands/codebuddy.svg";
import antigravityIcon from "../../../assets/brands/antigravity.svg";
import minimaxIcon from "../../../assets/brands/minimax.png";
import calendarMarksIcon from "../../../assets/plugins/calendar-marks.svg";
import clockWeatherIcon from "../../../assets/plugins/clock-weather.svg";
import deviceBatteryIcon from "../../../assets/plugins/device-battery.svg";
import eyeCareIcon from "../../../assets/plugins/eye-care.svg";
import type { MarketPluginId } from "./catalog";
import "./NativePluginIcon.css";

// Every market plugin has a full-colour app icon: the brand's own mark, or one drawn here (assets/plugins).
const APP_ICONS: Readonly<Record<MarketPluginId, string>> = {
  centeredClock: centeredClockIcon,
  relay: relayIcon,
  appleMusicLyrics: appleMusicLyricsIcon,
  screenshot: screenshotIcon,
  dingtalk: dingtalkIcon,
  feishu: feishuIcon,
  wecom: wecomIcon,
  telegram: telegramIcon,
  cursor: cursorIcon,
  kimiCode: kimiCodeIcon,
  codebuddy: codebuddyIcon,
  antigravity: antigravityIcon,
  zcode: zcodeIcon,
  hermes: hermesIcon,
  battery: batteryIcon,
  clockWeather: clockWeatherIcon,
  calendarMarks: calendarMarksIcon,
  minimax: minimaxIcon,
  "device-battery": deviceBatteryIcon,
  "eye-care": eyeCareIcon,
};

/** Marks that are round themselves: no square shadow behind them on the card. */
const ROUND_ICONS: ReadonlySet<MarketPluginId> = new Set(["telegram", "codebuddy", "antigravity"]);

export function hasPluginAppIcon(id: string): id is MarketPluginId {
  return Object.prototype.hasOwnProperty.call(APP_ICONS, id);
}

/** A plugin's square app tile, rounded like the WeChat and Agent icons. */
export function NativePluginIcon({ id, size = 16, className = "" }: { id: MarketPluginId; size?: number; className?: string }) {
  const round = ROUND_ICONS.has(id) ? " native-plugin-icon--round" : "";
  return <img className={`native-plugin-icon${round} ${className}`.trim()} src={APP_ICONS[id]} alt="" aria-hidden="true"
    data-plugin-icon={id} width={size} height={size} draggable={false} />;
}

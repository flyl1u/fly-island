import { readJson, writeJson } from "../../lib/storage.ts";
import type { MessageSource } from "./messagePreview.ts";

/** The Messages page's tab order, as rearranged by press-and-hold dragging. */
export const MESSAGE_SOURCE_ORDER_KEY = "fly-island-message-source-order";

export const DEFAULT_SOURCE_ORDER: readonly MessageSource[] = ["wechat", "qq", "qqMail", "dingtalk", "feishu", "wecom", "plugin"];

/** A saved order with unknown entries dropped and sources it lacks (new ones) added at the end. */
export function normalizeSourceOrder(value: unknown): MessageSource[] {
  const saved = Array.isArray(value) ? value.filter((item): item is MessageSource => DEFAULT_SOURCE_ORDER.includes(item as MessageSource)) : [];
  const unique = [...new Set(saved)];
  return [...unique, ...DEFAULT_SOURCE_ORDER.filter((source) => !unique.includes(source))];
}

export function loadSourceOrder(): MessageSource[] {
  return normalizeSourceOrder(readJson(MESSAGE_SOURCE_ORDER_KEY));
}

export function saveSourceOrder(order: readonly MessageSource[]) {
  return writeJson(MESSAGE_SOURCE_ORDER_KEY, order);
}

/**
 * `order` with `moving` placed where `target` is among the `visible` tabs: hidden sources keep
 * their places, so switching one back on puts its tab where it was.
 */
export function moveSource(order: readonly MessageSource[], visible: readonly MessageSource[], moving: MessageSource, target: MessageSource): MessageSource[] {
  if (moving === target) return [...order];
  const shown = visible.filter((source) => source !== moving);
  const at = visible.indexOf(target) > visible.indexOf(moving) ? shown.indexOf(target) + 1 : shown.indexOf(target);
  shown.splice(at, 0, moving);
  let next = 0;
  return order.map((source) => visible.includes(source) ? shown[next++] : source);
}

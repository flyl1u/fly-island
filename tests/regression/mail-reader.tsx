// Open /tests/mail-reader.html?run=1 with pnpm dev. No real accounts or native actions are used.
import { act, StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import "../../src/styles/tokens.css";
import { emit } from "@tauri-apps/api/event";
import { useMail, type MailController, sanitizeMailHtml } from "../../src/features/messages/mail/MailPanel";
import type { MailContent, MailSnapshot } from "../../src/features/messages/mail/api";
import { useQQNotifications } from "../../src/features/messages/qq-notifications/QQNotifications";
import { useWeChatReminders } from "../../src/features/messages/wechat/WeChatReminders";
import { MessagesPanel, messagePanelHeight, type MessageView } from "../../src/features/messages/Messages";
import "../../src/windows/island/IslandApp.css";

Object.assign(globalThis, { isTauri: true, IS_REACT_ACT_ENVIRONMENT: true });
const params = new URLSearchParams(location.search);
const state = params.get("state") ?? "qq";
const now = Date.now();
const keys = ["focusd-island-qq-mail-settings", "focusd-island-qq-mail-remote-images", "focusd-island-qq-notifications-enabled", "focusd-island-wechat-reminders-enabled", "focusd-island-qq-notification-access-requested"];
const original = keys.map(key => localStorage.getItem(key));
keys.forEach(key => localStorage.removeItem(key));
const calls: { command: string; args: Record<string, unknown> }[] = [];
let revision = 0;
let mail: MailController;
let view: MessageView;
let setView: (source: MessageView) => void;
let readBehavior = async (id: string): Promise<MailContent> => ({ id, attachments: [], contentType: "text/plain", content: "你好，\n\n本周的开发工作已完成，请查看下面的安排：\n\n1. 周二完成消息界面验收。\n2. 周四讨论下个版本。\n3. 周五汇总反馈。\n\n谢谢。\n产品团队" });
let snapshot: MailSnapshot = {
  revision: ++revision, email: "demo@qq.com", configured: state !== "disconnected", enabled: true, syncing: false,
  status: state === "auth" ? "authRequired" : state === "disconnected" ? "disconnected" : "connected",
  unreadCount: state === "disconnected" ? null : state === "empty" ? 0 : 3, items: state === "empty" || state === "disconnected" ? [] : Array.from({ length: 12 }, (_, index) => ({
    id: `7:${20 - index}`, uid: 20 - index, sender: index === 0 ? "产品团队 <team@example.com>" : `协作团队 ${index}`,
    subject: index === 0 ? "项目周报与下周安排" : `工作进展 ${index}`, receivedAt: now - index * 60_000, unread: index < 3,
  })), lastSyncedAt: now, error: state === "auth" ? "授权码已失效，请重新连接。" : null,
};

mockIPC((command, payload) => {
  const args = (payload ?? {}) as Record<string, unknown>;
  calls.push({ command, args });
  switch (command) {
    case "get_qq_mail_state": return snapshot.configured || snapshot.status !== "disconnected" ? [snapshot] : [];
    case "read_qq_mail": return readBehavior(String(args.messageId));
    case "disconnect_qq_mail": snapshot = { ...snapshot, revision: ++revision, configured: false, enabled: false, status: "disconnected", items: [], unreadCount: null }; return snapshot;
    case "save_qq_mail_attachment": return "C:\\Users\\demo\\Downloads\\季度报告.pdf";
    case "mark_qq_mail_read": snapshot = { ...snapshot, revision: ++revision, unreadCount: Math.max(0, (snapshot.unreadCount ?? 0) - 1), items: snapshot.items.map(item => item.id === args.messageId ? { ...item, unread: false } : item) }; return snapshot;
    case "set_qq_mail_enabled": snapshot = { ...snapshot, revision: ++revision, enabled: Boolean(args.enabled), status: args.enabled ? "connected" : "paused" }; return snapshot;
    case "request_qq_notification_access": return "allowed";
    case "set_qq_notifications_enabled": return { revision: ++revision, enabled: args.enabled, status: "listening", error: null, items: state === "empty" || state === "disconnected" ? [] : [{ id: "qq:1", title: "设计讨论组", body: "新版界面已准备好，方便时看一下。", createdAt: now - 30_000 }] };
    case "set_wechat_reminders_enabled": return { revision: ++revision, enabled: args.enabled, status: !args.enabled ? "disabled" : state === "wechatError" ? "error" : "listening", pending: Boolean(args.enabled) && state !== "empty" && state !== "disconnected", lastAttentionAt: !args.enabled || state === "empty" || state === "disconnected" ? null : now - 120_000, error: args.enabled && state === "wechatError" ? "微信提醒连接失败，正在重试。" : null };
    default: return null;
  }
}, { shouldMockEvents: true });

function Fixture() {
  mail = useMail(false);
  const qqNotifications = useQQNotifications(false);
  const wechatReminders = useWeChatReminders(false);
  [view, setView] = useState<MessageView>(["reader", "html", "loading", "error", "auth", "mail", "disconnected"].includes(state) ? "qqMail" : ["wechat", "wechatError"].includes(state) ? "wechat" : "qq");
  const height = messagePanelHeight(view, mail.wantsTallPanel);
  return <section className="message-fixture" style={{ height }}><header className="fixture-heading">fly-island<span>消息</span></header><div className="message-panel"><MessagesPanel source={view} enabledSources={{ qq: true, wechat: true, qqMail: true }} onSourceChange={next => { mail.closeReader(); setView(next); }} onOpenMailSettings={() => calls.push({ command: "open_mail_settings", args: {} })} qqMail={mail} qqNotifications={qqNotifications} wechatReminders={wechatReminders} /></div></section>;
}

const root = createRoot(document.getElementById("fixture")!);
const messages: string[] = [];
function check(condition: unknown, label: string) { if (!condition) throw new Error(label); messages.push(`PASS ${label}`); }
const button = (label: string) => {
  const result = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).filter(item => item.getAttribute("aria-label") === label || item.textContent === label);
  if (result.length !== 1) throw new Error(`Expected one button ${label}, got ${result.length}`);
  return result[0];
};
const click = async (label: string) => { await act(async () => { button(label).click(); }); };
const deferred = () => {
  let resolve!: (value: MailContent) => void;
  const promise = new Promise<MailContent>(done => { resolve = done; });
  return { promise, resolve };
};

try {
  await act(async () => { root.render(<StrictMode><Fixture /></StrictMode>); });
  if (params.get("run") === "1") {
    check(view! === "qq" && document.querySelector('.message-sources')?.textContent?.replace(/\d/g, "") === "QQ微信邮箱", "恢复 QQ、微信、邮箱三项品牌导航");
    check(!document.querySelector('.wechat-reminder-card, .message-overview') && !document.querySelector('button[aria-label="消息总览"]'), "微信没有被抽成独立卡片或总览");
    check(document.querySelector<HTMLElement>('.message-fixture')?.style.height === "350px", "列表恢复截图中的固定面板高度");
    await click("微信提醒");
    const launch = document.querySelector<HTMLButtonElement>('.qq-panel__empty button.wechat-launch');
    check(view! === "wechat" && launch?.classList.contains("wechat-launch--pending") && launch.textContent?.includes("有新提醒") && launch.textContent.includes("点击打开微信"),
      "微信标签中间是可点击的图标、\"有新提醒\"和\"点击打开微信\"");
    check(!document.querySelector('.qq-panel__header button[aria-label="打开微信"]') && document.querySelectorAll('.qq-panel__header .qq-panel__toolbar button').length === 1,
      "微信标签顶栏只剩接收开关，没有右上角的打开箭头");
    await act(async () => { launch!.click(); });
    check(calls.some(call => call.command === "open_wechat"), "点击微信图标调用已有的唤回命令");
    await click("接收微信提醒");
    check(document.querySelector('.qq-panel__empty')?.textContent?.includes("已暂停") && document.querySelector('button[aria-label="接收微信提醒"]')?.getAttribute("aria-checked") === "false", "暂停微信提醒后保持正确状态");
    await click("接收微信提醒");
    await click("QQ 通知");
    check(view! === "qq" && document.querySelector('[aria-label="QQ 最近通知"]'), "切回 QQ 显示自己的通知列表");
    await click("邮箱");
    const list = document.querySelector<HTMLDivElement>('.qq-mail-list')!;
    list.scrollTop = 120;
    list.dispatchEvent(new Event("scroll", { bubbles: true }));
    const scrollBefore = list.scrollTop;
    const pending = deferred();
    readBehavior = () => pending.promise;
    await click("阅读邮件：项目周报与下周安排，未读");
    check(view! === "qqMail" && mail!.reading && document.querySelector('[aria-label="邮件阅读"]'), "点击邮件在岛内打开阅读页并显示加载状态");
    check(!calls.some(call => call.command === "plugin:opener|open_url"), "点邮件不会打开浏览器");
    check(document.activeElement?.getAttribute("aria-label") === "邮件正文", "阅读页接收键盘焦点");
    await act(async () => { pending.resolve({ id: "7:20", attachments: [], contentType: "text/html", content: '<h2>下周安排</h2><p>保留正文</p><script>window.readerPwned=true</script><img src="https://tracking.example.com/pixel" onerror="alert(1)"><iframe src="https://tracking.example.com/"></iframe><form><input></form><style>body{display:none}</style><a href="javascript:alert(1)">危险链接</a><a href="https://example.com/report">查看周报</a><table><tr><td>会议</td><td>周二</td></tr></table>' }); await pending.promise; });
    const body = document.querySelector(".qq-mail-body")!;
    check(body.textContent?.includes("保留正文") && !body.querySelector("script,iframe,form,input,style,svg"), "HTML 正文保留排版并去除脚本和嵌入内容");
    check(!body.querySelector("img") && document.querySelector(".qq-mail-remote")?.textContent?.includes("已阻止 1 张远程图片"), "远程图片默认不加载并提示被拦数量");
    await click("显示图片");
    const remoteImage = body.querySelector("img");
    check(remoteImage?.getAttribute("src") === "https://tracking.example.com/pixel" && remoteImage.getAttribute("referrerpolicy") === "no-referrer" && !remoteImage.hasAttribute("onerror"), "允许后远程图片保留但禁止外发 referrer 并剔除事件属性");
    check(!document.querySelector(".qq-mail-remote") && localStorage.getItem("focusd-island-qq-mail-remote-images") === "true", "放行后隐藏提示并记住开关选择");
    check(!body.querySelector('a[href^="javascript"]'), "邮件不能执行危险链接");
    check(!Reflect.get(window, "readerPwned"), "邮件脚本没有执行");
    await act(async () => { body.querySelector<HTMLAnchorElement>('a[href="https://example.com/report"]')!.click(); });
    check(calls.some(call => call.command === "plugin:opener|open_url" && call.args.url === "https://example.com/report"), "正文中的网页链接通过系统浏览器打开");
    check(mail!.snapshot.unreadCount === 3 && mail!.snapshot.items[0].unread, "阅读保持未读状态和角标数量");
    await click("返回列表");
    check(view! === "qqMail" && !mail!.selectedMail && document.querySelector<HTMLDivElement>('.qq-mail-list')!.scrollTop === scrollBefore, "返回邮箱列表并保留滚动位置");
    check((document.activeElement as HTMLElement)?.dataset.mailId === "7:20", "返回列表时恢复原邮件的键盘焦点");

    await click("邮箱");
    readBehavior = async id => ({ id, attachments: [], contentType: "text/plain", content: '<img src=x onerror=alert(1)>\n纯文本邮件' });
    await click("阅读邮件：项目周报与下周安排，未读");
    check(document.querySelector(".qq-mail-body--text")?.textContent?.includes("<img") && !document.querySelector(".qq-mail-body img"), "纯文本邮件按文字显示，不解释为 HTML");
    await click("返回列表");
    check(view! === "qqMail", "从邮箱列表进入后返回邮箱列表");
    check((document.activeElement as HTMLElement)?.dataset.mailId === "7:20", "返回邮箱列表时恢复原邮件的键盘焦点");

    readBehavior = async () => { throw new Error("网络中断，请重试。"); };
    await click("阅读邮件：项目周报与下周安排，未读");
    check(document.querySelector('[role="alert"]')?.textContent?.includes("网络中断"), "正文失败保留标题和当前位置并允许重试");
    readBehavior = async id => ({ id, attachments: [], contentType: "text/plain", content: "恢复后的正文" });
    await click("重试");
    check(document.querySelector(".qq-mail-body")?.textContent === "恢复后的正文", "重试恢复正文");
    await click("返回列表");

    const stale = deferred();
    readBehavior = () => stale.promise;
    await click("阅读邮件：项目周报与下周安排，未读");
    await click("返回列表");
    readBehavior = async id => ({ id, attachments: [], contentType: "text/plain", content: "第二封正文" });
    await click("阅读邮件：工作进展 1，未读");
    await act(async () => { stale.resolve({ id: "7:20", attachments: [], contentType: "text/plain", content: "过期的第一封正文" }); await stale.promise; });
    check(mail!.selectedMail?.id === "7:19" && mail!.content?.content === "第二封正文", "快速返回和切换后，旧请求不会覆盖当前邮件");

    await click("返回列表");
    readBehavior = async id => ({ id, attachments: [{ part: "2", name: "季度报告.pdf", size: 2_150_400, mime: "application/pdf" }], contentType: "text/plain", content: "第三封正文" });
    await click("阅读邮件：工作进展 2，未读");
    check(!calls.some(call => call.command === "mark_qq_mail_read"), "只是阅读不会把邮件标为已读");
    await click("标为已读");
    check(calls.some(call => call.command === "mark_qq_mail_read" && call.args.email === "demo@qq.com" && call.args.messageId === "7:18")
      && ![...document.querySelectorAll("button")].some(button => button.textContent === "标为已读")
      && mail!.snapshot.unreadCount === 2,
      "标为已读发给这封邮件所在的邮箱，之后按钮消失、未读数减一");
    const attachmentRow = document.querySelector(".qq-mail-attachment");
    check(document.querySelector(".qq-mail-attachments__title")?.textContent === "附件（1）"
      && attachmentRow?.textContent?.includes("季度报告.pdf") && attachmentRow.textContent.includes("2.1 MB"),
      "阅读页列出附件的名称和大小");
    await click("保存 · 季度报告.pdf");
    check(calls.some(call => call.command === "save_qq_mail_attachment" && call.args.email === "demo@qq.com" && call.args.messageId === "7:18" && call.args.part === "2")
      && document.querySelector('.qq-mail-attachment button')?.textContent === "已保存",
      "保存附件发给这封邮件的这个分段，完成后显示已保存");

    await click("返回列表");

    const late = deferred();
    readBehavior = () => late.promise;
    await act(async () => { void mail!.readMail(mail!.snapshot.items[0]); });
    await act(async () => { snapshot = { ...snapshot, revision: ++revision, configured: false, status: "disconnected", enabled: false, items: [], unreadCount: null }; await emit("qq-mail-changed", { snapshot, newestId: null, windowVisible: true }); });
    await act(async () => { late.resolve({ id: "7:20", attachments: [], contentType: "text/plain", content: "断开后的敏感正文" }); await late.promise; });
    check(!mail!.selectedMail && !mail!.content && !document.body.textContent?.includes("断开后的敏感正文"), "断开连接后清空正文并忽略在途结果");
    const sanitized = sanitizeMailHtml('<svg><a href="javascript:alert(1)">x</a></svg><p style="background:url(https://tracking.example.com)">safe</p><img src="https://cdn.example.com/a.png" onerror="alert(1)" width="40"><img src="cid:inline@example"><img src="data:image/png;base64,iVBORw0KGgo=">', { allowRemoteImages: true });
    check(!/style=|javascript:|<svg/i.test(sanitized), "清理器剔除脚本、SVG 与内联样式");
    check(/src="https:\/\/cdn\.example\.com\/a\.png"/.test(sanitized) && /referrerpolicy="no-referrer"/.test(sanitized), "允许后远程图片保留并禁止外发 referrer");
    check(!/cid:|onerror/i.test(sanitized), "cid 引用和事件属性不会被保留");
    check(/src="data:image\/png;base64,iVBORw0KGgo="/.test(sanitized), "内嵌图片的 data URI 保留");
    const blocked = sanitizeMailHtml('<p>正文</p><img src="https://cdn.example.com/a.png"><img src="data:image/png;base64,iVBORw0KGgo=">');
    check(!/cdn\.example\.com/.test(blocked) && /data:image\/png/.test(blocked) && /正文/.test(blocked), "默认拦下远程图片但保留正文和内嵌图片");
    const tables = sanitizeMailHtml('<table><thead><tr><th>项目</th><th>进度</th></tr></thead><tbody><tr><td>前端</td><td>80%</td></tr></tbody></table><table><tr><td>图表</td></tr><tr><td>布局</td><td>格</td></tr></table>');
    check(tables.split('data-mail-table="data"').length === 2 && /<table data-mail-table="data">/.test(tables), "只有首行表头的数据表保留网格，图表与布局表不画灰格子");
    document.documentElement.dataset.testResult = "passed";
  } else if (["reader", "html", "loading", "error"].includes(state)) {
    if (state === "loading") readBehavior = () => new Promise(() => {});
    if (state === "error") readBehavior = async () => { throw new Error("无法加载邮件正文，请检查网络并重试。"); };
    if (state === "html") readBehavior = async id => ({ id, attachments: [], contentType: "text/html", content: '<h2>下周工作安排</h2><p>你好，以下是本周确认的计划：</p><table><tr><th>时间</th><th>事项</th></tr><tr><td>周二 14:00</td><td>消息界面验收</td></tr><tr><td>周四 10:00</td><td>下一版本讨论</td></tr></table><p>完整细节见<a href="https://example.com/report">项目周报</a>。</p><blockquote>请在周三之前补充反馈，谢谢。</blockquote>' });
    await act(async () => { void mail!.readMail(mail!.snapshot.items[0]); });
  }
} catch (error) {
  document.documentElement.dataset.testResult = "failed";
  messages.push(`FAIL ${String(error)}`);
  console.error(error);
} finally {
  keys.forEach((key, index) => { if (original[index] === null) localStorage.removeItem(key); else localStorage.setItem(key, original[index]!); });
  document.getElementById("results")!.textContent = messages.length ? messages.join("\n") : "组件预览 · 模拟数据";
}

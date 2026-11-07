// pnpm dev, then open /tests/regression/calendar.html. Renders the calendar page with two days of
// events, the collapsed island's meeting line, and Settings → Calendar with the native side mocked.
import "../../src/styles/tokens.css";
import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import { I18nProvider } from "../../src/i18n";
import type { CalendarEvent, CalendarSnapshot } from "../../src/features/calendar/api";
import { CalendarPanel } from "../../src/features/calendar/CalendarPanel";
import { MeetingLine } from "../../src/features/calendar/MeetingLine";
import { CalendarSourcesSection } from "../../src/features/calendar/CalendarSourcesSection";

Object.assign(globalThis, { isTauri: true, IS_REACT_ACT_ENVIRONMENT: true });
const at = (dayOffset: number, hours: number, minutes = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + dayOffset);
  date.setHours(hours, minutes, 0, 0);
  return date.getTime();
};
const now = at(0, 10, 5);
const event = (title: string, startMs: number, endMs: number, fields: Partial<CalendarEvent> = {}): CalendarEvent => ({
  uid: title, title, startMs, endMs, allDay: false, location: null, meetingLink: null, calendar: "工作", ...fields,
});
const EVENTS: CalendarEvent[] = [
  event("全员假期", at(0, 0), at(1, 0), { allDay: true }),
  event("晨会", at(0, 9), at(0, 9, 30), { meetingLink: "https://meeting.tencent.com/dm/a" }),
  event("设计评审：日历页、会前倒计时和加入会议按钮的最终方案确认与排期", at(0, 10), at(0, 11), { location: "3 楼大会议室", meetingLink: "https://vc.feishu.cn/j/123" }),
  event("1:1", at(1, 15), at(1, 15, 30)),
];
const SNAPSHOT: CalendarSnapshot = { events: EVENTS, problems: [{ sourceId: "x", message: "账号或密码不对" }], fetchedAt: now, sourceCount: 2 };

const calls: Array<{ command: string; payload: Record<string, unknown> }> = [];
let sources = [{ id: "cal-1", kind: "caldav", name: "飞书", url: "https://caldav.feishu.cn", host: "caldav.feishu.cn", username: "u_abc" }];
mockIPC((command, payload) => {
  const args = (payload ?? {}) as Record<string, unknown>;
  calls.push({ command, payload: args });
  if (command === "list_calendar_sources") return sources;
  if (command === "remove_calendar_source") {
    sources = sources.filter((source) => source.id !== args.id);
    return null;
  }
  if (command === "add_calendar_source") {
    if (args.secret === "wrong") throw "日历账号或密码不对。";
    const host = String(args.kind) === "ics" ? new URL(String(args.secret).replace("webcal://", "https://")).host : new URL(String(args.url)).host;
    const added = { id: `cal-${sources.length + 2}`, kind: String(args.kind), name: String(args.name), url: String(args.url), host, username: String(args.username) };
    sources = [...sources, added];
    return added;
  }
  if (command === "plugin:opener|open_url") return null;
  return null;
});

const results = document.getElementById("results")!;
const messages: string[] = [];
function check(condition: unknown, label: string) {
  if (!condition) throw new Error(label);
  messages.push(`PASS ${label}`);
}
const wait = () => new Promise((resolve) => setTimeout(resolve, 40));
const setInput = (input: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
};

try {
  let refreshed = 0;
  let settingsOpened = 0;
  const panel = createRoot(document.getElementById("panel")!);
  await act(async () => {
    panel.render(<StrictMode><I18nProvider><CalendarPanel snapshot={SNAPSHOT} now={now} onRefresh={() => (refreshed += 1)} onOpenSettings={() => (settingsOpened += 1)} /></I18nProvider></StrictMode>);
    await wait();
  });
  const days = [...document.querySelectorAll<HTMLElement>(".calendar-day")];
  const titles = (day: HTMLElement) => [...day.querySelectorAll(".calendar-event__title")].map((title) => title.textContent);
  check(days.length === 2 && days[0].querySelector("h3")?.textContent === "今天" && days[1].querySelector("h3")?.textContent === "明天", "分今天和明天两组");
  check(titles(days[0]).join("|") === "全员假期|晨会|设计评审：日历页、会前倒计时和加入会议按钮的最终方案确认与排期" && titles(days[1]).join("|") === "1:1", "日程按时间排在对应的一天");
  const rows = [...document.querySelectorAll<HTMLElement>(".calendar-event")];
  check(rows[0].querySelector(".calendar-event__time")?.textContent === "全天" && rows[2].querySelector(".calendar-event__time")?.textContent === "10:00–11:00", "全天日程写「全天」，其他写起止时间");
  check(rows[1].classList.contains("calendar-event--past") && !rows[1].querySelector(".calendar-event__join"), "已结束的日程变淡，不再给加入按钮");
  check(rows[2].classList.contains("calendar-event--now") && rows[2].querySelector(".calendar-event__place")?.textContent === "3 楼大会议室 · 工作", "进行中的日程高亮，下面写地点和日历名");
  const title = rows[2].querySelector<HTMLElement>(".calendar-event__title")!;
  check(title.scrollWidth > title.clientWidth && document.getElementById("panel")!.scrollWidth <= 460, "长标题单行省略，不撑宽页面");
  const joinButton = rows[2].querySelector<HTMLButtonElement>(".calendar-event__join")!;
  check(joinButton.getAttribute("aria-label") === "加入「设计评审：日历页、会前倒计时和加入会议按钮的最终方案确认与排期」的会议", "加入按钮的读屏文字说明是哪个会议");
  await act(async () => { joinButton.click(); await wait(); });
  check(calls.some((call) => call.command === "plugin:opener|open_url" && JSON.stringify(call.payload).includes("vc.feishu.cn/j/123")), "点加入打开会议链接");
  check(refreshed >= 1, "打开日历页时重新读取日历");
  check(document.querySelector(".calendar-panel__status")?.textContent === "1 个日历没读到，到设置里看看", "有日历读不到时在顶部提示");

  let added = 0;
  const empty = { ...SNAPSHOT, events: [], problems: [], sourceCount: 0 };
  await act(async () => {
    panel.render(<StrictMode><I18nProvider><CalendarPanel snapshot={empty} now={now} onRefresh={() => (added += 1)} onOpenSettings={() => (settingsOpened += 1)} /></I18nProvider></StrictMode>);
    await wait();
  });
  const emptyButtons = [...document.querySelectorAll<HTMLButtonElement>(".calendar-empty__actions button")];
  check(document.querySelector(".calendar-empty strong")?.textContent === "还没有日历" && emptyButtons.map((button) => button.textContent).join("|") === "订阅中国节假日|添加工作日历",
    "没加日历时，日历页说明怎么加，并能一键订阅节假日");
  const before = added;
  await act(async () => { emptyButtons[0].click(); await wait(); await wait(); });
  check(calls.some((call) => call.command === "add_calendar_source" && call.payload.secret === "https://calendars.icloud.com/holidays/cn_zh.ics") && added > before, "点订阅节假日后重新读取日历");
  await act(async () => { emptyButtons[1].click(); await wait(); });
  check(settingsOpened >= 1, "点添加工作日历打开设置");
  sources = sources.filter((source) => source.host !== "calendars.icloud.com");

  const line = createRoot(document.getElementById("line")!);
  const upcoming = { event: EVENTS[2], minutes: 8 };
  await act(async () => { line.render(<I18nProvider><MeetingLine meeting={upcoming} showTitle /></I18nProvider>); await wait(); });
  const lineTitle = document.querySelector<HTMLElement>(".island-meeting__title")!;
  check(lineTitle.scrollWidth > lineTitle.clientWidth && document.querySelector(".island-meeting__when")?.textContent === "· 8 分钟后", "收起的岛上：标题省略，倒计时始终完整");
  await act(async () => { line.render(<I18nProvider><MeetingLine meeting={{ event: EVENTS[2], minutes: 0 }} showTitle={false} /></I18nProvider>); await wait(); });
  check(document.querySelector(".island-meeting")?.textContent === "会议· 已开始" && document.querySelector(".island-meeting--started"), "不显示标题时只写「会议」，开始后写「已开始」");

  const settings = createRoot(document.getElementById("settings")!);
  await act(async () => { settings.render(<I18nProvider><CalendarSourcesSection /></I18nProvider>); await wait(); });
  check(document.querySelector(".settings-row__title")?.textContent === "飞书" && document.body.textContent?.includes("u_abc · caldav.feishu.cn"), "列出已添加的日历，只显示账号和网站");
  const addButton = () => document.querySelector<HTMLButtonElement>(".calendar-form__add")!;
  const inputs = () => [...document.querySelectorAll<HTMLInputElement>(".calendar-form__field input")];
  const labels = () => [...document.querySelectorAll(".calendar-form__field span")].map((label) => label.textContent).join("|");
  const steps = () => document.querySelector(".calendar-form__steps")?.textContent ?? "";
  const pick = async (label: string) => {
    await act(async () => { document.querySelector<HTMLButtonElement>(".calendar-form .select-control__trigger, .settings-row .select-control__trigger")!.click(); await wait(); });
    const option = [...document.querySelectorAll<HTMLElement>(".select-control__option")].find((item) => item.textContent?.startsWith(label))!;
    await act(async () => { option.click(); await wait(); });
  };
  check(labels() === "账号|密码|名称（可不填）" && steps().includes("CalDAV 同步") && addButton().disabled, "默认选飞书：服务器自动填好，只要账号和密码，并写出在飞书里怎么拿");
  await act(async () => { setInput(inputs()[0], "u_new"); setInput(inputs()[1], "pw"); await wait(); });
  await act(async () => { addButton().click(); await wait(); await wait(); });
  const feishu = calls.filter((call) => call.command === "add_calendar_source").pop()!.payload;
  check(feishu.kind === "caldav" && feishu.url === "https://caldav.feishu.cn" && feishu.name === "飞书" && feishu.secret === "pw", "选飞书时自动用飞书的服务器，名称不填就叫飞书");
  await pick("企业微信");
  check(labels() === "服务器地址|账号|密码|名称（可不填）", "企业微信的服务器要从企业微信里复制，所以多一个服务器地址");
  await pick("Google");
  check(labels() === "订阅链接|名称（可不填）" && inputs()[0].type === "password" && steps().includes("iCal"), "Google 日历只要订阅链接，链接像密码一样遮住");
  await act(async () => { setInput(inputs()[0], "wrong"); await wait(); });
  await act(async () => { addButton().click(); await wait(); });
  check(document.querySelector(".calendar-form__error")?.textContent === "日历账号或密码不对。" && inputs()[0].value === "wrong", "读不到时说明原因，填的内容保留");
  await act(async () => { setInput(inputs()[0], "webcal://calendar.google.com/x.ics"); await wait(); });
  await act(async () => { addButton().click(); await wait(); await wait(); });
  check(!document.querySelector(".calendar-form__error") && document.body.textContent?.includes("订阅 · calendar.google.com") && inputs()[0].value === "", "添加成功后出现在列表里，表单清空");
  await pick("其他");
  await act(async () => { setInput(inputs()[0], "https://dav.example.com"); await wait(); });
  check(labels() === "地址或链接|账号|密码|名称（可不填）", "其他：粘贴服务器地址时要账号和密码");
  await act(async () => { setInput(inputs()[0], "https://example.com/team.ics"); await wait(); });
  check(labels() === "地址或链接|名称（可不填）", "其他：粘贴 .ics 链接时就不要账号密码");
  const holidays = [...document.querySelectorAll<HTMLButtonElement>(".settings-link-button")].find((button) => button.textContent === "订阅中国节假日")!;
  await act(async () => { holidays.click(); await wait(); await wait(); });
  const subscribed = calls.filter((call) => call.command === "add_calendar_source").pop()!.payload;
  check(subscribed.secret === "https://calendars.icloud.com/holidays/cn_zh.ics" && subscribed.name === "中国节假日", "一键订阅中国节假日，不用账号");
  const removeButton = document.querySelector<HTMLButtonElement>(".calendar-source__remove")!;
  check(removeButton.getAttribute("aria-label") === "删除日历「飞书」", "删除按钮的读屏文字说明删哪个日历");
  await act(async () => { removeButton.click(); await wait(); await wait(); });
  check(!document.body.textContent?.includes("u_abc"), "删除后从列表消失");

  results.textContent = `${messages.join("\n")}\n\n全部 ${messages.length} 项检查通过。`;
  results.dataset.result = "passed";
} catch (error) {
  results.textContent = `${messages.join("\n")}\nFAIL ${String(error)}`;
  results.dataset.result = "failed";
}

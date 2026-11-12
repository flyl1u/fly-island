// The website demo's content, in Chinese and English. Everything here is made up: the song and its
// lyrics, the Agent sessions, the messages and the files. The tour (tour.ts) types and clicks the
// strings under `tour`.
export type DemoLanguage = "zh" | "en";

export const demoData = {
  zh: {
    sessions: [
      { title: "重做官网首页", cwd: "D:\\Projects\\fly-island-website", message: "正在把真实的小岛放进官网…" },
      { title: "修复剪贴板图片预览", cwd: "D:\\Projects\\fly-island", message: "已修复，回归页全部通过。" },
      { title: "整理 3.1 发布说明", cwd: "D:\\Projects\\fly-island", message: "草稿写好了，要我按版本号提交吗？" },
    ],
    todos: ["整理 3.1 的需求", "回复设计评审邮件", "给官网换上新截图"],
    clips: [
      { text: "pnpm tauri build --no-bundle" },
      { text: "https://island.flyliu.org", note: "官网" },
      { text: "会议纪要：周四前确认 3.1 的范围" },
      { text: "#151E2B 深蓝声场" },
      { text: "官网首页的标题改成「常用的，就在上方」" },
    ],
    qq: [
      { title: "产品群", body: "明天上午十点评审，记得带上新的原型。" },
      { title: "小林", body: "收到，文件我放到共享盘了。" },
      { title: "设计组", body: "新图标已经上传，大家看看。" },
    ],
    wechat: [
      { contact: "项目协作组", body: "下午两点的方案评审改在三号会议室，记得带电脑。" },
      { contact: "家里人", body: "今晚做糖醋排骨，下班顺路买瓶生抽回来。" },
      { contact: "前端交流群", body: "新版组件库的文档和演示链接更新在群公告了。" },
      { contact: "快递驿站", body: "您的包裹已放入南门自提柜，取件码 5-2-401。" },
      { contact: "物业服务处", body: "明天上午十点对园区绿化进行修剪，请留意避让。" },
    ],
    mail: {
      sender: "GitHub",
      subject: "[fly-island] Release v3.0.2 is ready",
      body: "你好，\n\nfly-island 3.0.2 已经发布：\n\n1. AI Agent 页显示 Claude Code 和 Codex 的额度。\n2. 收起的岛上显示当前一句歌词。\n3. 文件中转支持拖进拖出。\n\n安装后会自动更新。",
    },
    shelf: ["季度报告.pdf", "截图 2026-11-10.png", "项目资料"],
    songs: [
      { title: "屏幕上沿", artist: "小岛乐队", album: "常用的", lyrics: ["风从屏幕上沿吹过", "把今天的待办收好", "歌声停在小岛上", "等你回来再展开", "一盏灯亮着就好"] },
      { title: "收起之后", artist: "小岛乐队", album: "常用的", lyrics: ["窗口一层一层叠起", "你只要抬头看一眼", "该做的事都在上面", "做完就把它收好"] },
    ],
    translation: { offline: "官网演示不连接翻译服务。安装后，这里显示真实的译文。" },
    tour: {
      todo: "给官网录一段演示",
      search: "官网",
      translate: "常用的，就在上方",
      translated: "Your essentials, up top",
    },
  },
  en: {
    sessions: [
      { title: "Redesign the website hero", cwd: "D:\\Projects\\fly-island-website", message: "Putting the real island on the website…" },
      { title: "Fix clipboard image previews", cwd: "D:\\Projects\\fly-island", message: "Fixed. Every regression page passes." },
      { title: "Draft the 3.1 release notes", cwd: "D:\\Projects\\fly-island", message: "The draft is ready. Commit it under the version tag?" },
    ],
    todos: ["Scope the 3.1 release", "Reply to the design review", "New screenshots for the website"],
    clips: [
      { text: "pnpm tauri build --no-bundle" },
      { text: "https://island.flyliu.org", note: "Website" },
      { text: "Meeting notes: lock the 3.1 scope by Thursday" },
      { text: "#151E2B deep blue" },
      { text: "Website headline: Your essentials, up top" },
    ],
    qq: [
      { title: "Product team", body: "Review at ten tomorrow. Bring the new prototype." },
      { title: "Lin", body: "Got it, the files are on the shared drive." },
      { title: "Design", body: "The new icons are up, take a look." },
    ],
    wechat: [
      { contact: "Project Team", body: "The 2 PM review is moved to Room 3. Please bring your laptop." },
      { contact: "Family", body: "Making ribs tonight. Could you pick up some soy sauce on your way home?" },
      { contact: "Dev Community", body: "Updated the component library docs and demo links in the group notice." },
      { contact: "Parcel Locker", body: "Your package is ready in locker 5-2-401 at the south gate." },
      { contact: "Property Service", body: "Grounds maintenance tomorrow from 10 AM. Please watch your step." },
    ],
    mail: {
      sender: "GitHub",
      subject: "[fly-island] Release v3.0.2 is ready",
      body: "Hi,\n\nfly-island 3.0.2 is out:\n\n1. The AI Agent page shows Claude Code and Codex quotas.\n2. The collapsed island shows the current lyric line.\n3. The file shelf takes files in and out by drag.\n\nInstalled copies update themselves.",
    },
    shelf: ["Quarterly report.pdf", "Screenshot 2026-11-10.png", "Project files"],
    songs: [
      { title: "Up Top", artist: "The Islanders", album: "Essentials", lyrics: ["Wind across the top edge", "Tuck today's list away", "A song rests on the island", "Open it when you're back", "One small light is enough"] },
      { title: "Tucked Away", artist: "The Islanders", album: "Essentials", lyrics: ["Windows stacking up", "Just look up once", "Everything you need is there", "Then tuck it away"] },
    ],
    translation: { offline: "The website demo isn't connected to a translation service. Once installed, the real translation shows here." },
    tour: {
      todo: "Record a demo for the website",
      search: "website",
      translate: "Your essentials, up top",
      translated: "常用的，就在上方",
    },
  },
} satisfies Record<DemoLanguage, unknown>;

export type DemoContent = (typeof demoData)[DemoLanguage];

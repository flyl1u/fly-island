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
      { title: "周末羽毛球", body: "阿杰：周六下午三点体育馆 3 号场，还差一个人，有空的举手～" },
      { title: "班级群", body: "班长：同学聚会定在 12 月 20 号，接龙报名截止到下周五。" },
      { title: "测试组", body: "3.1 第一轮回归跑完了，两个小问题已经提单。" },
      { title: "阿杰", body: "[图片] 你看这个配色是不是比上一版舒服？" },
    ],
    wechat: [
      { contact: "项目协作组", body: "下午两点的方案评审改在三号会议室，记得带电脑。" },
      { contact: "妈妈", body: "今晚做糖醋排骨，下班顺路买瓶生抽回来。" },
      { contact: "前端交流群", body: "新版组件库的文档和演示链接更新在群公告了。" },
      { contact: "快递驿站", body: "您的包裹已放入南门自提柜，取件码 5-2-401。" },
      { contact: "陈老师", body: "这周的读书会改到周四晚上，书单我发在群文件里了。" },
      { contact: "跑步打卡群", body: "小周：今天 5 公里，配速 5 分 40 秒，明早继续 🏃" },
      { contact: "房东", body: "下个月起物业费从卡里自动扣，有问题随时找我。" },
      { contact: "物业服务处", body: "明天上午十点对园区绿化进行修剪，请留意避让。" },
      { contact: "咖啡店", body: "您的拿铁已做好，请到取餐台领取。" },
    ],
    mail: [
      {
        sender: "GitHub",
        subject: "[fly-island] Release v3.0.8 is ready",
        body: "你好，\n\nfly-island 3.0.8 已经发布：\n\n1. 「设置 → 关于」新增用户交流群。\n2. 调颜色时不再闪烁。\n3. 从岛上跳到已打开的微信会话不会再把它关掉。\n\n安装后会自动更新。",
        unread: true,
      },
      {
        sender: "设计评审",
        subject: "本周五设计评审议程",
        body: "大家好，\n\n周五下午三点评审以下内容：\n\n1. 官网首页新版首屏\n2. 设置窗口侧栏的图标\n3. 收起态歌词的字号\n\n请提前在共享文档里留下意见。",
        unread: true,
      },
      {
        sender: "航旅出行",
        subject: "行程确认：12 月 5 日 上海 → 成都",
        body: "您好，您的行程已确认：\n\n12 月 5 日 08:30 上海虹桥 → 成都天府\n座位 23C，请提前 40 分钟到达机场。\n\n祝您旅途愉快。",
        unread: true,
      },
      {
        sender: "小林",
        subject: "周报草稿，帮忙看看",
        body: "嗨，\n\n这周的周报草稿在附件里，主要是 3.1 的进度和下周计划。有要补充的直接在文档里改就好。\n\n谢谢！",
        unread: false,
      },
      {
        sender: "图书馆",
        subject: "借阅到期提醒",
        body: "您借阅的《设计心理学》将于 11 月 20 日到期，可在线续借一次。",
        unread: false,
      },
    ],
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
      { title: "Weekend badminton", body: "Jay: Court 3 at the gym, Saturday 3 PM. We need one more player!" },
      { title: "Class of 2018", body: "Reunion on Dec 20. Sign up in the thread by next Friday." },
      { title: "QA", body: "First regression pass for 3.1 is done. Two small issues filed." },
      { title: "Jay", body: "[Image] Does this palette feel better than the last one?" },
    ],
    wechat: [
      { contact: "Project Team", body: "The 2 PM review is moved to Room 3. Please bring your laptop." },
      { contact: "Mom", body: "Making ribs tonight. Could you pick up some soy sauce on your way home?" },
      { contact: "Dev Community", body: "Updated the component library docs and demo links in the group notice." },
      { contact: "Parcel Locker", body: "Your package is ready in locker 5-2-401 at the south gate." },
      { contact: "Ms. Chen", body: "Book club moves to Thursday evening this week. The reading list is in the group files." },
      { contact: "Running Club", body: "Zoe: 5 km today at 5:40 per km. Same time tomorrow 🏃" },
      { contact: "Landlord", body: "From next month the service fee is charged to your card automatically." },
      { contact: "Property Service", body: "Grounds maintenance tomorrow from 10 AM. Please watch your step." },
      { contact: "Coffee Shop", body: "Your latte is ready at the pickup counter." },
    ],
    mail: [
      {
        sender: "GitHub",
        subject: "[fly-island] Release v3.0.8 is ready",
        body: "Hi,\n\nfly-island 3.0.8 is out:\n\n1. Settings → About now has the community group.\n2. Colours no longer flicker while you pick them.\n3. Jumping to a WeChat chat that is already open no longer closes it.\n\nInstalled copies update themselves.",
        unread: true,
      },
      {
        sender: "Design Review",
        subject: "Agenda for Friday's design review",
        body: "Hi all,\n\nFriday at 3 PM we'll review:\n\n1. The new website hero\n2. Icons in the settings sidebar\n3. Lyric size on the collapsed island\n\nPlease leave comments in the shared doc beforehand.",
        unread: true,
      },
      {
        sender: "Trip Planner",
        subject: "Trip confirmed: Dec 5, Shanghai → Chengdu",
        body: "Your trip is confirmed:\n\nDec 5, 08:30 Shanghai Hongqiao → Chengdu Tianfu\nSeat 23C. Please arrive 40 minutes early.\n\nHave a good trip.",
        unread: true,
      },
      {
        sender: "Lin",
        subject: "Weekly report draft, mind a look?",
        body: "Hey,\n\nThis week's report draft is attached: mostly 3.1 progress and next week's plan. Feel free to edit the doc directly.\n\nThanks!",
        unread: false,
      },
      {
        sender: "City Library",
        subject: "Your loan is due soon",
        body: "The Design of Everyday Things is due on Nov 20. You can renew it online once.",
        unread: false,
      },
    ],
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

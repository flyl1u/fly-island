# 日历标记 / Calendar Marks

作者 / Author [gyl-coding](https://github.com/gyl-coding) · [Fly Island #99](https://github.com/flyl1u/fly-island/pull/99)

在设置 → 插件启用后，中文界面的待办日历显示中国大陆节假日、调休、节气、纪念日和农历。本月放假首日显示节日名，其余放假日显示「休」，调休上班显示「班」。每格只显示一条说明，周末日期用较淡的字色提示。悬停日期或在右侧查看所选日期，可以看到完整的农历和节假日信息。停用插件或切到英文界面后，隐藏这些标记。

## 年度数据

| 数据 | 位置 | 覆盖范围 |
| --- | --- | --- |
| 节假日、调休 | src/features/todos/calendar-marks/holidays.ts | 2025–2027 |
| 二十四节气（北京时间） | src/features/todos/calendar-marks/solarTerms.ts | 2025–2027 |
| 农历 | src/features/todos/calendar-marks/lunar.ts | 1900-01-31 至 2100-12-31 |
| 固定公历纪念日 | src/features/todos/calendar-marks/memorials.ts | 每年 |

节假日按国务院办公厅发布的放假区间和调休上班日登记。覆盖范围之外仍显示周末、固定纪念日和可用的农历，不推算官方假期及节气。各年数据见 [2025 年通知](https://www.gov.cn/zhengce/zhengceku/202411/content_6986383.htm)、[2026 年通知](https://www.gov.cn/gongbao/2025/issue_12406/material/gwygb202532.pdf)、[2027 年通知（国办发明电〔2026〕10 号）](https://www.gov.cn/zhengce/content/202611/content_7085101.htm)。

新增一年时，将通知中的放假区间和调休上班日分别填入 `holidays.ts` 的 `breaks` 和 `workdays`。按北京时间从天文台公布的节气表更新 `solarTerms.ts`。节日、节气或纪念日文案需要补入 `src/i18n/sections/calendarMarks.ts`。更新后手动运行 `pnpm check:holidays` 查看年度覆盖，再运行 `pnpm test`。年度覆盖提示不会阻塞日常检查。

## English

Enable Calendar Marks from Settings → Plugins. When the app language is Chinese, it adds mainland China holidays, make-up workdays, solar terms, observances and lunar dates to the to-do calendar. Hover a date for the complete text. Switching to English keeps the standard calendar. The holiday and solar-term tables cover 2025–2027. Add the next year's dates from the official holiday notice and an observatory's solar-term table, using China Standard Time.

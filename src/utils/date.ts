export function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

// 只需要 Translations 中的 localeTag；用结构类型避免 utils/ 依赖 i18n。
export function getDisplayDateParts(date: string, t: { localeTag: string }) {
  const [fallbackYear = date, fallbackMonth = "", fallbackDay = ""] =
    date.split("-");
  const parsedDate = new Date(`${date}T00:00:00`);
  const hasValidDate = !Number.isNaN(parsedDate.getTime());
  const weekdayFormatter = new Intl.DateTimeFormat(t.localeTag, {
    weekday: "long",
  });

  return {
    year: hasValidDate ? String(parsedDate.getFullYear()) : fallbackYear,
    month: hasValidDate
      ? String(parsedDate.getMonth() + 1).padStart(2, "0")
      : fallbackMonth,
    day: hasValidDate
      ? String(parsedDate.getDate()).padStart(2, "0")
      : fallbackDay,
    weekday: hasValidDate ? weekdayFormatter.format(parsedDate) : "",
  };
}

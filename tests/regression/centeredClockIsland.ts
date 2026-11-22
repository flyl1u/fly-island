export function checkCenteredClockIsland(check: (condition: unknown, message: string) => void) {
  const bar = document.querySelector<HTMLElement>(".island__collapsed")!;
  const clock = bar.querySelector<HTMLElement>(".island__centered-clock");
  check(Boolean(clock) && bar.querySelectorAll(".collapsed-centered-clock").length === 1,
    "已安装时钟在折叠岛中只显示一个居中实例");
  check(Boolean(clock?.querySelector(".collapsed-centered-clock__time"))
    && Boolean(clock?.querySelector(".collapsed-centered-clock__date")), "时钟与日期按设置显示");
  if (clock) {
    const box = clock.getBoundingClientRect();
    const island = bar.getBoundingClientRect();
    check(Math.abs((box.left + box.right) / 2 - (island.left + island.right) / 2) < 1
      && Math.abs((box.top + box.bottom) / 2 - (island.top + island.bottom) / 2) < 1,
    "时钟位于折叠岛几何中心");
  }
  check(!bar.querySelector(".collapsed-clock"), "居中时钟不与时间天气的原时间位重叠");
}

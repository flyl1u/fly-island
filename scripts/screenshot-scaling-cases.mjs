export const SCREENSHOT_SCALING_CASES = [
  { name: "100-FHD", dpi: 1, width: 1920, height: 1080, x: 0, y: 0 },
  { name: "125-laptop", dpi: 1.25, width: 1366, height: 768, x: -1366, y: 200 },
  { name: "150-FHD", dpi: 1.5, width: 1920, height: 1080, x: 1920, y: -100 },
  { name: "175-QHD", dpi: 1.75, width: 2560, height: 1440, x: -2560, y: 0 },
  { name: "200-4K", dpi: 2, width: 3840, height: 2160, x: 0, y: -2160 },
  { name: "225-QHD", dpi: 2.25, width: 2560, height: 1440, x: 1920, y: 0 },
  { name: "250-FHD", dpi: 2.5, width: 1920, height: 1080, x: 0, y: 0 },
  { name: "300-FHD", dpi: 3, width: 1920, height: 1080, x: -1920, y: -1080 },
  { name: "300-laptop", dpi: 3, width: 1366, height: 768, x: 0, y: 0 },
  { name: "custom-110", dpi: 1.1, width: 1365, height: 767, x: 0, y: 0 },
  { name: "custom-137", dpi: 1.37, width: 1366, height: 768, x: -1366, y: 100 },
  { name: "custom-163-portrait", dpi: 1.63, width: 1080, height: 1920, x: 1920, y: -200 },
];
export const SCREENSHOT_SCALING_PAGES = SCREENSHOT_SCALING_CASES.map((item) => {
  const query = new URLSearchParams({ name: item.name, dpr: String(item.dpi),
    viewportWidth: String(Math.round(item.width / item.dpi)), viewportHeight: String(Math.round(item.height / item.dpi)),
    physicalWidth: String(item.width), physicalHeight: String(item.height), x: String(item.x), y: String(item.y) });
  return `screenshot-scaling.html?${query}`;
});

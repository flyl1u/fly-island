// island-tour.html: the colour scheme checks (?theme=, ?bg=).
/**
 * The island's tone follows what it is drawn on: a light scheme, or a light background the user
 * picked in any scheme (the original report: a white island in the dark scheme). Its text stays readable.
 */
export function checkTone(check: (condition: unknown, message: string) => void, light: boolean) {
  const luminance = (color: string) => {
    // color-mix() values come back as color(srgb r g b) on a 0-1 scale.
    const scale = color.startsWith("color(") ? 1 : 255;
    const [r, g, b] = (color.match(/[\d.]+/g) ?? []).map(Number).map((channel) => {
      const value = channel / scale;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const stage = document.querySelector<HTMLElement>(".stage")!;
  const island = document.querySelector<HTMLElement>(".island")!;
  check(stage.dataset.tone === (light ? "light" : "dark"), `岛屿的明暗跟随背景（data-tone=${stage.dataset.tone}）`);
  const background = luminance(getComputedStyle(island).backgroundColor);
  const probe = document.createElement("span");
  probe.style.color = "var(--text-3)";
  island.append(probe);
  const text = luminance(getComputedStyle(probe).color);
  probe.remove();
  const contrast = (Math.max(background, text) + 0.05) / (Math.min(background, text) + 0.05);
  check(contrast >= 4.5, `岛上第三级文字也看得清（${contrast.toFixed(1)}:1）`);
}

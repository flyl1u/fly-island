// island-tour.html: the colour scheme and material checks (?theme=, ?bg=, ?material=).
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
  const background = luminance(tourMaterialBackground(island));
  const probe = document.createElement("span");
  probe.style.color = "var(--text-3)";
  island.append(probe);
  const text = luminance(getComputedStyle(probe).color);
  probe.remove();
  const contrast = (Math.max(background, text) + 0.05) / (Math.min(background, text) + 0.05);
  check(contrast >= 4.5, `岛上第三级文字也看得清（${contrast.toFixed(1)}:1）`);
}

/**
 * The glass materials (?material=): liquid glass nearly clear with a
 * lit rim, frosted glass mostly opaque. <html> carries the material for the other windows.
 */
export function checkMaterial(check: (condition: unknown, message: string) => void, material: string) {
  const island = document.querySelector<HTMLElement>(".island")!;
  const style = getComputedStyle(island);
  check(island.classList.contains(`island--material-${material}`) && document.documentElement.dataset.material === material,
    `岛屿和页面都标上了质感（${material}）`);
  check(document.querySelector(".island__glass") && style.backdropFilter === "none", "玻璃亮边保留独立的 CSS 层");
  const alpha = Number((tourMaterialBackground(island).match(/[\d.]+/g) ?? [])[3] ?? 1);
  check(material === "liquidGlass" ? alpha < 0.5 : alpha >= 0.6, `玻璃底色的不透明度合适（${alpha.toFixed(2)}）`);
  const materialLayer = island.querySelector(".island__material")!;
  const glassLayer = island.querySelector(".island__glass")!;
  if (getComputedStyle(materialLayer).clipPath === "none") {
    const surface = island.querySelector(".island__surface")!;
    check(getComputedStyle(materialLayer).display === "contents" && getComputedStyle(surface).overflow === "hidden"
      && getComputedStyle(glassLayer).borderRadius === getComputedStyle(surface).borderRadius,
    "关闭贴边圆角时，玻璃仍由原岛身裁剪并继承同一圆角");
  }
  // Inner panels (translation, the file shelf) swap their deep base (0.88) for a faint white mist.
  const probe = document.createElement("div");
  probe.style.background = "var(--inner-panel-fill)";
  island.append(probe);
  const probeStyle = getComputedStyle(probe);
  const layers = [...`${probeStyle.backgroundColor} ${probeStyle.backgroundImage}`.matchAll(/rgba?\(([^)]+)\)/g)]
    .map(([, channels]) => channels.split(",").map(Number)).filter((channels) => (channels[3] ?? 1) > 0);
  probe.remove();
  const veil = Math.max(0, ...layers.map((channels) => channels[3] ?? 1));
  check(layers.length > 0 && veil < 0.4 && layers.every(([red, green, blue]) => Math.min(red, green, blue) >= 200),
    `玻璃里的内层面板是半透明的白雾，不是深色盒子（${veil.toFixed(2)}）`);
  if (material === "liquidGlass") {
    const rim = document.querySelector(".island__glass-refraction");
    check(rim && getComputedStyle(rim).boxShadow.includes("inset"), "液态玻璃有折射亮边");
  }
}

function tourMaterialBackground(island: HTMLElement) {
  const material = getComputedStyle(island.querySelector(".island__material")!);
  return material.clipPath === "none" ? getComputedStyle(island).backgroundColor : material.backgroundColor;
}

/** One live canvas stays on the window's coordinates under both shoulders and the island. */
export function checkGlassShoulders(check: (condition: unknown, message: string) => void) {
  const island = document.querySelector<HTMLElement>(".island")!;
  const material = island.querySelector<HTMLElement>(".island__material")!;
  const backdrop = material.querySelector<HTMLElement>(".island__glass-backdrop")!;
  const canvas = backdrop.querySelector("canvas")!;
  const rect = island.getBoundingClientRect();
  const frame = canvas.getBoundingClientRect();
  check(material.parentElement?.classList.contains("island__surface") && !material.querySelector(".island__glass, .island__expanded"),
    "??????????????????????");
  check(getComputedStyle(material).clipPath.startsWith("shape(")
    && getComputedStyle(backdrop).display === "block" && getComputedStyle(canvas).position === "static",
    "???????????????????");
  check(Math.abs(frame.left - (rect.left + rect.width / 2 - innerWidth / 2)) < 0.05
    && Math.abs(frame.width - innerWidth) < 0.05, "??????????????????????");
}

export function checkClassicShoulders(check: (condition: unknown, message: string) => void) {
  const island = document.querySelector<HTMLElement>(".island")!;
  const style = getComputedStyle(island);
  const material = getComputedStyle(island.querySelector(".island__material")!);
  const opacity = Number(style.getPropertyValue("--island-fill-alpha"));
  const alpha = Number((tourMaterialBackground(island).match(/[\d.]+/g) ?? [])[3] ?? 1);
  check(opacity === 0.8 && alpha === opacity, "???????????? 80%");
  if (island.classList.contains("island--capsule")) {
    check(!island.classList.contains("island--shoulders") && material.clipPath === "none", "???????????");
    return;
  }
  check(style.backgroundColor === "rgba(0, 0, 0, 0)" && style.backgroundImage === "none"
    && material.backgroundImage.includes("linear-gradient"), "????????????????????");
  check(material.clipPath.startsWith("shape(") && material.maskImage === "none", "?????????????????");
}

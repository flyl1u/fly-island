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
  const islandStyle = getComputedStyle(island);
  const classicBackdrop = island.querySelector<HTMLElement>(".island__classic-backdrop");
  const fill = classicBackdrop && getComputedStyle(classicBackdrop).display !== "none"
    ? getComputedStyle(classicBackdrop).getPropertyValue("--island-fill").trim()
    : islandStyle.backgroundColor;
  const background = luminance(fill || islandStyle.backgroundColor);
  const probe = document.createElement("span");
  probe.style.color = "var(--text-3)";
  island.append(probe);
  const text = luminance(getComputedStyle(probe).color);
  probe.remove();
  const contrast = (Math.max(background, text) + 0.05) / (Math.min(background, text) + 0.05);
  check(contrast >= 4.5, `岛上第三级文字也看得清（${contrast.toFixed(1)}:1）`);
}

/**
 * The glass materials (?material=): drawn in CSS without any blur, liquid glass nearly clear with a
 * lit rim, frosted glass mostly opaque. <html> carries the material for the other windows.
 */
export function checkMaterial(check: (condition: unknown, message: string) => void, material: string) {
  const island = document.querySelector<HTMLElement>(".island")!;
  const style = getComputedStyle(island);
  check(island.classList.contains(`island--material-${material}`) && document.documentElement.dataset.material === material,
    `岛屿和页面都标上了质感（${material}）`);
  check(document.querySelector(".island__glass") && style.backdropFilter === "none", "玻璃只用 CSS 画，不模糊桌面");
  const alpha = Number((style.backgroundColor.match(/[\d.]+/g) ?? [])[3] ?? 1);
  check(material === "liquidGlass" ? alpha < 0.5 : alpha >= 0.6, `玻璃底色的不透明度合适（${alpha.toFixed(2)}）`);
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

/** The live glass backdrop must also own the attached shoulders (island-tour ?glassBackdrop=1). */
export function checkGlassShoulders(check: (condition: unknown, message: string) => void) {
  const island = document.querySelector<HTMLElement>(".island")!;
  const shoulders = document.querySelector<HTMLElement>(".island__shoulders")!;
  const backdrop = document.querySelector<HTMLElement>(".island__glass-backdrop")!;
  const shoulderStyle = getComputedStyle(shoulders);
  const backdropStyle = getComputedStyle(backdrop);
  check(backdrop.parentElement === island && backdrop.querySelector("canvas")?.parentElement === backdrop,
    "live glass backdrop is a sibling layer that can cover the shoulders");
  check(shoulderStyle.backgroundImage === "none" && shoulderStyle.backgroundColor === "rgba(0, 0, 0, 0)",
    "live glass shoulders are transparent so they do not fall back to a flat tint");
  check(backdropStyle.display === "block" && backdropStyle.maskImage.includes("radial-gradient"),
    "live glass backdrop uses the island body and reverse shoulder mask");
}

/** Classic shoulders use one fill host even when the fill is semi-opaque (island-tour ?classicShoulders=1). */
export function checkClassicShoulders(check: (condition: unknown, message: string) => void) {
  const island = document.querySelector<HTMLElement>(".island")!;
  const shoulders = document.querySelector<HTMLElement>(".island__shoulders")!;
  const backdrop = document.querySelector<HTMLElement>(".island__classic-backdrop")!;
  const islandStyle = getComputedStyle(island);
  const shoulderStyle = getComputedStyle(shoulders);
  const backdropStyle = getComputedStyle(backdrop);
  const opacity = Number(islandStyle.getPropertyValue("--island-fill-alpha"));
  const backdropAlpha = Number((backdropStyle.backgroundColor.match(/[\d.]+/g) ?? [])[3] ?? 1);
  const capsule = island.classList.contains("island--capsule");
  check(opacity === 0.8, `经典材质回归使用 80% 填充不透明度（${opacity.toFixed(2)}）`);
  check(backdropAlpha === opacity, `经典宿主只合成一次 80% 填充（${backdropAlpha.toFixed(2)}）`);
  if (capsule) {
    check(!island.classList.contains("island--shoulders") && shoulderStyle.opacity === "0"
      && backdropStyle.maskImage === "none", "胶囊外形不启用贴边肩部或组合遮罩");
    return;
  }
  const rect = island.getBoundingClientRect();
  const length = Number.parseFloat(shoulderStyle.getPropertyValue("--island-shoulder-length"));
  const y = Math.round(rect.top + Math.min(8, Math.max(2, length * 0.4)));
  const left = Math.round(rect.left);
  const right = Math.round(rect.right);
  const points: Record<string, number[]> = {
    leftShoulder: [left - 1, y], leftSeam: [left, y], leftBody: [left + 1, y],
    rightBody: [right - 1, y], rightSeam: [right, y], rightShoulder: [right + 1, y],
  };
  // The bottom corners must keep the island's own curve under the shoulder mask: just inside the
  // corner's diagonal is outside the curve (desktop), further in and the corner's top are the fill.
  // The page sits on one flat colour for the screenshot; each side's desktop is read below its
  // corner, clear of the island's shadow.
  const radius = Number.parseFloat(backdropStyle.getPropertyValue("--glass-shape-radius"));
  if (island.classList.contains("island--shoulders") && radius > 0) {
    const bottom = rect.bottom;
    const inset = (side: number, amount: number) => side === rect.left ? side + amount : side - amount;
    for (const [name, side] of [["left", rect.left], ["right", rect.right]] as const) {
      points[`${name}Desktop`] = [inset(side, radius * 0.12), bottom + 40];
      points[`${name}CornerOut`] = [inset(side, radius * 0.12), bottom - radius * 0.12];
      points[`${name}CornerIn`] = [inset(side, radius * 0.4), bottom - radius * 0.4];
      points[`${name}CornerTop`] = [inset(side, 2), bottom - radius + 2];
    }
    const flat = document.createElement("style");
    flat.id = "pixel-probe-desktop";
    flat.textContent = "html, body, #root, #root *:not(.island):not(.island *) { background: #9cc0d6 !important; }";
    document.head.append(flat);
  }
  document.documentElement.dataset.islandPixelProbe = JSON.stringify({ points, opacity, length, y, viewport: [window.innerWidth, window.innerHeight] });
  if (new URLSearchParams(location.search).has("classicLegacy")) {
    check(backdropStyle.display === "none" && shoulderStyle.backgroundImage.includes("linear-gradient"),
      "经典旧版基线保留双层肩部绘制");
  } else {
    check(backdrop.parentElement === island && backdropStyle.backgroundImage.includes("linear-gradient"),
      "经典材质的岛身与肩部共用一个填充宿主");
    check(islandStyle.backgroundColor === "rgba(0, 0, 0, 0)" && islandStyle.backgroundImage === "none"
      && shoulderStyle.backgroundColor === "rgba(0, 0, 0, 0)" && shoulderStyle.opacity === "1",
    "经典材质的父层和旧肩部层不再重复叠加半透明填充");
    check(backdropStyle.maskImage.includes("radial-gradient") && length === 20,
      `经典肩部使用统一反向圆角遮罩（${length}px）`);
  }
}

/** Let the regression runner capture the collapsed shoulders before the tour opens the island. */
export function waitForClassicShoulderScreenshot() {
  return new Promise<void>((resolve) => {
    const root = document.documentElement;
    const finish = () => {
      document.getElementById("pixel-probe-desktop")?.remove();
      observer.disconnect();
      window.clearTimeout(timeout);
      resolve();
    };
    const observer = new MutationObserver(() => {
      if (root.hasAttribute("data-island-pixel-probe-captured")) finish();
    });
    const timeout = window.setTimeout(finish, 1500);
    observer.observe(root, { attributes: true, attributeFilter: ["data-island-pixel-probe-captured"] });
    if (root.hasAttribute("data-island-pixel-probe-captured")) finish();
  });
}

/** Install the two-layer classic renderer used to capture a pre-fix pixel baseline. */
export function prepareClassicLegacy() {
  const legacy = document.createElement("style");
  legacy.textContent = `.island--material-classic { background: var(--island-fill) !important; } .island--material-classic.island--collapsed { background: linear-gradient(180deg, color-mix(in srgb, var(--island-shade-top) calc(var(--island-fill-alpha) * 100%), transparent), color-mix(in srgb, var(--island-shade-bottom) calc(var(--island-fill-alpha) * 100%), transparent)), var(--island-fill) !important; } .island--material-classic > .island__classic-backdrop { display: none !important; } .island--material-classic > .island__shoulders { background: inherit !important; }`;
  document.head.append(legacy);
}

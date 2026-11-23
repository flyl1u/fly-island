import { inflateSync } from "node:zlib";

function decodePng(base64) {
  const source = Buffer.from(base64, "base64");
  const view = new DataView(source.buffer, source.byteOffset, source.byteLength);
  let offset = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const compressed = [];
  while (offset < source.length) {
    const size = view.getUint32(offset);
    const type = source.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    if (type === "IHDR") {
      width = view.getUint32(dataStart);
      height = view.getUint32(dataStart + 4);
      const bitDepth = source[dataStart + 8];
      const colorType = source[dataStart + 9];
      if (bitDepth !== 8 || ![2, 6].includes(colorType)) throw new Error("Unsupported screenshot PNG format");
      channels = colorType === 6 ? 4 : 3;
    } else if (type === "IDAT") {
      compressed.push(source.subarray(dataStart, dataStart + size));
    }
    offset = dataStart + size + 4;
  }
  const scanlines = inflateSync(Buffer.concat(compressed));
  const stride = width * channels;
  const pixels = Buffer.alloc(width * height * 4);
  let sourceOffset = 0;
  let previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = scanlines[sourceOffset++];
    const row = Buffer.from(scanlines.subarray(sourceOffset, sourceOffset + stride));
    sourceOffset += stride;
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? row[x - channels] : 0;
      const above = previous[x] ?? 0;
      const upperLeft = x >= channels ? previous[x - channels] : 0;
      const predictor = filter === 1 ? left : filter === 2 ? above : filter === 3 ? Math.floor((left + above) / 2)
        : filter === 4 ? paeth(left, above, upperLeft) : 0;
      row[x] = (row[x] + predictor) & 0xff;
    }
    for (let x = 0; x < width; x += 1) {
      const sourcePixel = x * channels;
      const targetPixel = (y * width + x) * 4;
      pixels[targetPixel] = row[sourcePixel];
      pixels[targetPixel + 1] = row[sourcePixel + 1];
      pixels[targetPixel + 2] = row[sourcePixel + 2];
      pixels[targetPixel + 3] = channels === 4 ? row[sourcePixel + 3] : 255;
    }
    previous = row;
  }
  return { width, height, pixels };
}

function paeth(left, above, upperLeft) {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  return leftDistance <= aboveDistance && leftDistance <= upperLeftDistance ? left
    : aboveDistance <= upperLeftDistance ? above : upperLeft;
}

function pixelAt(image, point, viewport) {
  const scaleX = viewport?.[0] ? image.width / viewport[0] : 1;
  const scaleY = viewport?.[1] ? image.height / viewport[1] : 1;
  const x = Math.max(0, Math.min(image.width - 1, Math.round(point[0] * scaleX)));
  const y = Math.max(0, Math.min(image.height - 1, Math.round(point[1] * scaleY)));
  const offset = (y * image.width + x) * 4;
  return [...image.pixels.subarray(offset, offset + 4)];
}

/**
 * The mean of a few device rows above and below the point, at the same column. Glass grain is
 * pixel noise at DPR 1; averaging down the column smooths it while a seam, which is a vertical
 * line, keeps its full contrast.
 */
function columnAverage(image, point, viewport, rows = 1) {
  const scaleY = viewport?.[1] ? image.height / viewport[1] : 1;
  const samples = [];
  for (let step = -rows; step <= rows; step++) samples.push(pixelAt(image, [point[0], point[1] + step / scaleY], viewport));
  return samples[0].map((_, channel) => Math.round(samples.reduce((sum, sample) => sum + sample[channel], 0) / samples.length));
}

function colourDifference(a, b) {
  return Math.max(...a.slice(0, 3).map((channel, index) => Math.abs(channel - b[index])));
}

/** Average each row across the pane so grain does not hide a horizontal seam. */
function glassContinuityPixels(image, probe) {
  const { x, top, height, mode } = probe.glassContinuity;
  const xScale = image.width / probe.viewport[0];
  const yScale = image.height / probe.viewport[1];
  const start = Math.ceil((x - 12) * xScale);
  const end = Math.floor((x + 12) * xScale);
  const lastRow = Math.min(60, Math.floor(height - 6));
  const rowAt = (y) => Math.round((top + y) * yScale);
  const label = `${mode} glass rows`;
  if (start < 0 || end >= image.width || end < start || rowAt(2) < 0 || rowAt(lastRow) >= image.height || lastRow <= 2) {
    return { passed: false, label: `${label} out of frame` };
  }
  const rowAverage = (y) => {
    const pixelRow = rowAt(y);
    const totals = [0, 0, 0];
    for (let column = start; column <= end; column++) {
      const offset = (pixelRow * image.width + column) * 4;
      for (let channel = 0; channel < 3; channel++) totals[channel] += image.pixels[offset + channel];
    }
    return totals.map((sum) => sum / (end - start + 1));
  };

  // The same lens fade fits into the first 18% of the pane, so it is steeper on a short bar.
  const maxStep = 3;
  const topFadeLimit = Math.max(maxStep, Math.ceil(220 / height));
  let previous = rowAverage(2);
  let peak = { difference: 0, row: 2, limit: maxStep };
  for (let y = 3; y <= lastRow; y++) {
    const current = rowAverage(y);
    // Rounded screenshot rows may be less or more than one CSS pixel apart at fractional DPR.
    const difference = colourDifference(previous, current) * yScale / Math.max(1, rowAt(y) - rowAt(y - 1));
    const limit = y - 1 < height * 0.18 ? topFadeLimit : maxStep;
    if (difference / limit > peak.difference / peak.limit) peak = { difference, row: y, limit };
    previous = current;
  }
  return {
    passed: peak.difference <= peak.limit,
    label: `${label} peakDiff=${peak.difference.toFixed(2)} at y=${peak.row} (<=${peak.limit})`,
  };
}

/** The contour scanner uses pixels in a stripe spanning desktop, the edge and solid material. */
export function shoulderOutlinePixels(image, probe) {
  const xScale = image.width / probe.viewport[0];
  const yScale = image.height / probe.viewport[1];
  const { body, outside, top, join, bottom } = probe.contour;
  const joinRow = join * yScale;
  const firstRow = Math.max(0, Math.ceil(top * yScale));
  const lastRow = Math.min(image.height - 1, Math.ceil(joinRow) + 3, Math.floor(bottom * yScale) - 2);
  const pixel = (x, y) => image.pixels.subarray((y * image.width + x) * 4, (y * image.width + x) * 4 + 3);
  const limits = [
    [Math.floor(outside[0] * xScale) - 3, Math.ceil(body[0] * xScale) + 3, 1],
    [Math.floor(body[1] * xScale) - 3, Math.ceil(outside[1] * xScale) + 3, -1],
  ];
  const sides = limits.map(([start, end, inward], index) => {
    const name = index === 0 ? "left" : "right";
    const bodyX = body[index] * xScale;
    const edges = [];
    if (start < 4 || end + 4 >= image.width) return { passed: false, label: `${name} out of frame` };
    for (let y = firstRow; y <= lastRow; y++) {
      const desktop = pixel(inward === 1 ? start - 2 : end + 2, y);
      const fill = pixel(inward === 1 ? end + 4 : start - 4, y);
      const contrast = Array.from(fill, (channel, index) => channel - desktop[index]);
      const magnitude = contrast.reduce((sum, channel) => sum + channel * channel, 0);
      if (magnitude < 24 ** 2) return { passed: false, label: `${name} row ${y} has insufficient contrast` };
      let covered = 0;
      for (let x = start; x < end; x++) {
        const sample = pixel(x, y);
        const mix = contrast.reduce((sum, channel, index) => sum + channel * (sample[index] - desktop[index]), 0);
        const coverage = mix / magnitude;
        // Ignore a few channels of grain in the solid pixels, keeping fractional edge coverage.
        covered += coverage < 0.035 ? 0 : coverage > 0.965 ? 1 : coverage;
      }
      edges.push(inward === 1 ? end - covered : start + covered);
    }

    let reverse = 0;
    let jump = 0;
    for (let row = 1; row < edges.length; row++) {
      const advance = inward * (edges[row] - edges[row - 1]);
      reverse = Math.max(reverse, -advance);
      // The top begins with a horizontal tangent, where x(y) naturally moves several pixels.
      // Limit the row-to-row jump near the vertical tangent into the island's side.
      if (Math.abs(firstRow + row - joinRow) <= 1.75) jump = Math.max(jump, Math.abs(advance));
    }
    const flare = (bodyX - edges[0]) * inward;
    const atJoin = Math.round(joinRow) - firstRow;
    const offset = Math.abs(edges[atJoin] - bodyX);
    const passed = edges.length >= 5 && reverse <= 0.14 && jump <= 0.6 && flare >= 1 && offset <= 0.65;
    return {
      passed,
      label: `${name} jump=${jump.toFixed(2)} reverse=${reverse.toFixed(2)} flare=${flare.toFixed(2)} offset=${offset.toFixed(2)}`,
    };
  });
  return { passed: sides.every((side) => side.passed), label: `outline pixels ${sides.map((side) => side.label).join(" | ")}` };
}

export async function capturePixelProbe(session, probeText) {
  const probe = JSON.parse(probeText);
  const options = { format: "png", fromSurface: true };
  if (probe.crop) options.clip = { x: 0, y: 0, width: probe.viewport[0], height: probe.viewport[1], scale: 1 };
  const screenshot = await session.send("Page.captureScreenshot", options);
  const image = decodePng(screenshot.data);
  if (probe.dpr && Math.abs(image.width / probe.viewport[0] - probe.dpr) > 0.01) {
    throw new Error(`Screenshot DPR is ${image.width / probe.viewport[0]}, expected ${probe.dpr}`);
  }
  const pixels = Object.fromEntries(Object.entries(probe.points).map(([name, point]) => [name, pixelAt(image, point, probe.viewport)]));
  const checks = [];
  if (pixels.leftShoulder && probe.material === "glass") {
    for (const name of ["Shoulder", "Seam", "Body", "Rim", "Inner"].flatMap((point) => [`left${point}`, `right${point}`])) {
      if (probe.points[name]) pixels[name] = columnAverage(image, probe.points[name], probe.viewport);
    }
  }
  if (pixels.leftShoulder) {
    const rim = (side) => pixels[`${side}Rim`] ? colourDifference(pixels[`${side}Rim`], pixels[`${side}Inner`]) : 0;
    const left = Math.max(colourDifference(pixels.leftShoulder, pixels.leftBody), colourDifference(pixels.leftSeam, pixels.leftBody), rim("left"));
    const right = Math.max(colourDifference(pixels.rightShoulder, pixels.rightBody), colourDifference(pixels.rightSeam, pixels.rightBody), rim("right"));
    const maximum = Math.max(left, right);
    const material = probe.material ?? "classic";
    checks.push({
      passed: maximum <= (material === "glass" ? 5 : 2),
      label: `${material} shoulder pixels left=${left} right=${right} maxDiff=${maximum}`,
    });
  }
  if (pixels.leftDesktop) checks.push(cornerPixels(pixels));
  if (probe.contour) checks.push(shoulderOutlinePixels(image, probe));
  if (probe.glassContinuity) checks.push(glassContinuityPixels(image, probe));
  return { passed: checks.length > 0 && checks.every((check) => check.passed), label: checks.map((check) => check.label).join("\n") };
}

/**
 * Bottom corners under the shoulder mask, per side: outside the curve reads as that side's desktop
 * (give or take the island's shadow), while inside the curve and where the corner begins read as
 * the fill. Square corners or a notch put the fill outside or the desktop inside.
 */
export function cornerPixels(pixels) {
  if (!pixels.leftDesktop) return { passed: true, label: "bottom corners not probed" };
  const sides = ["left", "right"].map((side) => {
    const desktop = pixels[`${side}Desktop`];
    const outside = colourDifference(pixels[`${side}CornerOut`], desktop);
    const inside = Math.min(colourDifference(pixels[`${side}CornerIn`], desktop), colourDifference(pixels[`${side}CornerTop`], desktop));
    return { side, outside, inside, passed: inside >= 24 && outside * 2 <= inside };
  });
  return {
    passed: sides.every((side) => side.passed),
    label: `bottom corner pixels ${sides.map(({ side, outside, inside }) => `${side} outside=${outside} inside=${inside}`).join(" ")} (inside>=24, outside<=inside/2)`,
  };
}

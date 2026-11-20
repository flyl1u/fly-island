import { inflateSync } from "node:zlib";

export const READ_PIXEL_PROBE = `(() => document.documentElement.dataset.islandPixelProbe || "")()`;

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

function colourDifference(a, b) {
  return Math.max(...a.slice(0, 3).map((channel, index) => Math.abs(channel - b[index])));
}

export async function capturePixelProbe(session, probeText) {
  const probe = JSON.parse(probeText);
  const screenshot = await session.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  const image = decodePng(screenshot.data);
  const pixels = Object.fromEntries(Object.entries(probe.points).map(([name, point]) => [name, pixelAt(image, point, probe.viewport)]));
  const left = Math.max(colourDifference(pixels.leftShoulder, pixels.leftBody), colourDifference(pixels.leftSeam, pixels.leftBody));
  const right = Math.max(colourDifference(pixels.rightShoulder, pixels.rightBody), colourDifference(pixels.rightSeam, pixels.rightBody));
  const maximum = Math.max(left, right);
  const label = `classic shoulder pixels left=${pixels.leftShoulder.join(",")} seam=${pixels.leftSeam.join(",")} body=${pixels.leftBody.join(",")} right=${pixels.rightShoulder.join(",")} seam=${pixels.rightSeam.join(",")} body=${pixels.rightBody.join(",")} maxDiff=${maximum}`;
  const corners = cornerPixels(pixels);
  return { passed: maximum <= 2 && corners.passed, label: pixels.leftDesktop ? [label, corners.label].join("\n") : label };
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

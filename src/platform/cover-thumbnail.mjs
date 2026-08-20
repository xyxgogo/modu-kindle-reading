import jpeg from "jpeg-js";

const MAX_COVER_BYTES = 1024 * 1024;
const MAX_WIDTH = 260;
const MAX_HEIGHT = 390;

export function createKindleJpegThumbnail(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (!bytes.length || bytes.length > MAX_COVER_BYTES) {
    throw new Error("cover_size_invalid");
  }
  const decoded = jpeg.decode(bytes, {
    useTArray: true,
    formatAsRGBA: true,
    maxResolutionInMP: 20,
    maxMemoryUsageInMB: 64,
  });
  if (!decoded?.width || !decoded?.height) throw new Error("cover_decode_failed");
  const scale = Math.min(1, MAX_WIDTH / decoded.width, MAX_HEIGHT / decoded.height);
  const width = Math.max(1, Math.round(decoded.width * scale));
  const height = Math.max(1, Math.round(decoded.height * scale));
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(decoded.height - 1, Math.floor(y / scale));
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(decoded.width - 1, Math.floor(x / scale));
      const source = (sourceY * decoded.width + sourceX) * 4;
      const target = (y * width + x) * 4;
      const gray = Math.round(decoded.data[source] * 0.299 + decoded.data[source + 1] * 0.587 + decoded.data[source + 2] * 0.114);
      data[target] = gray;
      data[target + 1] = gray;
      data[target + 2] = gray;
      data[target + 3] = 255;
    }
  }
  const encoded = jpeg.encode({ data, width, height }, 48);
  return { bytes: new Uint8Array(encoded.data), width, height, mediaType: "image/jpeg" };
}


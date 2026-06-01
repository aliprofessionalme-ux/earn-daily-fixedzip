const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
}

const CRC_TABLE = makeCrcTable();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  typeBytes.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 8 + data.length);
  return out;
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  return Buffer.concat([
    PNG_SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function createCanvas(width, height) {
  return { width, height, data: Buffer.alloc(width * height * 4) };
}

function blend(canvas, x, y, color, alpha = color[3] ?? 255) {
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;

  const i = (y * canvas.width + x) * 4;
  const a = (alpha / 255) * ((color[3] ?? 255) / 255);
  const ia = 1 - a;
  canvas.data[i] = Math.round(color[0] * a + canvas.data[i] * ia);
  canvas.data[i + 1] = Math.round(color[1] * a + canvas.data[i + 1] * ia);
  canvas.data[i + 2] = Math.round(color[2] * a + canvas.data[i + 2] * ia);
  canvas.data[i + 3] = Math.min(255, Math.round(255 * a + canvas.data[i + 3] * ia));
}

function fillBackground(canvas) {
  const cx = canvas.width / 2;
  const cy = canvas.height * 0.42;
  const max = Math.max(canvas.width, canvas.height);

  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const dx = (x - cx) / max;
      const dy = (y - cy) / max;
      const glow = Math.max(0, 1 - Math.hypot(dx, dy) * 2.15);
      const i = (y * canvas.width + x) * 4;
      canvas.data[i] = Math.round(5 + glow * 15);
      canvas.data[i + 1] = Math.round(6 + glow * 13);
      canvas.data[i + 2] = Math.round(7 + glow * 7);
      canvas.data[i + 3] = 255;
    }
  }
}

function fillCircle(canvas, cx, cy, r, color) {
  const x0 = Math.floor(cx - r);
  const x1 = Math.ceil(cx + r);
  const y0 = Math.floor(cy - r);
  const y1 = Math.ceil(cy + r);

  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      if (Math.hypot(x - cx, y - cy) <= r) blend(canvas, x, y, color);
    }
  }
}

function strokeCircle(canvas, cx, cy, r, thickness, color) {
  const x0 = Math.floor(cx - r - thickness);
  const x1 = Math.ceil(cx + r + thickness);
  const y0 = Math.floor(cy - r - thickness);
  const y1 = Math.ceil(cy + r + thickness);

  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const d = Math.hypot(x - cx, y - cy);
      if (d >= r - thickness / 2 && d <= r + thickness / 2) blend(canvas, x, y, color);
    }
  }
}

function fillRoundRect(canvas, x, y, width, height, radius, color) {
  const x1 = x + width;
  const y1 = y + height;
  for (let py = Math.floor(y); py <= Math.ceil(y1); py += 1) {
    for (let px = Math.floor(x); px <= Math.ceil(x1); px += 1) {
      const dx = px < x + radius ? x + radius - px : px > x1 - radius ? px - (x1 - radius) : 0;
      const dy = py < y + radius ? y + radius - py : py > y1 - radius ? py - (y1 - radius) : 0;
      if (dx * dx + dy * dy <= radius * radius) blend(canvas, px, py, color);
    }
  }
}

function strokeRoundRect(canvas, x, y, width, height, radius, thickness, color) {
  fillRoundRect(canvas, x, y, width, thickness, Math.min(radius, thickness), color);
  fillRoundRect(canvas, x, y + height - thickness, width, thickness, Math.min(radius, thickness), color);
  fillRoundRect(canvas, x, y, thickness, height, Math.min(radius, thickness), color);
  fillRoundRect(canvas, x + width - thickness, y, thickness, height, Math.min(radius, thickness), color);
}

function line(canvas, x1, y1, x2, y2, thickness, color) {
  const steps = Math.ceil(Math.hypot(x2 - x1, y2 - y1));
  for (let i = 0; i <= steps; i += 1) {
    const amount = i / steps;
    fillCircle(canvas, x1 + (x2 - x1) * amount, y1 + (y2 - y1) * amount, thickness / 2, color);
  }
}

function drawLogo(canvas, cx, cy, size) {
  const s = size / 1000;
  const gold = [244, 198, 67, 255];
  const goldLight = [255, 236, 132, 255];
  const goldDark = [173, 111, 15, 255];
  const black = [17, 18, 19, 255];
  const charcoal = [30, 31, 32, 255];

  for (const angle of [-118, -92, -70, -45, -23]) {
    const rad = (angle * Math.PI) / 180;
    line(
      canvas,
      cx + Math.cos(rad) * 330 * s,
      cy + Math.sin(rad) * 330 * s,
      cx + Math.cos(rad) * 430 * s,
      cy + Math.sin(rad) * 430 * s,
      20 * s,
      goldLight,
    );
  }

  strokeCircle(canvas, cx, cy + 35 * s, 235 * s, 28 * s, gold);
  fillCircle(canvas, cx, cy + 155 * s, 185 * s, goldDark);
  fillCircle(canvas, cx, cy + 145 * s, 160 * s, [218, 160, 35, 255]);
  strokeCircle(canvas, cx, cy + 145 * s, 180 * s, 18 * s, goldLight);
  line(canvas, cx, cy + 35 * s, cx, cy + 255 * s, 28 * s, goldLight);
  line(canvas, cx - 78 * s, cy + 98 * s, cx + 74 * s, cy + 98 * s, 24 * s, goldLight);
  line(canvas, cx - 78 * s, cy + 190 * s, cx + 74 * s, cy + 190 * s, 24 * s, goldLight);
  line(canvas, cx - 72 * s, cy + 190 * s, cx + 68 * s, cy + 98 * s, 26 * s, goldLight);

  fillRoundRect(canvas, cx - 330 * s, cy + 245 * s, 660 * s, 285 * s, 72 * s, black);
  strokeRoundRect(canvas, cx - 330 * s, cy + 245 * s, 660 * s, 285 * s, 72 * s, 16 * s, gold);
  fillRoundRect(canvas, cx - 380 * s, cy + 330 * s, 760 * s, 310 * s, 72 * s, charcoal);
  strokeRoundRect(canvas, cx - 380 * s, cy + 330 * s, 760 * s, 310 * s, 72 * s, 14 * s, gold);
  line(canvas, cx - 310 * s, cy + 600 * s, cx + 250 * s, cy + 600 * s, 6 * s, [96, 66, 24, 255]);
  fillRoundRect(canvas, cx + 185 * s, cy + 425 * s, 235 * s, 135 * s, 60 * s, [21, 22, 23, 255]);
  strokeRoundRect(canvas, cx + 185 * s, cy + 425 * s, 235 * s, 135 * s, 60 * s, 12 * s, goldDark);
  fillCircle(canvas, cx + 290 * s, cy + 492 * s, 34 * s, goldLight);
  strokeCircle(canvas, cx + 290 * s, cy + 492 * s, 35 * s, 8 * s, goldDark);
}

function makeIconPng() {
  const canvas = createCanvas(1024, 1024);
  fillBackground(canvas);
  drawLogo(canvas, 512, 300, 700);
  return encodePng(canvas.width, canvas.height, canvas.data);
}

function makeSplashPng() {
  const canvas = createCanvas(1280, 1280);
  fillBackground(canvas);
  drawLogo(canvas, 640, 330, 640);
  line(canvas, 360, 1000, 920, 1000, 6, [244, 198, 67, 255]);
  return encodePng(canvas.width, canvas.height, canvas.data);
}

function getPngSize(buffer) {
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error("Generated asset is not a PNG");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function writePng(filePath, buffer, expectedWidth, expectedHeight) {
  const { width, height } = getPngSize(buffer);
  if (width !== expectedWidth || height !== expectedHeight) {
    throw new Error(`${path.basename(filePath)} generated at ${width}x${height}, expected ${expectedWidth}x${expectedHeight}`);
  }
  fs.writeFileSync(filePath, buffer);
}

function prepareBrandAssets() {
  const imagesDir = path.resolve(__dirname, "..", "assets", "images");
  fs.mkdirSync(imagesDir, { recursive: true });

  const icon = makeIconPng();
  const splash = makeSplashPng();

  writePng(path.join(imagesDir, "icon.png"), icon, 1024, 1024);
  writePng(path.join(imagesDir, "adaptive-icon.png"), icon, 1024, 1024);
  writePng(path.join(imagesDir, "favicon.png"), icon, 1024, 1024);
  writePng(path.join(imagesDir, "splash.png"), splash, 1280, 1280);

  console.log(`Prepared Earn Daily PNG assets: icon ${icon.length} bytes, splash ${splash.length} bytes`);
}

if (require.main === module) {
  prepareBrandAssets();
}

module.exports = prepareBrandAssets;

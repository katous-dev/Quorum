import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { darkTokens } from "../src/index.ts";

const root = new URL("../../../", import.meta.url);
const path = (name: string) => fileURLToPath(new URL(name, root));

// The canonical Quorum logo source
const sourceUser = path("packages/ui-tokens/assets/quorum-source.jpg");

// Generate the high-res 1024x1024 PNG with dark background matching darkTokens.background
// Original image has background #0c0c0e, darkTokens.background is #141414
const originalRaw = await sharp(sourceUser).resize(1024, 1024).raw().toBuffer();

// Extract clean transparent emblem
const transparentRgba = Buffer.alloc(1024 * 1024 * 4);
const monochromeRgba = Buffer.alloc(1024 * 1024 * 4);

for (let i = 0; i < 1024 * 1024; i++) {
  const r = originalRaw[i * 3] ?? 0;
  const g = originalRaw[i * 3 + 1] ?? 0;
  const b = originalRaw[i * 3 + 2] ?? 0;
  const max = Math.max(r, g, b);

  transparentRgba[i * 4] = r;
  transparentRgba[i * 4 + 1] = g;
  transparentRgba[i * 4 + 2] = b;

  // Monochrome is pure white
  monochromeRgba[i * 4] = 255;
  monochromeRgba[i * 4 + 1] = 255;
  monochromeRgba[i * 4 + 2] = 255;

  if (max < 25) {
    transparentRgba[i * 4 + 3] = 0;
    monochromeRgba[i * 4 + 3] = 0;
  } else if (max < 45) {
    const alpha = Math.round(((max - 25) / 20) * 255);
    transparentRgba[i * 4 + 3] = alpha;
    monochromeRgba[i * 4 + 3] = alpha;
  } else {
    transparentRgba[i * 4 + 3] = 255;
    monochromeRgba[i * 4 + 3] = 255;
  }
}

const transparentEmblem = await sharp(transparentRgba, {
  raw: { width: 1024, height: 1024, channels: 4 },
})
  .png()
  .toBuffer();

// Save transparent emblem for Apple icon composer & token assets
await sharp(transparentEmblem).toFile(
  path("packages/ui-tokens/assets/Rakazo.icon/Assets/orange-bot.png"),
);
await sharp(transparentEmblem).toFile(path("packages/ui-tokens/assets/quorum-emblem.png"));

// Save monochrome icon for Android
const monochromeBuffer = await sharp(monochromeRgba, {
  raw: { width: 1024, height: 1024, channels: 4 },
})
  .png()
  .toBuffer();
await sharp(monochromeBuffer).toFile(path("apps/mobile/assets/monochrome-icon.png"));

// Square icon: the original emblem on darkTokens.background (#141414)
// Composite transparent emblem onto solid #141414 background
const square = await sharp({
  create: {
    width: 1024,
    height: 1024,
    channels: 4,
    background: darkTokens.background,
  },
})
  .composite([{ input: transparentEmblem, left: 0, top: 0 }])
  .png()
  .toBuffer();

await sharp(square).toFile(path("packages/ui-tokens/assets/quorum-square.png"));

// Squircle mask for rounded icon / favicons
const mask = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" rx="200" fill="white"/></svg>',
);

async function roundedCorners(input: Buffer) {
  return sharp(input)
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();
}

const rounded = await roundedCorners(square);

async function png(input: Buffer, name: string, size: number) {
  await sharp(input).resize(size, size).png().toFile(path(name));
}

// PNG frames in ICO are supported by modern Windows and browser favicon loaders.
async function ico(input: Buffer, name: string, sizes: number[]) {
  const frames = await Promise.all(sizes.map((size) => sharp(input).resize(size).png().toBuffer()));
  const header = Buffer.alloc(6 + frames.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(frames.length, 4);
  let offset = header.length;
  frames.forEach((frame, index) => {
    const entry = 6 + index * 16;
    const size = sizes[index] ?? 0;
    header[entry] = header[entry + 1] = size === 256 ? 0 : size;
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(frame.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += frame.length;
  });
  await writeFile(path(name), Buffer.concat([header, ...frames]));
}

// Web & Marketing sites
for (const app of ["web", "www"]) {
  const publicDir = `apps/${app}/public`;
  await png(rounded, `${publicDir}/favicon-16x16.png`, 16);
  await png(rounded, `${publicDir}/favicon-32x32.png`, 32);
  await png(rounded, `${publicDir}/favicon.png`, 128);
  await png(square, `${publicDir}/apple-touch-icon.png`, 180);
  await png(square, `${publicDir}/icon-192.png`, 192);
  await png(square, `${publicDir}/icon-512.png`, 512);
  await ico(rounded, `${publicDir}/favicon.ico`, [16, 32, 48]);
}

await mkdir(path("apps/www/public/brand"), { recursive: true });
await png(rounded, "apps/www/public/brand/rakazo-mark.png", 256);
await png(rounded, "apps/www/public/brand/kit/rakazo-icon.png", 1024);
await png(square, "apps/www/public/brand/kit/rakazo-logo.png", 1024);

// Mobile assets
await png(rounded, "apps/mobile/assets/favicon.png", 128);
await png(square, "apps/mobile/assets/icon.png", 1024);
await sharp(transparentEmblem).toFile(path("apps/mobile/assets/adaptive-icon.png"));
await sharp({
  create: {
    width: 1024,
    height: 1024,
    channels: 4,
    background: darkTokens.background,
  },
})
  .png()
  .toFile(path("apps/mobile/assets/icon-background.png"));

// Mobile splash: emblem alone with transparent padding
await sharp(transparentEmblem)
  .resize(620, 620)
  .extend({ top: 202, bottom: 202, left: 202, right: 202, background: "transparent" })
  .png()
  .toFile(path("apps/mobile/assets/splash-icon.png"));

// Android notification silhouette (72x72)
const notifSilhouette = await sharp(monochromeBuffer)
  .resize(72, 72)
  .extractChannel("alpha")
  .toBuffer();
await sharp({ create: { width: 72, height: 72, channels: 3, background: "white" } })
  .joinChannel(notifSilhouette)
  .png()
  .toFile(path("apps/mobile/assets/notification-icon.png"));

// Desktop assets
await png(square, "apps/desktop/assets/icon.png", 1024);
await png(rounded, "apps/desktop/assets/icon-macos.png", 1024);
await ico(rounded, "apps/desktop/assets/icon.ico", [16, 32, 48, 64, 128, 256]);

console.log("All brand assets exported successfully!");

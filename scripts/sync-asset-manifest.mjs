#!/usr/bin/env node
/**
 * Scan the public asset directories and record which approved images exist.
 *
 * Run with `npm run assets:sync` after dropping delivered files into
 * `public/brand/banners` or `public/brand/services`.
 *
 * It records ONLY files whose name matches a slug in the asset registry. An
 * unrecognised file is reported and ignored rather than guessed at: silently
 * adopting `crown-final-v2.jpg` as the crown image is how the wrong photograph
 * ends up on a treatment page.
 */

import { readdirSync, existsSync, writeFileSync, readFileSync, openSync, readSync, closeSync } from 'node:fs';
import { join, extname, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The registry is TypeScript, and this script runs as plain Node. Rather than
 * add a transpile step, the slugs and their kinds are extracted textually —
 * the shape is stable and a mismatch is caught by the test that compares this
 * manifest against the registry.
 */
function readRegistry() {
  const source = readFileSync(join(root, 'src/platform/media/assets.ts'), 'utf8');
  const assets = [];
  const pattern = /slug: '([a-z0-9-]+)',[\s\S]{0,400}?kind: '(banner|service)'/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    assets.push({ slug: match[1], kind: match[2] });
  }
  return assets;
}

/**
 * Read an image's real pixel dimensions from its header.
 *
 * The registry declares a nominal size per kind, but a delivered file is
 * whatever it is — these banners arrived at 2243x701 rather than 1920x600.
 * Passing the declared size to `next/image` when the file is a different size
 * makes the browser reserve the wrong box, which is the layout shift the
 * width/height attributes exist to prevent. So the real size is measured once,
 * here, and recorded.
 */
function imageSize(file) {
  const fd = openSync(file, 'r');
  const head = Buffer.alloc(64);
  readSync(fd, head, 0, 64, 0);
  closeSync(fd);

  // PNG: IHDR width/height are big-endian at bytes 16..24.
  if (head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) };
  }
  // WebP (VP8X / VP8L / VP8) — read the whole header region.
  if (head.subarray(0, 4).toString() === 'RIFF' && head.subarray(8, 12).toString() === 'WEBP') {
    const buf = readFileSync(file);
    const chunk = buf.subarray(12, 16).toString();
    if (chunk === 'VP8X') {
      return { width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1 };
    }
    if (chunk === 'VP8L') {
      const bits = buf.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (chunk === 'VP8 ') {
      return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    }
    return null;
  }
  // JPEG: walk the segment markers to the SOF frame header.
  if (head[0] === 0xff && head[1] === 0xd8) {
    const buf = readFileSync(file);
    let i = 2;
    while (i < buf.length) {
      if (buf[i] !== 0xff) { i += 1; continue; }
      const marker = buf[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
      }
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return null;
}

const DIRECTORIES = { banner: 'public/brand/banners', service: 'public/brand/services' };
const EXTENSIONS = ['webp', 'avif', 'jpg', 'jpeg', 'png'];

const registry = readRegistry();
const bySlug = new Map(registry.map((a) => [a.slug, a]));

const present = {};
const unrecognised = [];

for (const [kind, directory] of Object.entries(DIRECTORIES)) {
  const absolute = join(root, directory);
  if (!existsSync(absolute)) continue;

  for (const file of readdirSync(absolute)) {
    const extension = extname(file).slice(1).toLowerCase();
    if (!EXTENSIONS.includes(extension)) continue;

    const slug = basename(file, extname(file));
    const asset = bySlug.get(slug);

    if (!asset) {
      unrecognised.push(`${directory}/${file}`);
      continue;
    }
    if (asset.kind !== kind) {
      unrecognised.push(`${directory}/${file} (registered as a ${asset.kind}, found in ${kind})`);
      continue;
    }
    // Preference order: the first extension found wins, so a delivered .webp
    // supersedes a .jpg of the same slug without either being deleted.
    const existing = present[slug];
    if (existing) {
      const rank = (p) => EXTENSIONS.indexOf(extname(p).slice(1).toLowerCase());
      if (rank(existing) <= rank(file)) continue;
    }
    const absoluteFile = join(absolute, file);
    const size = imageSize(absoluteFile);
    if (!size) {
      unrecognised.push(`${directory}/${file} (could not read its dimensions)`);
      continue;
    }
    present[slug] = {
      src: `/${directory.replace(/^public\//, '')}/${file}`,
      width: size.width,
      height: size.height,
    };
  }
}

const entries = Object.keys(present)
  .sort()
  .map(
    (slug) =>
      `  '${slug}': { src: '${present[slug].src}', width: ${present[slug].width}, height: ${present[slug].height} },`,
  )
  .join('\n');

const header = readFileSync(join(root, 'src/platform/media/manifest.generated.ts'), 'utf8')
  .split('export const PRESENT_ASSETS')[0];

writeFileSync(
  join(root, 'src/platform/media/manifest.generated.ts'),
  `${header}export interface PresentAsset {\n  readonly src: string;\n  readonly width: number;\n  readonly height: number;\n}\n\nexport const PRESENT_ASSETS: Readonly<Record<string, PresentAsset>> = {\n${entries}${
    entries ? '\n' : ''
  }};\n\n/** When the scan last ran, for the audit report. */\nexport const MANIFEST_GENERATED_AT = '${new Date().toISOString()}';\n`,
);

const found = Object.keys(present).length;
console.log(`Asset manifest: ${found} of ${registry.length} approved assets present.`);
if (unrecognised.length > 0) {
  console.log('\nIgnored, because the filename matches no registered slug:');
  for (const file of unrecognised) console.log(`  ${file}`);
  console.log('\nRename these to a registered slug, or add the slug to src/platform/media/assets.ts.');
}

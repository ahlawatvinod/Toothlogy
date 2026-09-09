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

import { readdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
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
    present[slug] = `/${directory.replace(/^public\//, '')}/${file}`;
  }
}

const entries = Object.keys(present)
  .sort()
  .map((slug) => `  '${slug}': '${present[slug]}',`)
  .join('\n');

const header = readFileSync(join(root, 'src/platform/media/manifest.generated.ts'), 'utf8')
  .split('export const PRESENT_ASSETS')[0];

writeFileSync(
  join(root, 'src/platform/media/manifest.generated.ts'),
  `${header}export const PRESENT_ASSETS: Readonly<Record<string, string>> = {\n${entries}${
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

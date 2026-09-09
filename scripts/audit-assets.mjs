#!/usr/bin/env node
/**
 * Print the approved-asset audit (specification §29).
 *
 * Reports every registered asset as present or missing, in the exact wording
 * the brief asks for, so the gap is quotable rather than paraphrased.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const registrySource = readFileSync(join(root, 'src/platform/media/assets.ts'), 'utf8');
const manifestSource = readFileSync(join(root, 'src/platform/media/manifest.generated.ts'), 'utf8');

const assets = [...registrySource.matchAll(/slug: '([a-z0-9-]+)',[\s\S]{0,400}?kind: '(banner|service)'/g)]
  .map((m) => ({ slug: m[1], kind: m[2] }));

const present = new Set(
  [...manifestSource.matchAll(/^\s*'([a-z0-9-]+)':/gm)].map((m) => m[1]),
);

const missing = assets.filter((a) => !present.has(a.slug));

console.log(`Toothlogy approved image assets: ${present.size} of ${assets.length} present.\n`);

if (missing.length === 0) {
  console.log('All approved assets are present.');
} else {
  for (const asset of missing) {
    console.log(`MISSING APPROVED ASSET: ${asset.slug} (${asset.kind})`);
  }
  console.log(
    `\n${missing.length} missing. Place the approved files in public/brand/banners or ` +
      'public/brand/services named exactly after the slug, then run `npm run assets:sync`.',
  );
}

// Non-zero exit would fail CI while assets are legitimately pending, so this
// reports and succeeds. It is a status command, not a gate.

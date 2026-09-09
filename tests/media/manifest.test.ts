/**
 * Asset manifest is in step with the filesystem.
 *
 * The manifest is generated and committed, which makes presence a build-time
 * fact — but a generated file that nobody regenerated is a stale one. This
 * fails the suite when a delivered image has not been synced, so the symptom
 * is a red test rather than a blank space on a treatment page.
 */

import { existsSync, readdirSync } from 'node:fs';
import { extname, basename, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ASSET_BY_SLUG, ASSET_DIRECTORY, ASSET_EXTENSIONS } from '@/platform/media';
import { PRESENT_ASSETS } from '@/platform/media/manifest.generated';

const ROOT = process.cwd();

/** Every recognised asset file actually sitting in the public directories. */
function scanDelivered(): Map<string, string> {
  const found = new Map<string, string>();

  for (const directory of Object.values(ASSET_DIRECTORY)) {
    const absolute = join(ROOT, 'public', directory.replace(/^\//, ''));
    if (!existsSync(absolute)) continue;

    for (const file of readdirSync(absolute)) {
      const extension = extname(file).slice(1).toLowerCase();
      if (!(ASSET_EXTENSIONS as readonly string[]).includes(extension)) continue;
      const slug = basename(file, extname(file));
      if (!ASSET_BY_SLUG.has(slug)) continue;
      if (!found.has(slug)) found.set(slug, `${directory}/${file}`);
    }
  }

  return found;
}

describe('manifest', () => {
  it('lists exactly the approved files that are on disk', () => {
    const delivered = scanDelivered();
    expect(Object.keys(PRESENT_ASSETS).sort()).toEqual([...delivered.keys()].sort());
  });

  it('records a path that actually resolves for every listed asset', () => {
    for (const [slug, src] of Object.entries(PRESENT_ASSETS)) {
      const absolute = join(ROOT, 'public', src.replace(/^\//, ''));
      expect(existsSync(absolute), `${slug} → ${src}`).toBe(true);
    }
  });

  it('only records slugs that are registered', () => {
    // A file named after nothing in the registry is ignored by the sync
    // script rather than guessed at; this asserts none slipped through.
    for (const slug of Object.keys(PRESENT_ASSETS)) {
      expect(ASSET_BY_SLUG.has(slug), slug).toBe(true);
    }
  });
});

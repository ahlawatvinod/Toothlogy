/**
 * PWA icons, rendered from the brand mark.
 *
 *   /pwa-icons/192           any-purpose icon
 *   /pwa-icons/512           any-purpose icon
 *   /pwa-icons/maskable-512  maskable: the mark inside the 80% safe zone on a
 *                            full-bleed brand ground, so circular and squircle
 *                            launcher masks never crop the tooth
 *
 * Rendered from `public/brand/toothlogy-mark.svg` rather than committed as
 * PNGs, so the installed icon cannot drift from the mark. Static asset, not
 * an API: no session, no data, cacheable forever per deployment.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';

const SIZES = new Set(['192', '512', 'maskable-512']);

let markDataUri: string | null = null;

async function mark(): Promise<string> {
  if (!markDataUri) {
    const svg = await readFile(path.join(process.cwd(), 'public', 'brand', 'toothlogy-mark.svg'));
    markDataUri = `data:image/svg+xml;base64,${svg.toString('base64')}`;
  }
  return markDataUri;
}

export async function GET(_request: Request, context: { params: Promise<{ size: string }> }) {
  const { size } = await context.params;
  if (!SIZES.has(size)) return new Response('Not found', { status: 404 });

  const maskable = size.startsWith('maskable');
  const pixels = maskable ? 512 : Number(size);
  const inner = maskable ? Math.round(pixels * 0.72) : pixels;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: maskable ? '#1c85a0' : 'transparent',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- rendered to PNG by ImageResponse, not a page image */}
        <img src={await mark()} width={inner} height={inner} alt="" />
      </div>
    ),
    {
      width: pixels,
      height: pixels,
      headers: { 'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800' },
    },
  );
}

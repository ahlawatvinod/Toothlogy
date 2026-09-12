/**
 * TL-TEST-E2E-A11Y-001 — automated accessibility scan (axe-core).
 *
 * Each public page is scanned against WCAG 2.1 A and AA; serious and critical
 * violations fail the test, listed with the elements they were found on. The
 * scanner is injected into the page, so the context bypasses the page's
 * Content Security Policy — for the test only; the policy itself is checked by
 * the production smoke test.
 */

import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

const AXE = resolve('node_modules/axe-core/axe.min.js');

const PAGES = ['/', '/about', '/find?type=dentist', '/which-dentist', '/knowledge', '/careers', '/marketplace', '/colleges', '/community', '/for-dentists', '/for-clinics', '/help', '/login', '/register', '/privacy', '/terms', '/terms/interns-volunteers'];

interface AxeResult {
  violations: Array<{
    id: string;
    impact: string | null;
    help: string;
    nodes: Array<{ target: string[]; any: Array<{ data?: { fgColor?: string; bgColor?: string; contrastRatio?: number } | null }> }>;
  }>;
}

test.use({ bypassCSP: true });

for (const path of PAGES) {
  test(`no serious or critical WCAG 2.1 AA violations on ${path}`, async ({ page }) => {
    await page.goto(path, { timeout: 240_000 });
    await page.addScriptTag({ path: AXE });
    const violations = await page.evaluate(async () => {
      const axe = (window as unknown as { axe: { run: (context: Document, options: object) => Promise<AxeResult> } }).axe;
      const result = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
      return result.violations
        .filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .map((v) => {
          // For contrast failures, name the colours and the measured ratio.
          const nodes = v.nodes.slice(0, 5).map((n) => {
            const data = n.any.find((check) => check.data?.contrastRatio)?.data;
            return data ? `${n.target.join(' ')} [${data.fgColor} on ${data.bgColor} = ${data.contrastRatio}:1]` : n.target.join(' ');
          });
          return `${v.id} (${v.impact}) ${v.help}: ${nodes.join(' | ')}`;
        });
    });
    expect(violations).toEqual([]);
  });
}

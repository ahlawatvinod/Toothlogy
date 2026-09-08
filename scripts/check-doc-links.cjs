/**
 * Verify that every relative markdown link in docs/ and the root README resolves
 * to a file that exists.
 *
 * A broken cross-reference is the first stage of documentation rot: it means a
 * file was renamed or never written, and nothing complained. This turns that
 * into a check.
 *
 * Usage:  node scripts/check-doc-links.cjs
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOTS = ['docs', '.'];
const LINK = /\[[^\]]*\]\(([^)]+)\)/g;

function markdownFiles(dir, depth = 0) {
  if (depth > 6) return [];
  const out = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      out.push(...markdownFiles(full, depth + 1));
    } else if (entry.name.endsWith('.md')) {
      out.push(full);
    }
  }
  return out;
}

const files = new Set();
for (const root of ROOTS) {
  if (!fs.existsSync(root)) continue;
  if (root === '.') {
    for (const name of ['README.md', 'AGENTS.md', 'CLAUDE.md']) {
      if (fs.existsSync(name)) files.add(name);
    }
  } else {
    for (const f of markdownFiles(root)) files.add(f);
  }
}

const broken = [];

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  const dir = path.dirname(file);

  for (const match of content.matchAll(LINK)) {
    const target = match[1].trim();

    // Skip external links, anchors and mail links — only local paths are checked.
    if (/^(https?:|mailto:|#)/.test(target)) continue;

    const withoutAnchor = target.split('#')[0];
    if (!withoutAnchor) continue;

    const resolved = path.resolve(dir, withoutAnchor);
    if (!fs.existsSync(resolved)) {
      const line = content.slice(0, match.index).split('\n').length;
      broken.push(`${file}:${line} → ${target}`);
    }
  }
}

if (broken.length > 0) {
  console.error(`Broken documentation links (${broken.length}):`);
  for (const entry of broken) console.error(`  ${entry}`);
  process.exit(1);
}

console.log(`All relative links resolve across ${files.size} markdown files.`);

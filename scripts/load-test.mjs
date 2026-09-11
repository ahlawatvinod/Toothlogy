/**
 * A small, dependency-free load test.
 *
 *   node scripts/load-test.mjs [baseUrl] [concurrency] [seconds]
 *
 * Runs `concurrency` virtual users for `seconds`, each requesting the public
 * paths below in turn, and reports per-path and overall throughput, errors
 * and latency percentiles. Point it at a production build (`next start`), not
 * the development server, and never at a live deployment without permission.
 */

const base = process.argv[2] ?? 'http://localhost:3021';
const concurrency = Number(process.argv[3] ?? 20);
const seconds = Number(process.argv[4] ?? 30);
const PATHS = ['/', '/find?type=dentist', '/knowledge', '/careers', '/which-dentist', '/marketplace', '/api/v1/health'];

const samples = new Map(PATHS.map((p) => [p, []]));
const errors = new Map(PATHS.map((p) => [p, 0]));
const deadline = Date.now() + seconds * 1000;

async function user(offset) {
  let i = offset;
  while (Date.now() < deadline) {
    const path = PATHS[i++ % PATHS.length];
    const started = performance.now();
    try {
      const response = await fetch(base + path, { redirect: 'manual' });
      await response.arrayBuffer();
      if (response.status >= 400) errors.set(path, errors.get(path) + 1);
    } catch {
      errors.set(path, errors.get(path) + 1);
    }
    samples.get(path).push(performance.now() - started);
  }
}

const pct = (sorted, p) => (sorted.length ? Math.round(sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]) : 0);

const began = Date.now();
await Promise.all(Array.from({ length: concurrency }, (_, n) => user(n)));
const elapsed = (Date.now() - began) / 1000;

let total = 0;
let totalErrors = 0;
const all = [];
console.log(`load test: ${base}, ${concurrency} concurrent users, ${elapsed.toFixed(1)} s`);
for (const path of PATHS) {
  const sorted = samples.get(path).sort((a, b) => a - b);
  total += sorted.length;
  totalErrors += errors.get(path);
  all.push(...sorted);
  console.log(`${path.padEnd(22)} ${String(sorted.length).padStart(6)} req  errors ${errors.get(path)}  p50 ${pct(sorted, 50)} ms  p95 ${pct(sorted, 95)} ms  p99 ${pct(sorted, 99)} ms`);
}
all.sort((a, b) => a - b);
console.log(`TOTAL ${total} requests, ${(total / elapsed).toFixed(1)} req/s, errors ${totalErrors} (${((totalErrors / Math.max(total, 1)) * 100).toFixed(2)}%), p50 ${pct(all, 50)} ms, p95 ${pct(all, 95)} ms, p99 ${pct(all, 99)} ms`);
process.exit(totalErrors / Math.max(total, 1) > 0.01 ? 1 : 0);

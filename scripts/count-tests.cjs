/**
 * Report the test count per suite from a Vitest JSON run.
 *
 * Exists so the numbers quoted in docs/testing/TESTING-STRATEGY.md are read
 * from an actual run rather than estimated — a documented test count that
 * nobody verifies is exactly the kind of claim Constitution P9 forbids.
 *
 * Usage:
 *   npx vitest run --reporter=json --outputFile=.test-results.json
 *   node scripts/count-tests.cjs .test-results.json
 */

const path = require('node:path');

const file = process.argv[2] || '.test-results.json';
const results = require(path.resolve(process.cwd(), file));

const rows = [];
let total = 0;

for (const suite of results.testResults) {
  const normalized = suite.name.split(path.sep).join('/');
  const relative = normalized.includes('TOOTHLOGY/')
    ? normalized.split('TOOTHLOGY/')[1]
    : normalized;

  rows.push([suite.assertionResults.length, relative]);
  total += suite.assertionResults.length;
}

rows.sort((a, b) => a[1].localeCompare(b[1]));

for (const [count, name] of rows) {
  console.log(String(count).padStart(3), name);
}

console.log('---');
console.log(String(total).padStart(3), `TOTAL across ${rows.length} suites`);

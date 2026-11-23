// Usage:
//   npm run pier -- export <empty-dir>   write the public archive to a pier (read-only on the database)
//   npm run pier -- verify <dir>         check a pier offline: hashes, originals, journal chain
import { resolve } from 'node:path';
import { database } from '../src/lib/server/db';
import { exportPier, verifyPier } from '../src/lib/server/pier';
const [command, target] = process.argv.slice(2);
if (!['export', 'verify'].includes(command ?? '') || !target) {
  console.error('Usage: npm run pier -- export|verify <directory>');
  process.exit(2);
}
const dir = resolve(target);
if (command === 'export') {
  const m = await exportPier(await database(), dir);
  console.log(
    `Pier written to ${dir}: ${m.counts.documents} documents, ${m.counts.revisions} revisions, ${m.counts.journal} journal entries, ${m.counts.originals} originals.`,
  );
  if (m.counts.missing_originals)
    console.warn(
      `${m.counts.missing_originals} original file(s) could not be read and are not in the pier.`,
    );
}
const v = await verifyPier(dir);
console.log(
  v.ok
    ? 'Pier verified: every hash matches.'
    : 'Pier problems:\n- ' + v.problems.join('\n- '),
);
process.exit(v.ok ? 0 : 1);

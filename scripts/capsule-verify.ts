// Verify a Yogilib time capsule offline: npm run capsule:verify -- capsule.json
import { readFile } from 'node:fs/promises';
import { verifyCapsule } from '../src/lib/server/capsule';
const file = process.argv[2];
if (!file) {
  console.error('Usage: npm run capsule:verify -- <capsule.json>');
  process.exit(2);
}
const capsule = JSON.parse(await readFile(file, 'utf8'));
const result = verifyCapsule(capsule);
if (!result.ok) {
  console.error(`Capsule is NOT intact: ${result.error}`);
  process.exit(1);
}
console.log(
  `Capsule intact: ${capsule.counts.documents} documents, ${capsule.counts.revisions} revisions, root ${result.root}`,
);

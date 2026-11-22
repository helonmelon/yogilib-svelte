import { database, migrate, isDemo } from '../src/lib/server/db';
if (!isDemo() && process.env.YOGILIB_ALLOW_MIGRATIONS !== '1')
  throw Error(
    'Migration disabled. Use a backed-up development database and explicitly set YOGILIB_ALLOW_MIGRATIONS=1.',
  );
const applied = await migrate(await database());
console.log(
  `Additive migrations completed (${applied.join(', ')}). No archive reset performed.`,
);
process.exit(0);

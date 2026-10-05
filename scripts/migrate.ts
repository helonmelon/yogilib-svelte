import { database, migrate, isDemo } from '../src/lib/server/db';
if (!isDemo() && process.env.YOGILIB_ALLOW_MIGRATIONS !== '1')
  throw Error(
    'Migration disabled. Use a backed-up development database and explicitly set YOGILIB_ALLOW_MIGRATIONS=1.',
  );
await migrate(await database());
console.log(
  'Additive platform migration completed. No archive reset performed.',
);
process.exit(0);

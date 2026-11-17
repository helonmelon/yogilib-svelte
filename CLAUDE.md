# Working on Yogilib 0.2

SvelteKit + TypeScript is the active runtime. Follow the current Svelte/Node implementation and documentation.

- Preserve Devanagari and original archive material; localize interface strings only.
- Keep the compact saffron design and all permissions enforced on the server.
- Use Node 22+ and the committed npm lockfile: npm ci.
- Run npm run check, npm test, npm run build, and npm run build:mobile for relevant changes.
- npm run dev uses isolated PGlite data in ignored .local/. Never load live Neon for tests.
- External Postgres schema updates are explicit: review migrations before db:migrate. No destructive reset scripts.
- Never expose credentials, commit .env.local, or commit uploaded originals.
- Preserve existing work, inspect Git before syncing, and report branch, commit, checks, and push status.
- No production deployment or store submission without explicit authorization.
- Native builds must be tested on iOS/Android before claiming device functionality or store readiness.

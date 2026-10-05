# Development and release guide

Use a separate Neon development branch and copied original-file directory for rehearsal. Verify record and attachment counts before changing anything.

1. Configure a private `.env.local` with the development `DATABASE_URL`, `ORIGIN`, `PUBLIC_APP_ORIGIN`, and a persistent upload directory or S3 configuration. Leave `YOGILIB_DATABASE` unset.
2. Review `migrations/001-platform.sql`, then explicitly set `YOGILIB_ALLOW_MIGRATIONS=1` for `npm run db:migrate`. Remove the flag afterward. The migration is additive and does not reset documents, passwords or notes.
3. Run the Node server and compare titles, scripts, metadata, HTML, notes, revisions, original files, search results and role permissions against the development database.
4. Verify browser reading, offline reload, downloads, note retries, progress conflicts and logout. Test large PDFs and Devanagari content.
5. Plan production cutover separately, with a tested backup and rollback plan. Do not run two application versions against a live database without checking concurrent-write compatibility.

New uploads use S3 or a persistent server directory. Existing `/static/docs` reads are read-only; deleting an archive record does not delete those files.

## Server packaging

The Dockerfile builds the Node application. It does not deploy the application, provision a database or run migrations. Configure HTTPS, `ORIGIN`, trusted proxy settings and persistent originals at the hosting layer. Never use `YOGILIB_DATABASE=pglite` for a publicly exposed server.

## Mobile

Set `VITE_API_URL` to the approved HTTPS Node backend, then run `npm run mobile:sync`. Physical-device compilation, signing, store metadata and submission require separate validation and authorization.

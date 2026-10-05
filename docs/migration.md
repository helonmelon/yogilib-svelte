# Development migration and release guide

## Preserve and compare

The untouched sibling `yogilib0.1/` contains the original Go checkout and Git history at `249a3e92b108a17f5ed7ede37a20621ee21f87f5`. `yogilib0.1.zip` contains the tracked source plus an all-refs Git bundle. It does not contain ignored credentials, the shared Neon database, or Mac/Windows-only `static/docs` uploads. The reported Windows checkout at `af6f572` is separate and has not been changed by this migration.

The Svelte checkout is on `migration/sveltekit`, based on `249a3e9`. The user authorized publishing the source to `helonmelon/yogilib-svelte`; inspect Git status and remote refs for publication state. Historical documentation is in `docs/v0.1`. No automatic Go/Fly deployment workflow is carried forward. No external deployment was performed.

## Rehearse on a development copy

1. Back up the database and original files independently. Restore them into an isolated PostgreSQL development database and a copied original-file directory. Verify record counts and attachment counts before changing anything.
2. Configure a private `.env.local` with the development `DATABASE_URL`, `ORIGIN`, `PUBLIC_APP_ORIGIN`, a persistent `YOGILIB_UPLOAD_DIR` or S3 configuration, and `LEGACY_UPLOAD_DIR` pointing to the copied old `static/docs`. Leave `YOGILIB_DATABASE` unset. Never put private credentials in `VITE_` variables.
3. Review `migrations/001-platform.sql`, then explicitly enable `YOGILIB_ALLOW_MIGRATIONS=1` for `npm run db:migrate`. Remove the flag afterward. The migration is additive; it does not reset documents, passwords or notes. Index creation can lock a busy table, so do not apply this unreviewed to production.
4. Build and start the Node server. Compare titles, original scripts, authors/dates, descriptions, HTML, notes, revisions, original files, search results and role permissions against the preserved Go app. Existing bcrypt accounts should sign in again; old session cookies are not reused.
5. Verify browser reading and offline reload, then physical iOS/Android login, cookie persistence, original viewing, downloads, airplane-mode restart, note retries, progress conflicts and logout. Test with large PDFs and Devanagari content.
6. Only after those checks, plan a separately approved production cutover and native release. Keep a tested database/file backup and rollback plan. Do not run two application versions against a live database without checking concurrent-write compatibility.

The code provides an S3 backend for new uploads. It does not bulk-import legacy files into a bucket or rewrite existing file paths. Legacy `/static/docs` reads are read-only; deleting an archive record does not delete that legacy file. Old Go note/revision mutation endpoints move to `/api/documents/...`; public document links remain stable.

## Server packaging

The Dockerfile builds the Node application. It does not deploy it, provision a database or run schema migrations. Configure HTTPS at the hosting layer, the correct `ORIGIN`, trusted proxy settings appropriate to that host, and persistent originals or S3 before using it. Never use `YOGILIB_DATABASE=pglite` for a publicly exposed server because it enables demo sign-in.

Example local build only:

```sh
docker build -t yogilib:development .
```

Container building has not been verified in the cloud sandbox. The tested runtime is direct Node execution.

## Mobile build configuration

Set `VITE_API_URL` in the build environment or `.env.local` to the approved HTTPS Node backend, then run `npm run mobile:sync`. This value is public and embedded into the mobile client. Clear it when building the same-origin website unless a deliberately separate API origin is intended. Android Studio/Android SDK and Xcode/macOS are needed for native compilation. The scaffold uses Capacitor’s generated platform requirements; verify them with your installed IDE before release.

The provisional bundle identifier is `org.yogilib.archive`. Native signing keys, store accounts, privacy disclosures, artwork, distribution choices and real-device validation are outstanding. A successful static mobile build or `cap sync` is not proof of a working signed native app.

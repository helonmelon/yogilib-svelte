# Yogilib 0.2 — Svelte website and mobile app

Yogilib preserves Yogi Narharinath’s works and Nepal’s historical material. This development migration replaces the Go application with SvelteKit, TypeScript and a Node server. A Capacitor build packages the shared interface for Android and iOS. PostgreSQL remains the shared database; downloaded works are stored separately on each device.

The previous Go source and full Git history are preserved in the sibling `yogilib0.1/` folder and the saved `yogilib0.1.zip` archive. This migration is based on upstream commit `249a3e92b108a17f5ed7ede37a20621ee21f87f5`, on local branch `migration/sveltekit`. The migration is prepared for https://github.com/helonmelon/yogilib-svelte. It has not been deployed or connected to the live archive. Check Git status and remote refs for the current commit and push state.

## Run an isolated development website

Install Node 22 or newer, then:

```sh
npm ci
npm run dev
```

Open the address Vite prints **on the computer running this command**. A cloud sandbox localhost address is not Windows localhost. The default development server uses PGlite, an embedded PostgreSQL engine, and saves disposable development data under `.local/postgres`. No external database or Go installation is required.

The login page has reader, uploader and admin demo buttons. These accounts exist only in PGlite development mode. The sample archive contains the treaty fixture preserved from the Go application, not the shared live archive. Uploads go to `.local/uploads` unless object storage is explicitly configured. Do not expose demo mode publicly.

## Build and verify

```sh
npm run check
npm test
npm run build
npm run test:smoke
```

`test:smoke` starts a temporary production Node server with a disposable PGlite database, checks public pages and authenticated pages, then stops it. It does not use `.env.local` or mutate a shared database. For a local production-mode demo after building:

```sh
# POSIX shell
YOGILIB_DATABASE=pglite ORIGIN=http://localhost:3000 npm start
```

PowerShell equivalent:

```powershell
$env:YOGILIB_DATABASE = 'pglite'
$env:ORIGIN = 'http://localhost:3000'
npm start
```

The browser offline service worker is enabled in production builds on HTTPS or localhost. The Vite development server intentionally does not register it.

## Shared PostgreSQL and original files

See [migration and release guide](docs/migration.md) before connecting any existing archive. Neon/PostgreSQL is suitable for the shared users, archive metadata, notes, revisions and reading positions. PostgreSQL is a server dependency; the app does not download a server database.

Use private environment configuration for `DATABASE_URL`. Normal external-database startup does **not** create schema or seed records. The additive SQL migration must be reviewed and run explicitly against a backed-up development copy first. Keep `YOGILIB_DATABASE` unset when using an external PostgreSQL server.

Original PDFs/images are separate from the database. New uploads use a configured S3-compatible bucket or a persistent server directory. Existing Go `/static/docs/...` URLs can be served from the read-only `LEGACY_UPLOAD_DIR`. Those untracked files are not present in this cloud backup and must be transferred separately before a real migration.

## Android and iOS

`android/` and `ios/` contain generated Capacitor projects. Set `VITE_API_URL` to the approved HTTPS SvelteKit backend, then:

```sh
npm run mobile:sync
npm run mobile:android
# On a Mac with Xcode:
npm run mobile:ios
```

`mobile:sync` builds a static mobile client and copies it into both native projects. The native client talks to the shared Node API; it does not bundle a Node server or PostgreSQL. Downloads use native SQLite plus app-private filesystem storage. Browser downloads use IndexedDB.

For a compile check without an online backend, use `MOBILE_VALIDATE_ONLY=1 npm run build:mobile` (POSIX), or set `$env:MOBILE_VALIDATE_ONLY = '1'` first in PowerShell. This produces an intentionally unconfigured bundle and must not be distributed.

Actual native compilation, physical-device testing, signing, app icons, store metadata and store submission remain to be done. `org.yogilib.archive` is a provisional app identifier. No APK, IPA or store-ready app is claimed.

## What is included

- Public document reading and the original About, Works, Excerpts, Mission, Resources and Store pages.
- Login, viewer/uploader/admin permissions, archive search and category filtering.
- Uploads, original PDF/image reading, rich-text/source editing, Preeti and ITRANS conversion.
- Private notes/highlights, passage links, reading tools, revision history and restore.
- English/Nepali interface with original Nepali/Sanskrit/English archive text retained.
- Downloaded reading, queued private notes, reading-position synchronization with explicit conflict handling.

The Store remains the existing informational placeholder. Payments, self-registration and password-reset flows were not present in the old application and are not added here.

Read [architecture](docs/architecture.md), [feature parity and validation](docs/verification.md), and [current handoff](docs/09-chatgpt-project-context.md). Historical documentation is retained unchanged under `docs/v0.1/`; its Go commands and old deployment details do not describe this version.

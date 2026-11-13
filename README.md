# Yogilib 0.2 — Svelte website and mobile app

Yogilib preserves Yogi Narharinath’s works and Nepal’s historical material. It uses SvelteKit, TypeScript and a Node server. A Capacitor build packages the shared interface for Android and iOS. PostgreSQL is the shared database for users, documents, notes and revisions.

The project source is maintained at https://github.com/helonmelon/yogilib-svelte. Check Git status and remote refs before publishing changes.

## Run an isolated development website

Install Node 22 or newer, then:

```sh
npm ci
npm run dev
```

Open the address Vite prints on the computer running this command. The default development server uses PGlite, an embedded PostgreSQL engine, and saves disposable development data under `.local/postgres`.

The archive homepage and `/document/:id` pages are public. Sign-in has two paths: **Continue with Google** is a disabled placeholder, and **Contributor login** (`/contributor-login`) takes an email and password. In PGlite development mode the contributor page also shows reader, uploader and admin demo buttons; those accounts exist only there. The sample archive contains a treaty fixture, not the shared live archive. Uploads go to `.local/uploads` unless object storage is explicitly configured. Do not expose demo mode publicly.

## Build and verify

```sh
npm run check
npm test
npm run build
npm run build:mobile   # set MOBILE_VALIDATE_ONLY=1 when no backend URL is configured
npm run test:smoke
```

> **Known issue:** `npm run test:smoke` currently fails at `/about`. `scripts/smoke.mjs` still expects the removed informational, store and excerpt routes, and still expects `/` to redirect to `/login` although the archive is now public. Update the script before relying on it.

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

Original PDFs/images are separate from the database. New uploads use a configured S3-compatible bucket or a persistent server directory. Existing `/static/docs/...` URLs can be served from the read-only `LEGACY_UPLOAD_DIR`.

## Android and iOS

`android/` and `ios/` contain generated Capacitor projects. Set `VITE_API_URL` to the approved HTTPS SvelteKit backend, then:

```sh
npm run mobile:sync
npm run mobile:android
# On a Mac with Xcode:
npm run mobile:ios
```

`mobile:sync` builds a static mobile client and copies it into both native projects. The native client talks to the shared Node API; it does not bundle a Node server or PostgreSQL. The offline storage layer (native SQLite plus app-private files; IndexedDB in browsers) is still in the code, but no download button is currently shown in the reader.

For a compile check without an online backend, use `MOBILE_VALIDATE_ONLY=1 npm run build:mobile` (POSIX), or set `$env:MOBILE_VALIDATE_ONLY = '1'` first in PowerShell. This produces an intentionally unconfigured bundle and must not be distributed.

Actual native compilation, physical-device testing, signing, app icons, store metadata and store submission remain to be done. `org.yogilib.archive` is a provisional app identifier. No APK, IPA or store-ready app is claimed.

## What is included

- Public archive homepage with search and category filtering, and public document reading.
- Google sign-in placeholder (disabled) and email/password contributor login.
- Viewer, uploader and admin roles, all enforced on the server.
- Uploads of original PDFs and images (PDF/PNG/JPEG/WebP, up to 50 MB), with original-file viewing.
- Rich-text/source editing with an embedded Preeti/ITRANS converter (options dropdown) and a word count.
- Private notes and highlights, passage links, reading tools, reading-position save/resume, revision history and restore.
- Deletion with in-app confirmation: uploaders delete their own documents, admins delete any document, and the admin dashboard can delete all documents.
- English/Nepali interface; original Nepali/Sanskrit/English archive text is retained.
- Queued private notes and reading-position sync with explicit conflict handling.

## Removed or not implemented

- The downloads page, informational pages (about, works, mission, similar, store) and the excerpts section have been removed from navigation and routing. Their source content is still in `src/lib/content/`, and the offline download code (`src/lib/client/offline.ts`, `src/offline/`) remains, but the reader no longer offers a download button.
- Google sign-in, payments, self-registration and password reset are not implemented.

See the [project map](docs/projectmap.md) for where everything lives and what to do next. Read [architecture](docs/architecture.md), [feature validation](docs/verification.md), and [release guidance](docs/migration.md).

# Yogilib project map

Updated 2026-11-13. A one-page guide to where things live, how a request flows, and what to do next.

## 1. Pages (what a visitor sees)

| URL                  | File                                       | Who can use it                                            |
| -------------------- | ------------------------------------------ | --------------------------------------------------------- |
| `/`                  | `src/routes/+page.svelte`, `+page.ts`      | Everyone: archive list, search, categories                |
| `/document/:id`      | `src/routes/document/[id]/`                | Everyone reads; signed-in users get notes/progress        |
| `/document/:id/edit` | `src/routes/document/[id]/edit/`           | Admins                                                    |
| `/upload`            | `src/routes/upload/`                       | Uploaders and admins                                      |
| `/dashboard`         | `src/routes/dashboard/`                    | Admins (includes "Delete all documents")                  |
| `/login`             | `src/routes/login/`                        | Google placeholder (disabled) + link to contributor login |
| `/contributor-login` | `src/routes/contributor-login/`            | Email/password sign-in; demo buttons in PGlite mode       |
| `/static/docs/:name` | `src/routes/static/docs/[name]/+server.ts` | Legacy original-file URLs (read only)                     |
| `/api/*`             | `src/routes/api/[...path]/+server.ts`      | JSON API used by the website and the mobile app           |

Shared shell: `src/routes/+layout.svelte` (header, language switch, nav, sync button, footer) and `+error.svelte`.

## 2. Building blocks

```
src/
├─ hooks.server.ts         session lookup, security and cache headers
├─ app.css                 the whole saffron/brown/cream design
├─ lib/
│  ├─ server/              runs only on the Node server
│  │  ├─ api.ts            every API endpoint + role checks
│  │  ├─ archive.ts        search, sanitising, edits, revisions, deletion
│  │  ├─ ledger.ts         append-only hash-chained event log, verify, export, replay
│  │  ├─ auth.ts           bcrypt passwords, hashed sessions
│  │  ├─ db.ts             PostgreSQL / PGlite connection, dev seeding
│  │  └─ storage.ts        upload validation, local disk or S3
│  ├─ client/
│  │  ├─ api.ts            fetch wrapper (uses VITE_API_URL on mobile)
│  │  └─ offline.ts        notes/progress outbox, offline storage
│  ├─ components/          ArchiveList, DocumentReader, DocumentEditor, ConfirmDialog
│  ├─ converters/          Preeti → Unicode, ITRANS → Unicode
│  ├─ i18n.ts + ui-translations.json   English/Nepali interface text
│  ├─ content/             treaty.json (dev sample) + retired page content
│  └─ types.ts
└─ offline/                small standalone offline reader (service worker fallback)
```

Other top-level pieces:

| Path                          | Purpose                                                                                 |
| ----------------------------- | --------------------------------------------------------------------------------------- |
| `migrations/001-platform.sql` | Additive schema for external PostgreSQL; run only via `npm run db:migrate` after review |
| `migrations/002-ledger.sql`   | Additive append-only archive ledger (hash-chained event log); review before migrating  |
| `scripts/`                    | `migrate.ts`, `smoke.mjs`, `offline-worker.mjs`, `check-mobile.mjs`                     |
| `tests/`                      | Vitest: `platform.test.ts` (server workflows), `offline.test.ts` (queue)                |
| `static/static/`              | Fonts, images, legacy CSS/JS                                                            |
| `android/`, `ios/`            | Capacitor native projects (`capacitor.config.ts`)                                       |
| `Dockerfile`, `.env.example`  | Server container and configuration template                                             |
| `docs/`                       | `architecture.md`, `migration.md`, `verification.md`, `hosting.md`, `vision.md`, this map |

## 3. How a request flows

```
Browser / mobile app
   │  page load or action
   ▼
SvelteKit route (+page.ts)  ──► lib/client/api.ts ──► /api/...
                                                       │
                                     hooks.server.ts (session)
                                                       ▼
                                          lib/server/api.ts (permission check)
                                             │                │
                                  lib/server/archive.ts   lib/server/storage.ts
                                             │                │
                                   PostgreSQL / PGlite     disk or S3 originals
```

Signed-in users' notes and reading positions are queued in `lib/client/offline.ts` and synced when online.

## 4. Environments

| Mode              | Command                      | Database                                         |
| ----------------- | ---------------------------- | ------------------------------------------------ |
| Local development | `npm run dev`                | PGlite in `.local/` (demo data)                  |
| Dev against Neon  | `npm run dev:postgres`       | `DATABASE_URL` in `.env.local` (dev branch only) |
| Production server | `npm run build && npm start` | External PostgreSQL                              |
| Mobile client     | `npm run mobile:sync`        | Talks to server via `VITE_API_URL`               |

## 5. Current status (checked 2026-11-13, Node 22)

| Check                                         | Result                      |
| --------------------------------------------- | --------------------------- |
| `npm run check`                               | Pass, 0 errors / 0 warnings |
| `npm test`                                    | Pass, 19 tests              |
| `npm run build`                               | Pass                        |
| `MOBILE_VALIDATE_ONLY=1 npm run build:mobile` | Pass                        |
| `npm run test:smoke`                          | Pass                        |
| Native Android/iOS build, device test         | Not done                    |

## 6. Next steps, in order

1. **Bring the other docs in line.** `docs/architecture.md` still says the archive listing requires login and lists `src/lib/content/` as informational pages; `docs/verification.md` still lists informational pages, excerpts and downloaded reading as working features.
2. **Decide on downloads.** The download button is gone but `download()` in `lib/client/offline.ts` and the `src/offline/` reader remain. Either restore a download button in `DocumentReader.svelte` or remove the dead code (and the cold-start offline shell, service worker and related tests).
3. **Tidy leftovers.** Unused strings in `src/lib/i18n.ts` (Downloads, Excerpts, Mission, Store, …) and unused HTML in `src/lib/content/` (about, mission, works, similar, excerpt).
4. **Login.** Either implement Google sign-in (server-side OAuth in `lib/server/auth.ts` + `api.ts`) or hide the disabled button. Localise the new login page strings through `$t(...)` (they are currently hard-coded English).
5. **Safety on "Delete all documents".** It is permanent and also deletes originals; consider a typed confirmation and making sure backups exist before using it on the live archive.
6. **Migration rehearsal.** Copy the live Neon archive to a development branch, review `migrations/001-platform.sql`, run `npm run db:migrate`, and check stored HTML appearance, passwords, attachments and revisions (see `docs/migration.md`).
7. **Visual and device testing.** Review pages in a real browser (desktop and phone width), then compile and test Android/iOS on devices before any store work.
8. **Release only with explicit approval.** Production deployment and store submission need separate authorisation.

Before every push: `npm run check`, `npm test`, `npm run build`, `npm run build:mobile`, and `npm run test:smoke`.

# Yogilib project map

Updated 2026-11-17. A one-page guide to where things live, how a request flows, and what to do next.

## 1. Pages (what a visitor sees)

| URL                  | File                                       | Who can use it                                            |
| -------------------- | ------------------------------------------ | --------------------------------------------------------- |
| `/`                  | `src/routes/+page.svelte`, `+page.ts`      | Everyone: archive list, search, categories                |
| `/document/:id`      | `src/routes/document/[id]/`                | Everyone reads; signed-in users get notes/progress        |
| `/document/:id/edit` | `src/routes/document/[id]/edit/`           | Admins                                                    |
| `/upload`            | `src/routes/upload/`                       | Uploaders and admins                                      |
| `/dashboard`         | `src/routes/dashboard/`                    | Admins (includes "Delete all documents")                  |
| `/login`             | `src/routes/login/`                        | Join / email sign-in; Google placeholder (disabled)       |
| `/join`              | `src/routes/join/`                         | Everyone: free reader (viewer) sign-up                    |
| `/welcome`           | `src/routes/welcome/`                      | Signed-in readers: language, interests, tour              |
| `/support`           | `src/routes/support/`                      | Everyone: contributions via configured providers          |
| `/support/return/:ref` | `src/routes/support/return/[ref]/`       | Payment result, verified server-side                      |
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
│  │  ├─ auth.ts           bcrypt passwords, hashed sessions, registration, onboarding
│  │  ├─ audit.ts          audit log, archive export, stats
│  │  ├─ ai.ts             Claude reading companion, daily limits
│  │  ├─ payments.ts       eSewa / Khalti / Stripe adapters
│  │  ├─ db.ts             PostgreSQL / PGlite connection, dev seeding
│  │  └─ storage.ts        upload validation, local disk or S3
│  ├─ client/
│  │  ├─ api.ts            fetch wrapper (uses VITE_API_URL on mobile)
│  │  └─ offline.ts        notes/progress outbox, offline storage
│  ├─ components/          ArchiveList, DocumentReader, DocumentEditor, ConfirmDialog, AICompanion
│  ├─ converters/          Preeti → Unicode, ITRANS → Unicode
│  ├─ i18n.ts + ui-translations.json   English/Nepali interface text
│  ├─ content/             treaty.json (dev sample) + retired page content
│  └─ types.ts
└─ offline/                small standalone offline reader (service worker fallback)
```

Other top-level pieces:

| Path                          | Purpose                                                                                 |
| ----------------------------- | --------------------------------------------------------------------------------------- |
| `migrations/*.sql`            | Additive schema (001 platform, 002 growth); run only via `npm run db:migrate` after review |
| `scripts/`                    | `migrate.ts`, `smoke.mjs`, `offline-worker.mjs`, `check-mobile.mjs`                     |
| `tests/`                      | Vitest: `platform.test.ts`, `growth.test.ts` (onboarding/AI/payments), `offline.test.ts` |
| `static/static/`              | Fonts, images, legacy CSS/JS                                                            |
| `android/`, `ios/`            | Capacitor native projects (`capacitor.config.ts`)                                       |
| `Dockerfile`, `.env.example`  | Server container and configuration template                                             |
| `docs/`                       | `architecture.md`, `migration.md`, `verification.md`, this map                          |

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

## 5. Current status (checked 2026-11-17, Node 22)

| Check                                         | Result                        |
| --------------------------------------------- | ----------------------------- |
| `npm run check`                               | Pass, 0 errors / 0 warnings   |
| `npm test`                                    | Pass, 28 tests                |
| `npm run build`                               | Pass                          |
| `MOBILE_VALIDATE_ONLY=1 npm run build:mobile` | Pass                          |
| `npm run test:smoke`                          | Pass (smoke script updated)   |
| Real payment gateway sandbox runs             | Not done                      |
| Live Claude API call                          | Not done (no key in CI/dev)   |
| Native Android/iOS build, device test         | Not done                      |

## 6. Next steps, in order

1. **Sandbox-test contributions.** Use eSewa, Khalti and Stripe test credentials end to end and confirm the eSewa signature and amount format against current eSewa docs (see `docs/growth.md`).
2. **Decide AI privacy.** Enabling `ANTHROPIC_API_KEY` sends archive text and reader questions to Anthropic; add a privacy notice, then try it on a staging copy.
3. **Fonepay QR adapter** once merchant credentials exist; consider a Nepali bank card gateway for international cards if Stripe is not available to the organisation.
4. **Password reset and email verification** for self-registered readers (needs an email provider).
5. **Bring the other docs in line.** `docs/architecture.md` and `docs/verification.md` still describe removed pages and a login-only archive.
6. **Decide on downloads.** The download button is gone but `download()` in `lib/client/offline.ts` and the `src/offline/` reader remain.
7. **Tidy leftovers.** Unused strings in `src/lib/i18n.ts` and unused HTML in `src/lib/content/`.
8. **Google sign-in** (server-side OAuth) or remove the placeholder.
9. **Safety on "Delete all documents".** Use the new JSON backup first; consider a typed confirmation.
10. **Migration rehearsal.** On a Neon development branch, review `migrations/001-platform.sql` and `002-growth.sql`, run `npm run db:migrate`, and check data (see `docs/migration.md`).
11. **Device testing**, then release only with explicit approval.

Before every push: `npm run check`, `npm test`, `npm run build`, `npm run build:mobile`, `npm run test:smoke`.

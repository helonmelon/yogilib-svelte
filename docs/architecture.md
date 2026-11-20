# Yogilib 0.2 architecture

## Product decisions

Use SvelteKit and TypeScript for one shared interface, with server rendering for the website and a static Capacitor client for Android/iOS. Keep PostgreSQL for the shared archive instead of migrating working relational data to another database. Keep original documents in object storage or a persistent directory. Keep offline device caches independent of the shared database.

Preserve the compact saffron, temple-brown and cream visual language. Translate interface labels, not original archive material. Public document URLs remain `/document/:id`; the archive listing requires login. Admins edit and restore; uploaders upload and may delete their own contributions; viewers read and keep private notes.

## Code map

| Location                                   | Responsibility                                              |
| ------------------------------------------ | ----------------------------------------------------------- |
| `src/routes/`                              | SvelteKit pages, layouts and HTTP routes                    |
| `src/routes/api/[...path]/+server.ts`      | Shared JSON API dispatch                                    |
| `src/lib/server/api.ts`                    | Request validation and permission boundaries                |
| `src/lib/server/db.ts`                     | PostgreSQL/PGlite adapters and explicit migrations          |
| `src/lib/server/archive.ts`                | Search, sanitized rendering, revisions and document changes |
| `src/lib/server/auth.ts`                   | Existing bcrypt passwords and revocable, hashed sessions    |
| `src/lib/server/storage.ts`                | Validated originals, local/S3 storage and byte ranges       |
| `src/lib/server/chronicle.ts`              | Append-only, hash-chained log of archive changes            |
| `src/lib/client/offline.ts`                | Local private-note cache and sync outbox                    |
| `src/lib/components/DocumentReader.svelte` | Document tools, notes, history and progress                 |
| `src/lib/components/DocumentEditor.svelte` | Lazy-loaded Quill, source editing and conversion            |
| `src/lib/content/`                         | Preserved informational and sample archive content          |
| `src/lib/converters/`                      | Preeti and ITRANS converters                                |
| `src/offline/`                             | Small standalone browser cold-start offline reader          |
| `migrations/001-platform.sql`              | Additive shared database schema                             |
| `migrations/002-chronicle.sql`             | Additive chronicle (`archive_events`) table                 |
| `android/`, `ios/`                         | Native Capacitor project scaffolds                          |

## Runtime and data flow

The website runs on a Node server using SvelteKit’s Node adapter. Its server-side code accesses PostgreSQL and original storage. The mobile build uses SvelteKit’s static adapter with client-side routing; `VITE_API_URL` points it to the same JSON API. Database and S3 credentials stay on the server.

PostgreSQL stores documents, users, private notes, revision snapshots, session hashes and reading positions. Document column names and IDs are preserved. An additive migration adds nullable note idempotency keys, session storage, reading progress and a search index. External-database startup never runs this migration implicitly.

The default development environment uses the WASM PostgreSQL engine PGlite, not a mocked JSON database. It is single-process development storage, not a substitute for a production PostgreSQL service. It seeds only the development archive.

## Offline behavior and conflict policy

A downloaded work stores its sanitized text/metadata and its original attachment, if present. The work is marked downloaded only after the original succeeds. Web storage uses IndexedDB; native storage uses SQLite for records and Capacitor Filesystem for originals. Assets and fonts are bundled. Arbitrary external images embedded in archive HTML are not fetched as an offline asset graph.

Private notes have a client-generated UUID. The server uses a unique constraint to make retries idempotent. Outbox entries belong to an account; synchronization verifies the current session before sending that account’s queue. A newer locally saved reading position is retained when an older request finishes. Server versions detect conflicting device positions; the reader asks which position to keep.

The production browser service worker precaches only a generic offline shell and its assets. It never caches authenticated server-rendered pages or API responses. Cold-start offline navigation opens this smaller reader, with downloaded search, originals and note creation; the complete online editor/admin UI is not available offline. The native shell bundles the full client. Offline authoring of archive documents is not implemented.

Private cached notes are local plaintext inside browser/app storage, not end-to-end encrypted. Successful logout clears the account’s private cache; it asks before discarding unsynced changes. Logging out from the server requires connectivity. Clearing browser/app storage removes downloads and unsynced work.

## Security and scaling boundaries

Server permissions apply to all mutations regardless of UI controls. Password verification remains bcrypt-compatible. Session cookies are HttpOnly and session tokens are stored hashed. Users must log in when their session is no longer valid. Explicit origin checks protect API writes and allow configured/native origins. Native cookie handling still needs device validation.

Archive HTML is stored without translation and sanitized for rendering. Inline executable markup is stripped; this can change the presentation of stored HTML and must be reviewed on a real archive copy. Originals are limited to PDF/PNG/JPEG/WebP with a 50 MB limit and signature checks. File reads support ranges but currently buffer the full object in memory. High upload/download concurrency will require streaming and durable object-storage operations.

Search combines PostgreSQL’s `simple` text configuration with substring matching. This supports Unicode search without claiming language-aware Nepali/Sanskrit stemming, OCR or semantic search. Login throttling is currently in process; multi-instance deployment needs a shared limiter. Document listing is paginated at 40 rows. No production performance or accessibility audit has been completed.

## Chronicle

Every create, revise, restore, delete and clear-all appends an `archive_events` row in the same transaction. Each row's `hash` is SHA-256 over canonical JSON of `[prev_hash, at, actor, kind, document_id, payload]`; the first row chains from 64 zeros. An advisory transaction lock serializes appends and a unique `prev_hash` index rejects forks. Payloads carry version hashes and titles, not document bodies (revisions hold content). Admins read it at `GET /api/chronicle` and recompute it at `GET /api/chronicle/verify`. On external Postgres without migration 002 the archive works and changes are not chronicled. See `docs/vision.md` for the Urbit-inspired direction.

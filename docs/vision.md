# Yogilib vision: a time capsule that outlives its servers

Drafted 2026-11-20. This is a direction document, not a record of shipped work.
Section 4 lists what exists today.

Yogilib is meant to be a library that people can still trust and read in
fifty years. It should be as broad and as easy to browse as Wikipedia. It
should also be calmer and more durable, and it should not depend on any one
company staying in business.

## 1. Ideas borrowed from Urbit

Urbit rebuilt personal computing so that a user's server is small, owned by
that user, and fully reproducible. In Urbit, the whole state of a ship (a
personal server) is a pure function of an ordered event log. The kernel
(Arvo) is a small set of modules ("vanes") that each own one concern. Data
lives in one global, versioned, read-only namespace ("scry"). Identity is
permanent and cryptographic. The runtime is a thin layer over Unix, so the
system can move to any machine. The docs site (docs.urbit.org) could not be
reached from this session's network, so this summary comes from Urbit's
published design rather than a fresh read. Re-check it against the docs once
that domain is allowed.

| Urbit principle                                         | Yogilib translation                                                                                                                                                                                        |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Event log is the truth.** State = f(events).          | **The chronicle** (`archive_events`): every archive change is appended, never edited. _Shipped (phase 1)._ Later: rebuild the archive from the chronicle plus content-addressed blobs.                     |
| **Solid-state.** No "save" step, no lost writes.        | Every mutation is one transaction: the change, its revision snapshot and its chronicle event commit together or not at all. Offline devices keep an outbox (already true for notes and reading positions). |
| **Small kernel, separate vanes.**                       | Keep `src/lib/server/` as small single-purpose modules: `archive`, `auth`, `storage`, `chronicle`, then `ai`, `payments`, `identity`. Each has a narrow interface and its own tests.                       |
| **Clay: versioned, typed, referentially transparent.**  | Content addressing: a document version is identified by the hash of its fields (`version()` already does this), and originals will be addressed by SHA-256. A link to a version always shows that version. |
| **Scry: one read-only global namespace.**               | Stable, human-readable paths for every object and version, for example `/document/42`, `/document/42@<version>`, and `/chronicle/<seq>`. Reads never have side effects.                                    |
| **Permanent identity (Azimuth).**                       | Accounts are just accounts for now. Later: optional signing keys for contributors, so an exported archive proves who contributed what without trusting our database.                                       |
| **Thin runtime over Unix; your server moves with you.** | **The appliance (phase 6):** a single Yogilib image that boots on bare Linux with its own Postgres, storage directory and the chronicle. Any library, school or family can keep a full, verifiable copy.   |
| **Calm technology.**                                    | No engagement tricks, no ads, no infinite feeds. Quiet saffron design, readable type, fast pages.                                                                                                          |

## 2. Pillars

1. **Seamless onboarding.** A reader gets value with zero sign-up: open the
   site, search, read. Signing in is offered only at the moment it helps
   ("keep this note", "remember my place"). Contributors get a short guided
   first upload with Devanagari/Preeti/ITRANS help built in.
2. **Robust data management.** Append-only chronicle, revision snapshots,
   content-addressed originals, verifiable exports, scheduled backups, and
   restore drills. Nothing is deleted without leaving a record.
3. **Scale and breadth like Wikipedia.** Collections, authors, places and
   eras as first-class pages. Cross-links between works. Citation export.
   Language-aware search. Accessibility and performance budgets.
4. **AI that serves the archive.** Every AI result is labeled, cites the
   source passages, and never overwrites original material.
5. **Sustainable funding.** Donations and optional memberships through both
   international and Nepali payment gateways.
6. **Permanence.** The appliance and peer mirrors (section 1).

## 3. Roadmap

Each phase ships on its own, keeps `npm run check`, `npm test`,
`npm run build` and `npm run build:mobile` green, and adds only additive
migrations.

### Phase 1: the chronicle (done 2026-11-20)

- `migrations/002-chronicle.sql`: an append-only `archive_events` table.
  Each row stores `prev_hash` and its own `hash`, and a unique index on
  `prev_hash` stops the chain from forking.
- `src/lib/server/chronicle.ts` writes an event in the same transaction as
  each create, revise, restore, delete and clear-all.
- `GET /api/chronicle` (admin, paginated with `after`, `limit` and
  `document`) and `GET /api/chronicle/verify`, which recomputes the chain
  from genesis and reports the first broken event.
- External Postgres works without the migration: until it is applied,
  changes simply go unrecorded.

### Phase 2: onboarding

- Signing in is invited only when a reader acts: "Sign in to keep this
  note".
- A three-step contributor welcome: what the archive is, how to upload, and
  how scripts are converted. It is localized and can be dismissed.
- Real Google sign-in with server-side OAuth, replacing the disabled button.
- An empty-state guide on the dashboard for new admins.

### Phase 3: data durability

- SHA-256 content addressing for originals. Duplicate uploads are detected
  and stored once.
- `npm run archive:export`: a portable bundle with documents as JSON, the
  chronicle, original files and a manifest of hashes. Add
  `archive:verify <bundle>` to check one offline.
- Make "Delete all" a soft, recoverable operation (a tombstone event plus a
  retention window) with a typed confirmation.
- Pages for document history (scry-like `/document/:id@version`) and for the
  chronicle.

### Phase 4: Wikipedia-scale browsing

- Entity pages for authors, places, eras and collections, plus "what links
  here".
- Nepali and Sanskrit tokenization for search (Postgres dictionaries or a
  separate index). Facets and date ranges.
- Citation export in BibTeX, CSL-JSON and Chicago.
- A performance and accessibility audit, with budgets enforced in CI.

### Phase 5: AI features (provider-agnostic, off by default)

- A `src/lib/server/ai.ts` module behind one interface. Prefer the latest
  Claude models. Keys stay on the server and the feature is disabled without
  them.
- Features, in order: semantic search over passages (pgvector embeddings), a
  document summary with cited passages, "ask this document" and "ask the
  archive" with citations, OCR of scanned originals into reviewable drafts,
  and translation shown _beside_ the original, never replacing it.
- Guardrails: AI output is labeled and stored separately from archive text.
  Admin review is required before anything enters the archive. Cost limits
  per user and per day.

### Phase 6: payments (donations and memberships)

- A `src/lib/server/payments.ts` module with one adapter per gateway.
  Payments are always verified server-side: the server recomputes the
  signature or calls the gateway's lookup API before granting anything.
  There is an idempotent `payments` table, and every completed payment is a
  chronicle event.
- **Nepal:** eSewa (HMAC-SHA256 signed form, verify by status API), Khalti
  (KPG-2 initiate and lookup), Fonepay (dynamic QR), and later ConnectIPS.
- **International:** Stripe Checkout (cards, Apple Pay, Google Pay) and
  PayPal.
- **Note:** PhonePe is an Indian UPI app, and "GPay" in South Asia usually
  means Google Pay on UPI. Neither settles to Nepali merchants directly.
  Google Pay is covered through Stripe. Indian UPI apps can pay Nepali
  merchants only through the NPCI–Fonepay cross-border QR link, which needs
  a Fonepay merchant account.
- Prerequisites the owner must provide: merchant accounts, a legal entity,
  tax and NRB compliance, and sandbox keys. No live keys are committed and
  nothing goes live without explicit approval.

### Phase 7: the appliance (bare Linux)

- Step 1: a self-contained `docker compose` stack with Postgres, Yogilib and
  local storage, and a single `yogilib` CLI for backup, restore, verify and
  mirror.
- Step 2: a minimal immutable OS image (for example a NixOS or Debian live
  build) that boots straight into Yogilib on a Raspberry Pi or an old PC,
  with the archive on a separate data partition.
- Step 3: peer mirrors. An appliance subscribes to another library's
  chronicle (`GET /api/chronicle?after=`), verifies the chain and replicates
  the documents and blobs.
- Longer term: replace the "Postgres rows are the truth" model with "the
  chronicle is the truth, Postgres is a cache". This would make Yogilib
  reproducible from its log, as Urbit is.

## 4. Status today

| Area              | State                                                                      |
| ----------------- | -------------------------------------------------------------------------- |
| Chronicle         | Shipped (phase 1). External Postgres needs a reviewed `npm run db:migrate` |
| Onboarding        | Public reading without login; contributor login; Google button disabled    |
| AI                | Not started                                                                |
| Payments          | Not started; needs merchant accounts and owner approval                    |
| Bare-Linux target | Docker image only                                                          |

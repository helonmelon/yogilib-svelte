# Yogilib vision and roadmap

Started 2026-11-27. This is the long-range plan behind incremental work. Each item lists what is done, what is next and what needs a human decision. Nothing here authorises a production deployment, a live database migration, or signing up with a payment provider.

## 1. What Yogilib is

Yogilib is a time capsule: a library that should still be readable, verifiable and movable in fifty years. The goal is reference-work scale (think of an encyclopedia's breadth and editorial history) without losing the compact saffron design or the rule that original archive material is never translated or rewritten.

## 2. Design principles borrowed from Urbit

These come from Urbit's published design. The docs at docs.urbit.org could not be fetched from this session (network policy), so this section rests on Urbit's well-known architecture. Check it against the current docs once that host is allowed.

| Urbit idea                                                                                                    | What it means for Yogilib                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **The event log is the truth.** Arvo's state is a pure function of the ordered events it has processed.       | Every archive change is an event in an append-only, hash-chained journal (`archive_events`). Tables are a fast view of that history. Deletion writes a tombstone holding the full document, so it can be undone. **Done (v1).** |
| **Determinism.** The same events always produce the same state.                                               | Events hash canonical JSON. Next step: a replay tool that rebuilds `documents` from the journal alone and compares the result with the live tables.                                                                             |
| **The pier: your whole computer in one directory.**                                                           | `GET /api/export` produces one self-describing snapshot (documents, revisions, journal head). Next: bundle the originals too, so one archive file is the whole library, plus a matching import.                                 |
| **A small, frozen core with upgradeable layers.** Nock is tiny and fixed; Hoon, Arvo and the vanes move fast. | Keep a small, stable data core (documents, revisions, journal, export format with a version number). AI, payments and onboarding are optional modules ("vanes") that may change or be removed without touching the core.        |
| **Permanent identity, owned by the person.** (Azimuth)                                                        | Long term: contributor identities that outlive any one server, with signed contributions. Near term: real sign-in (Google OAuth, email) and attribution on journal events.                                                      |
| **Runs on a thin runtime over the OS.** Vere is a small C runtime; the OS logic sits on top of it.            | See section 7: one self-contained program that runs on bare Linux with a local data directory and no managed services.                                                                                                          |
| **Networking is peer-to-peer and authenticated.** (Ames)                                                      | Later: mirrors that sync by journal (send the events after a known head hash, check the chain, apply them). This is how other libraries could hold verified copies.                                                             |

## 3. Data management

Done in this pass:

- `migrations/002-journal.sql`: additive table, no changes to existing rows. Migrations now run in file order.
- Every create, edit, revision restore, delete and delete-all is journaled **in the same transaction** as the change itself.
- `GET /api/journal` (admin): newest-first event list, filter by `?document=`, paginate with `?before=`.
- `GET /api/journal/verify` (admin): walks the whole chain and reports the first broken link.
- `POST /api/journal/recover/:id` (admin): brings a deleted document back under its original ID with its revision history. Private notes are not kept, on purpose.
- `GET /api/export` (admin): portable JSON snapshot. It contains no accounts, password hashes, sessions or private notes.
- Until the journal migration is run, external databases keep working but nothing is journaled (a warning is logged and the check repeats once a minute).

Next:

1. Admin UI: a "History" page in the dashboard listing journal events, the verify result, and a recover button for deleted documents.
2. Stop removing originals when a document is deleted. Move them to a `trash/` prefix instead, so recovery brings the file back too. (Policy decision: how long to keep them?)
3. Import of an export file into an empty database, and a replay/compare check.
4. Scheduled off-site backups of exports plus originals (needs a destination chosen by the owner).
5. Content-addressed originals (SHA-256 file names) so mirrors can de-duplicate and verify files.

## 4. Seamless onboarding

1. Real sign-in: finish Google OAuth on the server, add email magic links, and keep contributor password login.
2. A first-visit welcome card (dismissible, stored locally) with three entry points: browse, search, contribute.
3. A guided first upload: a step-by-step form with a script detector that suggests Preeti→Unicode or ITRANS conversion automatically.
4. Role requests: a viewer asks for uploader access and an admin approves it in the dashboard.
5. Localise every new string through `$t(...)` in English and Nepali.

## 5. Encyclopedia-scale features

Cross-links between documents, per-document talk/discussion, a "what links here" view, categories as browsable trees, a public change feed (built on the journal), citations and permanent revision links (`/document/:id?rev=`), and full-text search that understands Devanagari better (trigram index, transliteration-aware matching).

## 6. Optional modules

### AI features (server-side only, off unless configured)

Planned behind one `AI_PROVIDER` interface, with API keys held only on the server:

- Search that understands meaning, using embeddings stored in Postgres (pgvector on Neon).
- "Ask the archive": answers drawn from archive passages with citations to `/document/:id`.
- Suggested metadata (category, year, author) for uploads, which a person always confirms.
- OCR of uploaded PDFs/images into searchable text, stored apart from the original (never overwriting it).
- Transliteration help next to the Preeti/ITRANS converters.

AI output must be labelled as AI output and never written into original archive material.

### Payments (donations or memberships)

One `PaymentProvider` interface (create checkout → verify on the server via a signed callback or a status lookup → record the result in the journal). Candidate providers:

| Region        | Providers                                                                       | Notes                                                                                                                                                                                                                                                    |
| ------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nepal         | **eSewa**, **Khalti**, **Fonepay** (QR, used by most Nepali bank apps), IME Pay | Each needs a merchant account and keys from the provider. They have sandbox environments to test against before going live.                                                                                                                              |
| India (UPI)   | PhonePe, Google Pay (GPay), Paytm, usually through Razorpay or Cashfree         | PhonePe and GPay are UPI apps for India. They are not Nepali gateways, and taking UPI needs an Indian business entity, so they will likely be out of reach. In Nepal the matching QR experience is **Fonepay**. Please confirm which countries you need. |
| International | Stripe, PayPal                                                                  | Stripe does not onboard Nepal-registered businesses directly, so PayPal or a registered entity abroad may be needed.                                                                                                                                     |

Nothing gets connected until the owner opens the merchant accounts. Keys go in server environment variables only. Sandbox first.

## 7. Path to bare Linux

Target: one program and one data directory, like an Urbit pier, runnable on a fresh Linux box with no Docker and no managed services.

1. **Now:** Node server plus external Postgres plus S3. The PGlite dev mode already proves the app can run on an embedded database.
2. **Next:** a supported "self-hosted" mode: PGlite (or embedded Postgres) plus local originals under one `YOGILIB_HOME` directory, with a systemd unit file.
3. **Then:** ship it as a single executable (Node SEA or Bun compile) with the offline client bundled, and run `yogilib serve --home /var/lib/yogilib`.
4. **Later:** a minimal bootable image (for example a small Linux base running only Yogilib), with the archive file as the whole machine state, and mirrors syncing over the journal.

## 8. Operating rules (unchanged)

Additive migrations only, reviewed before `db:migrate`. No live Neon in tests. No production deployment or store submission without explicit approval. Preserve Devanagari and original material.

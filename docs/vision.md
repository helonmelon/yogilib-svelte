# Yogilib vision: a library built to last

Drafted 2026-11-21. This is a direction document, not a feature list. Items marked **Built** exist in the code. Everything else is a plan.

Yogilib is a time capsule. Its first job is to keep what it holds intact, readable and owned for decades, longer than any one host, framework or company lasts. Reach, AI and payments all come after that job.

## 1. Ideas borrowed from Urbit

Urbit rebuilds personal computing as a small, deterministic machine that its owner controls. These notes come from Urbit's published design (Nock, Hoon, Arvo, Azimuth, Kelvin versioning). The docs site was not reachable from the session that wrote this, so check the details against docs.urbit.org before relying on them.

| Urbit idea                                  | What it means there                                                                        | What Yogilib takes from it                                                                                                                                                                                                            |
| ------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Event log as the source of truth**        | Arvo's state is a pure function of its event log. Replaying the log rebuilds the computer. | **Built:** `archive_events` is an append-only, hash-chained ledger of every archive change, written in the same transaction as the change. Next: replay the ledger to rebuild the `documents` table and check that it matches.        |
| **Determinism**                             | The same events always produce the same state.                                             | Ledger events are canonical JSON with sorted keys and fixed timestamps, so their hashes can be recomputed anywhere. Converters (Preeti, ITRANS) should stay pure functions with fixed test vectors.                                   |
| **Kelvin versioning**                       | Versions count _down_ toward 0 K. At zero, a component is frozen forever.                  | Version the export format and the ledger event schema by Kelvin: start them at, say, 100 K and only decrease. The goal is a frozen `yogilib-archive` format that any future reader can open.                                          |
| **The pier**                                | A ship's whole state lives in one directory that can be copied, backed up and moved.       | A "pier" for Yogilib: one directory holding the PGlite data, originals and ledger. Copying it moves the whole library. `.local/` already works this way in development.                                                               |
| **Owned identity (Azimuth)**                | Identity is a key the user holds, not an account a provider grants.                        | Long term: sign ledger events with the actor's key, so authorship can be proven without trusting the server. Short term: keep identity portable. **Built:** `/api/me/export` hands every reader their own notes and reading progress. |
| **Small, legible core**                     | The Nock spec fits on a T-shirt, so the base can be audited and reimplemented.             | Keep the server core small (`lib/server/` is about 1,000 lines today). New features go in modules around the core, never inside it.                                                                                                   |
| **The OS runs on a host it does not trust** | Vere hosts Arvo on Unix, but Arvo's semantics do not depend on Unix.                       | Path to bare Linux, below.                                                                                                                                                                                                            |

### Toward running on bare Linux

Each step is useful on its own, and none of them blocks today's hosting.

1. **Self-contained pier (now possible).** PGlite plus local originals already runs without external services. Add `YOGILIB_PIER=/path` to set both the database and upload directories.
2. **One process, one binary.** Bundle the Node server, migrations and static assets into a single executable, using Node single-executable applications or Bun. Target: `yogilib --pier /srv/yogilib` on any x86-64 or arm64 Linux.
3. **Appliance image.** A minimal Linux image (Alpine, or a buildroot/systemd-nspawn image) that boots straight into Yogilib, with the pier on its own disk. Updates are atomic image swaps. The pier is never touched.
4. **Ledger replication.** Mirrors follow `/api/ledger?after=<seq>` and check the hash chain. Any mirror can serve reads and survive the loss of the origin, like many copies of one library in many cities.

## 2. Onboarding

Goal: a first-time visitor understands what Yogilib is and reads a document within 10 seconds, without creating an account.

- The archive is already publicly readable. Keep that.
- Next: a one-time welcome strip on `/` with three choices: _Read_, _Search_, _Contribute_. It is dismissible, remembered per device, and localized through `$t`.
- Sign-up is asked for only when a reader wants to keep something: a note, a reading position, a download. Ask at that moment, then return them to the same passage.
- Contributor onboarding: a guided first upload with the Preeti/ITRANS converter explained in context.

## 3. Data management

- **Built:** a hash-chained ledger covering create, update, restore, delete and delete-all, with `GET /api/ledger/verify` for tamper detection, `GET /api/ledger?after=` to page through events for mirrors, and `GET /api/documents/:id/ledger` for per-document history, which survives deletion. All of these are admin-only.
- **Built:** `GET /api/export`, a full portable archive snapshot (`yogilib-archive` v1) for admins, carrying the ledger head hash. It contains no password hashes and no private notes.
- **Built:** `GET /api/me/export`, which gives every reader a copy of their own data.
- Next: content-address originals (a SHA-256 filename) and record the digest in the ledger, so the files themselves are covered by the chain.
- Next: a "Verify archive" panel in `/dashboard`, and a typed confirmation on "Delete all documents" that shows the ledger head first.
- Next: scheduled off-site export of the snapshot and originals, plus a restore rehearsal.

## 4. Encyclopedia scale

Wikipedia's lasting value comes from stable URLs, open history, linking and citation, not from its page design. In order:

1. Permanent citation URLs, including a link to a specific version (`/document/:id@version`). The ledger already stores every version.
2. Cross-links between works, an authors index and a timeline by the original date (`orig_year`).
3. Public read-only history pages that show who changed what and when, built from the ledger.
4. Moderated suggestions, so readers can propose corrections that admins accept. This is the first step toward community editing.
5. Search beyond substring matching: Devanagari normalization, transliteration-aware queries (ITRANS ↔ Unicode) and OCR for scanned originals.

## 5. AI features

Rules: AI never rewrites archive material. It only adds to it, it labels its output, and it runs on the server with keys that never reach the client.

- Summaries and English ↔ Nepali reading aids, shown beside the original and never stored in `body_html`.
- Semantic search: embeddings over `body_text`, stored in a separate table (pgvector on Postgres).
- "Ask the library": answers that cite and link the passages they draw on.
- OCR of scanned PDFs to propose a text layer for an admin to accept.
- The model provider sits behind one server module. Calls are rate-limited per user, and the use of each source is logged.

## 6. Payments

Payments should fund the library, through donations, patron membership and paid research access, without putting the archive behind a paywall.

Note on providers: PhonePe and Google Pay are Indian UPI apps. Nepal's main wallets and rails are **eSewa, Khalti, Fonepay (QR), ConnectIPS and IME Pay**. Fonepay and NPCI International have announced cross-border UPI-to-Fonepay QR payments, so check its current merchant availability when this work starts. For international cards, Stripe does not onboard Nepal-registered businesses. PayPal or a card processor through an entity in a supported country is the usual route. These are business and legal decisions, not code decisions.

Design:

- One `PaymentProvider` interface on the server: `createIntent`, `verifyCallback` and `refund`. Each gateway is an adapter.
- Treat every gateway callback as untrusted. Verify it server-to-server with the provider's lookup API before granting anything.
- Write payments to their own append-only table, linked to the ledger. Never store card data. Keep credentials only in server environment variables.
- Sandbox credentials only, until the owner explicitly authorizes production.

## 7. Boundaries that stay fixed

- Devanagari and original material are preserved byte for byte. Only interface strings are localized.
- Permissions are enforced on the server, for every route, including the ledger and export.
- Schema changes are additive and applied only through a reviewed `npm run db:migrate`. `002-ledger.sql` creates one new table and changes nothing that already exists. Until it is applied, the code skips recording events and keeps working.

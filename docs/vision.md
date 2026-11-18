# Yogilib vision: a time capsule built to outlast its servers

Drafted 2026-11-18 by an unattended run. This is a direction document, not a
commitment: every item marked _proposed_ needs the owner's decision before it
is built, and nothing here authorises deployment, payments going live, or
store submission.

## 1. What Yogilib is

A library meant to hold Nepali, Sanskrit and English material (books, records,
periodicals, documents) for a very long time. The yardstick is Wikipedia:
open to read, deep in links and history, trusted because every change can be
traced. Unlike Wikipedia, Yogilib is also a time capsule. Original scans and
Devanagari text are kept exactly as received, and the interface around them
can change without touching them.

## 2. Ideas borrowed from Urbit

Urbit is a personal server built as a clean-slate stack: a tiny frozen
instruction set (Nock), a kernel (Arvo) whose whole state is a pure function
of an append-only event log, permanent cryptographic identities (Azimuth),
and a runtime (Vere) that today runs on Unix but is designed so the kernel
does not care what is underneath it. Yogilib won't adopt Urbit's languages or
network. It borrows the principles:

| Urbit principle                                                                                 | What it means for Yogilib                                                                                                                                                         | Status                                                                |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| **The event log is the truth.** Arvo's state is `f(events)`, so it can be replayed and checked. | `archive_events`: an append-only, SHA-256 hash-chained journal of every create, update, restore and delete. `replay(events)` is a pure fold that rebuilds the archive from it.    | **Built** (`src/lib/server/journal.ts`, `migrations/002-journal.sql`) |
| **Solid state.** No separate "save" step: the record is durable by construction.                | Journal entries are written inside the same transaction as the change, so neither can exist without the other.                                                                    | **Built**                                                             |
| **You own your data.** A ship can be moved or backed up whole.                                  | `GET /api/archive/export` (admin): a portable `yogilib-archive/1` JSON bundle of all documents and revisions, tied to the journal head hash. Private notes and accounts stay out. | **Built** (original files still copied separately)                    |
| **Small, frozen core.** Nock is tiny and never changes.                                         | Freeze the archive format: a documented, versioned bundle and event schema that later code must keep reading. Interface code may churn; `yogilib-archive/1` may not.              | Proposed: write the format spec                                       |
| **Content addressing / integrity.** Clay stores data by hash.                                   | Store originals by their SHA-256 hash, record the hash in the journal, and check it on read. Duplicates disappear and silent corruption becomes visible.                          | Proposed                                                              |
| **Permanent identity.** Azimuth points are owned keys, not accounts on someone's server.        | Long term: contributors sign their changes with their own key, so the journal shows who wrote what without trusting the host. Short term: real sign-in (Google, email) first.     | Proposed                                                              |
| **Calm computing.** No feeds or engagement tricks; the software stays quiet.                    | No ads, infinite scroll or dark patterns. Reading comes first. AI is something a reader asks for, never something that rewrites the archive by itself.                            | Design rule                                                           |
| **The host is replaceable.** Vere is just a runtime under a portable kernel.                    | Keep server logic behind narrow interfaces (`DB`, storage, journal) so the same archive runs on Cloud Run today and on a single bare Linux machine later.                         | In progress (see §6)                                                  |

## 3. Robust data management

Done this run:

- Hash-chained journal with `GET /api/archive/verify` (admin), which walks the
  chain and reports the first entry that no longer matches its hash. The admin
  dashboard shows "Journal intact · N entries" or the broken entry.
- Archive export bundle, downloadable from the dashboard.
- `migrate()` now applies every `migrations/NNN-*.sql` in order. All files
  stay additive and idempotent.

Next, in order:

1. **Review and apply `002-journal.sql`** on a Neon _development_ branch
   (`YOGILIB_ALLOW_MIGRATIONS=1 npm run db:migrate`), never production first.
2. **Checkpoint event.** The live archive already has documents from before the
   journal. Add a one-time `checkpoint` event that records a hash of the
   current export, so `replay(checkpoint, events)` covers the whole archive.
3. **Import / restore from a bundle** into an empty development database,
   with a round-trip test: export, import, export again, same hashes.
4. **Content-addressed originals**, with hashes recorded in the journal.
5. **Scheduled off-site backups**: a nightly export plus originals to a
   second provider (for example R2 to B2), with automatic journal verification.
6. Protect "Delete all documents": require a fresh export and typed
   confirmation. (The journal already records the deletion, but the content is
   gone unless an export exists.)

## 4. Seamless onboarding (proposed)

- Reading needs no account. This is already true for the archive and documents.
- First visit: one dismissible strip in the reader's chosen language explaining
  what the archive holds and how to search in Devanagari or romanised text.
- Sign-in only when someone wants notes, reading progress or to contribute.
  Google sign-in (server-side OAuth) replaces the current disabled button.
- Contributor path: request, then admin approval, then a guided first upload
  with script detection and the existing Preeti/ITRANS converters offered
  automatically.
- All new strings go through `$t(...)` with Nepali translations.

## 5. AI features (proposed, opt-in, never rewrites originals)

| Feature                                                            | Notes                                                                                      |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Ask the archive: answers that cite and link the passages they used | Retrieval over `body_text`; answers are labelled as generated and are not archive material |
| Summaries and English/Nepali glosses beside the original           | Stored separately from the document and journaled as their own events                      |
| OCR for scanned originals (Devanagari)                             | Output starts as a draft transcription that an editor must approve                         |
| Script detection and Preeti → Unicode suggestions at upload        | Builds on the existing converters                                                          |
| Semantic search (embeddings, for example pgvector)                 | Adds to the current full-text search; needs a migration and cost review                    |

Rules: the server holds the API keys, every AI call has a per-user rate limit,
and the archive text is never sent to a provider without the owner agreeing.

## 6. Payments (proposed: needs owner decisions)

Payments make sense for donations, memberships and AI usage credits. Reading
stays free.

A correction to the original request: **PhonePe and Google Pay are Indian UPI
apps and do not take payments in Nepal.** The Nepali gateways are:

| Gateway           | Type                              | Notes                                                                                          |
| ----------------- | --------------------------------- | ---------------------------------------------------------------------------------------------- |
| **eSewa**         | Wallet                            | Most widely used; merchant API with HMAC signatures                                            |
| **Khalti**        | Wallet + cards + banking          | Developer-friendly ePayment API                                                                |
| **Fonepay**       | Interbank QR network              | "Fonepay" is likely the "phonepay" meant                                                       |
| **ConnectIPS**    | Direct bank transfer (NCHL)       | Needs a merchant agreement with a bank                                                         |
| International     | Stripe or PayPal                  | Stripe needs a company registered outside Nepal (US, UK, …); PayPal pay-in is limited in Nepal |
| India (if wanted) | Razorpay (UPI incl. PhonePe/GPay) | Only if an Indian entity exists                                                                |

Proposed design: one `PaymentProvider` interface (`createCheckout`,
`verifyCallback`). Every provider callback is verified on the server, so a
browser redirect alone is never trusted, and is written to a separate
`payments` ledger (append-only, like the journal). Sandbox credentials only
until the owner approves going live. **Decisions needed:** what is being sold
(donations, membership, AI credits), which legal entity receives the money, and
which gateways to apply for first. eSewa and Khalti are the suggested start.

## 7. Path to a bare Linux machine (later)

Goal: Yogilib runs as one self-contained program on a minimal Linux host, with
no cloud services required.

1. **Now:** Node server, PostgreSQL (Neon), S3/R2. Everything sits behind
   `DB` and storage interfaces.
2. **Single box:** the same container on one VPS with local PostgreSQL and
   local disk storage (`YOGILIB_UPLOAD_DIR`). This already works today.
3. **Single binary:** bundle the server into one executable (Node SEA or Bun
   compile) with embedded PostgreSQL (PGlite in durable mode, or a bundled
   Postgres), managed by systemd.
4. **Appliance:** a minimal immutable Linux image (for example a stripped
   Alpine or NixOS build) that boots straight into Yogilib. The journal and
   export bundle make moving between machines a copy plus a verify.

The event journal is the piece that makes stages 3 and 4 safe: whatever runs
the archive, its contents can be replayed and checked from the log.

## Note on sources

Urbit's documentation site (docs.urbit.org) was not reachable from this
session's network policy, so §2 is written from existing knowledge of Urbit's
published design. Allow that domain if a closer reading is wanted.

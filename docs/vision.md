# Yogilib vision and roadmap

Drafted 2026-11-22 by a scheduled run. This is a direction, not a commitment:
each phase still goes through review, and production deployment, payments and
store releases need explicit approval (see `CLAUDE.md`).

Yogilib is a time capsule: an archive that should still be readable, verifiable
and recoverable decades from now, on whatever computers exist then. Everything
below follows from that.

## 1. Borrowed from Urbit

Urbit's documentation (docs.urbit.org) could not be fetched from this session
because of its network policy. This section draws on Urbit's published design
as already known. Check it against the current docs before treating any detail
as authoritative.

| Urbit idea                                                                                                   | What it means for Yogilib                                                                                                                                                                                                                     | Status                                                   |
| ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| **The event log is the truth.** Arvo's state is a pure function of its event log.                            | Every archive change is appended to `archive_journal`, a hash-chained log. Tables are a fast view of it, and the journal is what lets you trust them.                                                                                         | **Started** (migration 002, `src/lib/server/journal.ts`) |
| **Nothing is forgotten.** Old state stays reachable at its revision.                                         | Deletes keep a final snapshot, and admins can recover a deleted work under its original URL from _Recent changes_. Edits already keep revision snapshots.                                                                                     | **Started**                                              |
| **Determinism and verifiability.** Replaying the log must give the same result.                              | Entries are stored as exact JSON text and each hash commits to the previous one. `GET /api/journal/verify` recomputes the whole chain and reports the first broken entry.                                                                     | **Started**                                              |
| **Referentially transparent paths** (the scry namespace: a path plus a revision always gives the same data). | Give each work stable paths like `/document/:id@rev`, so a citation to a version never changes. The journal sequence number is a natural revision.                                                                                            | Planned                                                  |
| **The interpreter/runtime split** (Nock/Arvo above, Vere below).                                             | Keep the archive logic (`lib/server/archive.ts`, `journal.ts`) free of host details. Storage, database and HTTP are thin adapters, so the core can move to a smaller runtime without being rewritten.                                         | Partly true today; keep enforcing it                     |
| **The personal server and the pier.** One portable directory holds a whole ship.                             | A Yogilib "pier": one directory containing the journal, originals (content-addressed by SHA-256) and a manifest. `npm run pier -- export <dir>` writes it; `npm run pier -- verify <dir>` checks it offline. Import/boot from a pier is next. | **Started** (`src/lib/server/pier.ts`)                   |
| **Calm, small, legible software.**                                                                           | Few dependencies, no tracking, plain HTML output, a compact saffron interface, and no feature that needs a third-party service to read the archive.                                                                                           | Ongoing                                                  |
| **Identity you own.**                                                                                        | Long term: signed contributions (each journal entry signed by the contributor's key) so authorship survives a change of host. Not before the basics are stable.                                                                               | Later                                                    |

What we do **not** borrow: Urbit's own languages (Hoon/Nock), its address
space or its network. Yogilib stays on boring, well-understood tools
(TypeScript, Postgres, Linux) and takes only the philosophy.

## 2. Path to running on bare Linux

The goal is a Yogilib that runs as a small, self-contained program on a plain
Linux machine (a VPS, a Raspberry Pi in a library, an offline laptop) with no
cloud services.

1. **Now: one container.** The existing `Dockerfile` runs Node + external
   Postgres + S3/R2. This is the Cloud Run plan in `hosting.md`.
2. **Self-contained node.** Run with embedded PGlite (or a local Postgres) and
   a local originals directory. `npm run pier -- export` now writes the
   journal, documents, revisions and SHA-256-addressed originals with a
   manifest, and `npm run pier -- verify` checks one offline. Still to add: `pier import`
   command that writes and reads the journal + originals + manifest, and a
   replay that rebuilds tables from the journal alone. Backups become "copy
   one directory".
3. **Single binary.** Package the server as a Node single-executable
   application (or move the core to a runtime that compiles to one binary),
   with a systemd unit. No Docker required.
4. **Appliance.** A minimal Linux image (for example a small distribution with
   only the Yogilib binary, its data directory and a TLS proxy) that boots
   straight into the archive. Mirrors can sync from each other's journals.

Each step keeps the previous one working; nothing here requires abandoning
SvelteKit or Postgres.

## 3. Onboarding

- **Done in this run:** a first-visit welcome panel on the archive page
  (English and Nepali): search, read, keep. It is dismissed once per device and
  never shown to admins on the dashboard.
- **Next:** self-registration as a _reader_ (email verification, viewer role
  only; uploader/admin stay granted by an admin on the server), real Google
  sign-in replacing the placeholder, and a short guided tour of the reader's
  notes and progress on first open of a document.

## 4. Toward a Wikipedia-scale reference

Already present: stable document URLs, revision history with restore,
bilingual interface, search. Added in this run: **Recent changes**
(`/changes`), a public feed of the journal that never reveals who made a
change. Next, in rough order:

1. Citable revision permalinks (`/document/:id@rev`) and a "cite this" box.
2. Person, place and date pages that link related works (structured metadata
   on documents, then generated index pages).
3. Talk pages per work for contributors, moderated by admins.
4. A random-work link and curated collections on the homepage.
5. Sitemaps and `schema.org` metadata so the archive is findable.
6. Accessibility and performance audits before any launch.

## 5. AI features (planned, not built)

Principles: AI assists reading and cataloguing; it never rewrites archive
material. All output is labelled as machine-generated, stored separately from
original text, and requires an admin to accept anything that becomes metadata.
Calls are made from the server only, behind a configured key, and the feature
stays hidden when no key is set.

Candidate features, in order of value per effort:

1. **Explain a passage.** Select Devanagari text and ask for a plain-language
   explanation or a transliteration in the reader (signed-in users, rate
   limited).
2. **Cataloguing help for uploaders.** Suggest title, category, year and a
   short description from the uploaded text. The uploader reviews it before
   saving.
3. **OCR for scanned originals.** Produce a draft transcription of uploaded
   PDFs/images for an admin to correct. This is the biggest unlock for growth.
4. **Ask the archive.** Questions answered only from archive passages, with
   links to the exact documents quoted (retrieval over the existing search
   index first, embeddings later).

Open decisions: which model provider, monthly budget cap, and whether reader
questions are logged (default: not stored).

## 6. Payments (planned, not built)

Purpose: donations and optional supporter memberships, never a paywall on the
archive itself. A time capsule that charges to read stops being one.

| Audience      | Gateway options                                                                       | Notes                                                                                                                                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nepal         | **eSewa**, **Khalti**, **Fonepay** (QR, works with most Nepali bank apps), ConnectIPS | Each needs a registered Nepali merchant account. eSewa and Khalti have documented server-to-server verification and sandbox modes.                                                                                            |
| India         | PhonePe, Google Pay (UPI)                                                             | These are Indian UPI apps, not Nepali gateways. Accepting them needs either an Indian payment partner or Nepal's UPI–Fonepay QR interoperability. Confirm with the acquiring bank which one applies to a Nepali organisation. |
| International | Stripe (cards, Apple Pay and Google Pay wallets), PayPal                              | Stripe does not onboard Nepal-registered businesses directly; it needs an entity in a supported country, or a merchant-of-record service. PayPal can receive in some cases. Needs a legal and banking decision first.         |

Design: one `payments` table and a provider interface
(`createIntent → redirect/QR → verify server-side → record`). The journal
records successful payments as events. Amounts are verified with the gateway
server-to-server before anything is marked paid, never trusted from the
browser. Webhooks are signature-checked and idempotent.

**Needed from the owner before any code ships:** which legal entity receives
money, merchant accounts (eSewa/Khalti/Fonepay sandbox keys first), and
whether international payments are worth the entity setup.

## 7. Suggested next scheduled runs

1. ~~`pier export`~~ (done 2026-11-23: `npm run pier -- export|verify`). Next: `pier import` into an empty PGlite directory + replay from the journal (phase 2 above).
2. Revision permalinks and "cite this".
3. Reader self-registration (viewer role only) and Google sign-in.
4. AI cataloguing help for uploaders, once a provider and budget are chosen.
5. Payment provider interface with eSewa/Khalti **sandbox** only, once
   merchant details exist.

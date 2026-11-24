# Yogilib vision and roadmap

Drafted 2026-11-24. This is a direction document, not a commitment: each phase still needs review and explicit approval. The owner's goal is a library that behaves like a time capsule: grand in scope like Wikipedia, with seamless onboarding, robust data management, AI features, payments through international and Nepali gateways, and eventually a system that runs on a bare Linux machine.

## 1. Borrowed from Urbit

Urbit is a personal server whose entire state is derived from an append-only event log, packaged as one data directory (a "pier") that the owner controls. Its documentation site could not be reached from this build environment, so this section is based on general knowledge of Urbit's published design. It should be checked against the current docs before any principle is treated as final.

| Urbit idea                               | What it means                                                               | How Yogilib adopts it                                                                                                                                                     |
| ---------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Event log as truth (state = f(events))   | Every change is an event; current state can be rebuilt by replaying the log | **Started.** `archive_events` is an append-only, hash-chained ledger of every create, edit, restore and delete. Phase 2 makes it replayable.                              |
| Solid-state, one pier                    | The whole system lives in one directory you can move, back up and restart   | Phase 3: one data directory holds the database, originals and config. Today the closest thing is the backup export.                                                       |
| Determinism and hashing                  | The same input always produces the same output and hash                     | Canonical JSON hashing in `src/lib/server/ledger.ts`; the backup carries the ledger head hash so a restored copy can prove it matches.                                    |
| Referentially transparent namespace      | A path plus a revision always resolves to the same data                     | Planned: citeable, permanent URLs such as `/document/:id/v/:hash` that never change once published.                                                                       |
| Small, frozen core ("kelvin versioning") | The kernel changes rarely and its versions count down toward a frozen state | Core formats are versioned (`yogilib-archive-backup/1`, numbered migrations). The archive schema and ledger format should change rarely, additively and with a migration. |
| You own your server                      | No platform holds your data hostage                                         | Full export is admin-only and does not depend on the hosting provider. The goal is that anyone holding a backup can stand the archive up again.                           |
| Calm computing                           | Software that does not compete for attention                                | No ads, no engagement tricks, no tracking beyond what reading and notes need.                                                                                             |

What **not** to borrow: Urbit's Hoon/Nock stack, its Azimuth identity layer and crypto-based addresses. They would add a large learning and dependency cost with no benefit to readers of a Nepali archive.

## 2. Phases

### Phase 1: Foundation (in progress)

- [x] Hash-chained archive ledger, recorded in the same transaction as each change (`migrations/002-ledger.sql`)
- [x] Deleted documents keep their full content in the ledger, so a deletion (including "Delete all") can be recovered
- [x] Admin-only portable backup (`GET /api/export`) and ledger check (`GET /api/ledger/verify`) on the dashboard
- [x] First-visit welcome for new readers, in English and Nepali, with steps that depend on the visitor's role
- [ ] Review `002-ledger.sql` and run it on a Neon **development branch** before production (see §5)
- [ ] Restore-from-backup script that rebuilds an empty database and checks the ledger head
- [ ] Back up originals next to the JSON backup (object-storage copy or tarball)

### Phase 2: A library at Wikipedia scale

- Permanent versioned URLs and "cite this" (APA, Chicago, BibTeX), built from ledger hashes
- Public history page per document (who changed what, when), rendered from the ledger
- Authors, places, dates and collections as linked records rather than free text, with browse pages for each
- Proper search: Nepali/Sanskrit-aware tokenisation, transliteration-insensitive matching (Preeti/ITRANS/Unicode), facets
- Contributor workflow: proposed edits → review → publish, with the ledger as the audit trail
- Rebuild state from the ledger (replay) as an automated integrity test

### Phase 3: AI features (server-side, opt-in, never altering originals)

The rule: AI output is always labelled as such and stored separately from archive material. It never overwrites Devanagari originals.

1. **OCR for scanned originals.** Turn PDFs and images into searchable text drafts that an admin reviews.
2. **Semantic search.** "Find passages about…" across scripts, using embeddings stored in Postgres (pgvector).
3. **Reader assistant.** Explain a selected passage, gloss Sanskrit terms or give a translation aid, quoting the archive text it used.
4. **Metadata suggestions for uploaders.** Proposed title, category, author and date; a human accepts or rejects each.

Design: one server module (`src/lib/server/ai.ts`) behind a provider interface; keys only in server env; per-user rate limits and a monthly cost cap. The model provider is still open; current Claude models are a natural default. AI use is a natural paid tier (see §4).

### Phase 4: Payments

Purpose to decide first: donations, reader memberships (e.g. AI features or high-resolution originals), or print/merch sales. Each has different legal and tax obligations.

| Region        | Gateways to evaluate                                                            | Notes                                                                                                                                                                                               |
| ------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nepal         | eSewa, Khalti, Fonepay (QR), connectIPS                                         | Need a registered Nepali business and a merchant agreement per gateway. "Phonepay" in the brief most likely means **Fonepay**.                                                                      |
| India → Nepal | UPI apps (PhonePe, Google Pay)                                                  | PhonePe and GPay are Indian UPI apps. Indian visitors may be able to pay Nepali Fonepay QR codes through the UPI cross-border link. Confirm current availability and settlement terms with Fonepay. |
| International | Card acquiring through a Nepali bank, or Stripe/PayPal through an entity abroad | Stripe does not onboard Nepal-registered merchants. Confirm current PayPal and bank options. Legal structure is a business decision.                                                                |

Design: one `payments` module with a gateway interface (`createCheckout`, `verifyCallback`, `refund`). Every gateway callback is verified on the server, recorded idempotently in an additive `payments` table, and mirrored into the ledger. No card data ever touches Yogilib servers. **Nothing goes live without merchant credentials, legal review and explicit approval.**

### Phase 5: Toward bare Linux

1. **Today:** Node server + external Postgres (Neon), originals in S3/disk.
2. **Single node:** one container/binary bundling the server and embedded Postgres, with everything in one data directory (the Yogilib "pier"). PGlite already proves the embedded path in development.
3. **Appliance:** a minimal, immutable Linux image (for example NixOS or a Buildroot-style image) that boots straight into Yogilib on a small machine or a library kiosk. It gets signed over-the-air updates, serves the archive on the LAN and works fully offline. Moving it to new hardware means copying the data directory.
4. **Federation (optional):** appliances replicate by exchanging ledger events. The hash chain makes divergence detectable.

## 3. Onboarding principles

- A reader should be reading within 10 seconds of arriving: no wall, no forced sign-up.
- Explain once, then get out of the way (the welcome panel is dismissible and remembered per browser).
- Each role sees only its next useful step: reader → notes, uploader → upload, admin → ledger and backups.
- Next: Google sign-in (placeholder today), a one-page contributor guide, and empty-state hints on the reader page.

## 4. Data management principles

- Additive migrations only, reviewed before `npm run db:migrate`, numbered and recorded in `yogilib_migrations`.
- Every archive change gets one ledger event in the same transaction as the change.
- Backups are self-describing, versioned and exclude private reader data (passwords, sessions, notes, reading positions).
- Originals are never committed to Git and are backed up separately from the database.

## 5. Rolling out the ledger to the shared archive

1. Copy Neon production into a development branch.
2. Review `migrations/002-ledger.sql` (one new table and one index; no existing table is altered).
3. `YOGILIB_ALLOW_MIGRATIONS=1 npm run db:migrate` against the **development branch** only.
4. Exercise create/edit/restore/delete; check the dashboard shows "History verified".
5. Only then, with explicit approval, run the same migration on production.

Until the migration runs, the deployed app keeps working exactly as before; the ledger just records nothing.

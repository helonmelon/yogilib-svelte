# Yogilib vision: a time capsule built to outlast its runtime

Drafted 2026-11-28. This document describes the long-term direction of the project and the order in which to build it. Wherever this document and the current code disagree, the code (and `docs/architecture.md`) describes how things work today.

## 1. What Yogilib is for

Yogilib is a library and a time capsule. Its job is to keep original material (Devanagari texts, scans, records) intact, readable and verifiable for decades, beyond the life of any one host, framework or company. Everything below follows from that.

## 2. Principles borrowed from Urbit

Urbit is a personal server and operating system. Its design rests on a few ideas that also suit an archive. They are summarised here from Urbit's published design (Nock, Arvo, kelvin versioning). The docs site, docs.urbit.org, could not be reached from this build environment, so check these points against the source before quoting them.

| Urbit idea                                                                                  | What it means for Yogilib                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **The system is a pure function of an event log.** Arvo state = fold(events).               | The **archive ledger** (`src/lib/server/ledger.ts`, `migrations/002-ledger.sql`) records every archive change as an ordered, hash-chained event. The `documents` table is a fast cache of the current state, and `replay()` rebuilds that state from the events alone. |
| **Determinism.** The same events always produce the same state.                             | Events use canonical JSON (keys sorted) and a SHA-256 chain. Anyone holding an export can verify it without our code or database.                                                                                                                                      |
| **Solid state, single-level store.** You never save state; it simply persists.              | Users should never lose work. Notes and reading progress are already queued offline. Document drafts should get the same treatment.                                                                                                                                    |
| **Kelvin versioning.** Version numbers count down towards zero, which means frozen forever. | Version the parts that must never change: the **ledger event format** (`ledger@K100`) and the **export format**. Each change brings them closer to frozen, so a 2060 reader can still parse a 2026 export.                                                             |
| **A tiny, frozen core** (Nock fits on a T-shirt).                                           | The layer we promise to keep must stay small: plain NDJSON events, UTF-8, SHA-256, originals addressed by hash. Svelte, Postgres and Node are replaceable; the format is not.                                                                                          |
| **You own your node and your identity.**                                                    | Every institution or reader can keep a full copy (its "pier") and verify it. Mirrors stay honest because they share one hash chain.                                                                                                                                    |
| **Run on bare metal.**                                                                      | See section 5. The path is to depend on less and less, until one binary plus one data directory runs on a minimal Linux.                                                                                                                                               |

## 3. Pillars and status

### 3.1 Robust data management (started)

Built in this change:

- An append-only ledger, written in the same transaction as each mutation: create, update, restore, delete and delete-all. The "delete all" event keeps every document's final text, so a mistaken wipe can be recovered (uploaded originals are still removed).
- Admin endpoints `GET /api/ledger` (filter with `?document=` and `?before=`), `GET /api/ledger/verify` and `GET /api/ledger/export` (NDJSON stream). The dashboard has a ledger panel with Verify and Export buttons.
- If an external database has not yet run `002-ledger.sql`, the ledger switches itself off with a warning. The live archive keeps working until the migration has been reviewed and applied.

Next:

1. **Genesis event.** When the ledger is first enabled on the live archive, record one `archive.genesis` event per existing document. Without it, history only starts at that point.
2. **Hash-addressed originals.** Store uploads under their SHA-256 hash, record that hash in the ledger, and stop deleting originals while a ledger event still refers to them.
3. **Scheduled off-site export.** Write a nightly ledger and originals bundle to a second storage provider, and verify it on restore.
4. **Rebuild command.** Add `npm run ledger:replay` to rebuild a fresh database from an export. This is the end-to-end proof that the format is self-sufficient.

### 3.2 Seamless onboarding

- Reading needs no account. This is already true for the archive and documents.
- Sign in only when needed: you are asked to sign in when you first save a note or progress, and you return to the same passage afterwards.
- A three-step first visit: choose a language (English or नेपाली), choose a script preference for converted text, and see one featured work. Store these choices on the device first and in the account later.
- Contributor onboarding: an "Upload your first document" guide inside `/upload`, with Preeti/ITRANS conversion explained in place.
- Real Google sign-in through server-side OAuth (planned in `docs/projectmap.md`).

### 3.3 Encyclopedic scale (Wikipedia-grade)

- Stable, citable URLs for every work, revision and ledger event (`/document/:id@seq`).
- Public revision history and per-document "what changed" diffs built from ledger events.
- Linked entities: authors, places, dates (Bikram Sambat and Gregorian) and categories as their own pages.
- Talk and review queues for contributors; trusted roles above uploader.
- Full-text search tuned for Devanagari, followed by semantic search (see 3.4).

### 3.4 AI features

These follow the CLAUDE.md rule: AI may help readers, but it must never rewrite original archive material.

- **Ask the archive:** answers grounded only in archive passages, with citations to `/document/:id` and the passage quoted.
- **Reading help:** summaries, glossaries and translations of a passage between Nepali, Sanskrit and English. These are always shown as a separate, labelled layer, never stored in `body_html`.
- **OCR and transliteration drafts** for uploaded scans. An admin must accept a draft, and the accepted result is recorded as a normal ledger event.
- **Semantic search:** embeddings stored next to `documents`.
- Implementation: a server-only `src/lib/server/ai.ts` that calls the Anthropic API with the key held on the server, plus usage limits per user and per plan. Use the current Claude models; check model IDs with the claude-api reference when building.

### 3.5 Payments and support

The aim is one provider-neutral interface (`createCheckout`, `verifyWebhook`, `refund`) with one adapter per gateway. Payment state lives in its own tables and is updated only from verified server-side callbacks, never from the browser.

| Region        | Gateways to integrate                                                    | Notes                                                                                                                                                                                                                                                                             |
| ------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nepal         | **eSewa**, **Khalti**, **Fonepay** (QR), **ConnectIPS**                  | These are the main Nepali options. Each needs a merchant agreement and sandbox keys.                                                                                                                                                                                              |
| India / UPI   | **PhonePe**, **Google Pay** (UPI)                                        | PhonePe and GPay are Indian UPI apps, not Nepali gateways. Indian visitors can probably pay a Nepali merchant through the UPI–Fonepay cross-border QR link. Confirm this with Fonepay before building, because it may remove the need for a separate PhonePe or GPay integration. |
| International | **Stripe** (cards, Apple Pay, Google Pay wallet), **PayPal** as fallback | Stripe Checkout keeps card data off our servers.                                                                                                                                                                                                                                  |

The first use should be voluntary support or membership, which gives higher AI limits and early access to digitised collections. Reading the archive should stay free. Every gateway needs a merchant account, legal review (Nepal Rastra Bank rules for foreign currency) and explicit approval before going live.

## 4. Data model direction

```
events (ledger)  ──fold──►  documents (current state, cache)
     │                         │
     └─ hashes ──►  originals/<sha256>   (immutable blobs)
```

Future tables (users, payments, AI usage) should follow the same pattern: an append-only record of what happened, plus a current-state view that can be rebuilt from it.

## 5. Path to bare Linux

This is not urgent. Each step stands on its own:

1. **Now:** a Node server with Postgres or PGlite, deployed as a container.
2. **Self-contained node:** one directory (`pier/`) holding the PGlite data, originals and ledger exports. One command starts it (`yogilib run pier/`) on any Linux machine with Node 22, managed by systemd.
3. **Single binary:** bundle the server with Node SEA or Bun compile, embedding PGlite (WASM) and the static client. A machine then needs only the binary and `pier/`.
4. **Appliance image:** a minimal Linux image (for example built with Buildroot) that boots straight into Yogilib, for libraries or schools with no IT staff. Updates are signed images, and the data in `pier/` is never touched by an update.
5. **Format-first longevity:** because state = fold(ledger), a future rewrite in any language can read the same pier.

## 6. Guard rails

Everything above still follows CLAUDE.md:

- Preserve original material and keep permissions enforced on the server.
- Review migrations explicitly before running them.
- Never deploy to production or enable payments without explicit authorisation.
- Test on real devices before making any claim about mobile.

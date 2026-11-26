# Yogilib vision: a time capsule that outlives its servers

Updated 2026-11-26. This is the long-range direction. `docs/projectmap.md` is still the place for what exists today.

Yogilib should be a library you could hand to someone in fifty years: one directory that holds the full history of the archive, which they can check without trusting us and run on a bare Linux machine. It should still read as an encyclopedia people want to use every day, in English and Nepali, with AI help and a way to support the work.

## 1. Design ideas borrowed from Urbit

This list comes from what we already know of Urbit's design. Its docs site (docs.urbit.org) is blocked by this session's network policy, so check these points against the docs before relying on them.

| Urbit idea                                                           | What it means for Yogilib                                                                                                                                                                 | Status                          |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| **The event log is the truth.** State is a function of the events.   | The **archive chronicle** (`migrations/002-chronicle.sql`, `src/lib/server/chronicle.ts`) is an append-only log. Replaying it rebuilds the live archive, and verification proves it does. | **Done (this change)**          |
| **Snapshots are only a cache.** Throw them away and replay.          | The `documents` table is a fast index over the chronicle. `verifyChronicle` reports any document whose row doesn't match its replay ("drift").                                            | Done for verification           |
| **The pier.** One directory holds a ship's whole identity and state. | A portable **capsule**: the chronicle as newline-delimited JSON, plus originals stored under their SHA-256 hash. Copy the directory and the library comes with it.                        | Next                            |
| **Content addressing** (Clay, the filesystem).                       | Originals are named by hash, so duplicates merge and corruption is easy to detect. The chronicle refers to originals by hash, not by path.                                                | Planned                         |
| **Deterministic, small kernel.**                                     | A small server core (archive, auth, chronicle, storage) with a narrow API. AI, payments and the UI are separate modules that can fail without touching the archive.                       | Partly true today               |
| **Personal server, user ownership.**                                 | Any institution or family can run its own Yogilib from a capsule. Later, capsules can follow and verify each other's chronicles (by head hash).                                           | Later                           |
| **Runs on Unix as a single process** (the runtime hosts the kernel). | One self-contained binary with embedded PGlite: give it a capsule directory and a port. External PostgreSQL becomes optional.                                                             | Phased: see §5                  |
| **Over-the-air upgrades.**                                           | Schema changes stay additive and replay-safe. An upgrade never needs the old process except to read its log.                                                                              | Policy in place (additive only) |

### What the chronicle guarantees today

- Every create, edit, restore and delete, including "Delete all documents", writes an entry in the same transaction as the change. If the change rolls back, so does the entry.
- Each entry stores the exact canonical JSON that was hashed. Its hash covers the previous hash, sequence, time, kind, actor, document and payload. A transaction-scoped advisory lock serializes appends, so the chain never forks.
- Deletions keep the document's full text and metadata, so deleting from the archive no longer deletes it from history. Private notes and reading positions are **not** logged.
- Admins can see the chain on the dashboard (**Archive chronicle**), verify it, and record any documents that predate migration 002 ("seal"). The API is admin-only: `GET /api/chronicle`, `GET /api/chronicle/verify`, `POST /api/chronicle/seal`.
- External PostgreSQL databases work unchanged until someone reviews and applies migration 002 with `npm run db:migrate`. Until then, logging is a no-op.

Known limits:

- Verification scans the whole chain in memory. That's fine for thousands of documents, but large archives will need checkpoints: a periodic signed head hash.
- Someone with database write access could rewrite the entire chain consistently. To catch that, publish the head hash somewhere outside the database (for example, a printed or emailed digest, or another capsule).

## 2. Onboarding that feels effortless

1. **Read before signing in.** Already true: documents and the archive list are public.
2. **Pick a language on the first visit** (English or नेपाली) and remember the choice. Never translate archive text.
3. **One-tap sign-in.** Replace the disabled Google button with real server-side OAuth (`lib/server/auth.ts`), and keep email and password for contributors.
4. **A three-step welcome** after the first sign-in: what Yogilib is, how to save notes, and how to contribute. It can be skipped and shouldn't come back.
5. **A guided first upload** for new uploaders: pick a category, add a title in both scripts, attach the original, preview, then publish.

## 3. Wikipedia-scale reading

- Document pages with stable citations: a permanent link per chronicle version, shaped like `/document/:id@seq`.
- Categories, authors and periods as browsable index pages. Cross-links between related documents.
- Search ranking that treats Devanagari and romanized text as equals (Preeti, ITRANS and plain Unicode).
- A public, read-only feed of the chronicle ("recent changes") once the privacy review is done.
- An accessibility and performance audit at phone width before claiming any of this is ready.

## 4. AI features: always labeled, never replacing the original

AI output is a **derived layer**. It is stored separately, labeled as machine-generated, and never written into `body_html`.

| Feature                                                             | Notes                                                                                                    |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| OCR of scanned originals (Devanagari + Latin)                       | Produces a draft transcription that an admin reviews before publishing. Each draft is a chronicle entry. |
| Semantic search                                                     | Embeddings in PostgreSQL (`pgvector`), mixed with today's full-text search.                              |
| "Ask the library": questions answered with citations                | Answers must quote and link the documents they rely on. If nothing supports an answer, say so.           |
| Summaries and reading aids (glossary, transliteration, translation) | Shown beside the original, not instead of it. Interface-only by default.                                 |

The provider is configured on the server only (API key in the environment). Features are off unless configured, rate-limited per user, and can be gated behind supporter plans.

## 5. Payments: supporting the library

The first step is a donation and supporter-membership model, not paywalled archive content. A payment module needs:

- A single `payments` interface: create an intent, verify a callback on the server, record the result. Credentials stay server-side, and every gateway callback is verified against the gateway's own API before anything is granted.
- A ledger table (additive migration) and chronicle-style receipts. Payment details are never stored beyond what each gateway returns.

**Nepal:** eSewa, Khalti and Fonepay (the QR network most Nepali banking apps use; "phonepay" in the brief most likely means Fonepay), plus connectIPS for bank transfers.
**Indian visitors:** PhonePe and Google Pay are Indian UPI apps. They can pay through Nepal's UPI–Fonepay link where the merchant's acquirer supports it. Confirm this with the acquiring bank.
**International:** card processors such as Stripe, or PayPal. Receiving foreign currency in Nepal is regulated by Nepal Rastra Bank, and these providers have entity and country requirements. Confirm the legal entity and settlement route before building this.

No live keys, merchant accounts or production checkout without explicit authorization.

## 6. Toward bare Linux, in phases

1. **Now:** Node 22 server, PostgreSQL or PGlite, chronicle added (this change).
2. **Capsule export/import:** `npm run capsule:export` writes the chronicle and hashed originals to a directory. Import rebuilds the database purely by replay. A round trip should produce identical head hashes.
3. **Capsule-native mode:** the server can start from a capsule directory alone (embedded PGlite as the cache, the chronicle as the source).
4. **Single binary:** package the server as a Node single-executable application, so a capsule plus that binary is the whole deployment.
5. **Bare host:** a minimal Linux image (systemd unit or microVM rootfs) that boots straight into Yogilib, with the capsule on its own disk. There is no external database, and upgrades swap the binary and replay.

Each phase must pass `npm run check`, `npm test`, `npm run build` and `npm run build:mobile`, and must never need a destructive reset.

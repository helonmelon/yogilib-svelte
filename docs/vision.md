# Yogilib vision: a time capsule library

Updated 2026-11-25. Where Yogilib is going and the principles that shape each step. The current runtime is described in `architecture.md`. This document sets direction only and does not authorise any deployment.

## 1. What Yogilib is

Yogilib is a library meant to outlast its servers. Original texts in Devanagari and other scripts are kept exactly as they were written. Readers anywhere can find, read and study them. Its ambition is Wikipedia-scale public reach, built on archive-grade care: every change is recorded, and the whole collection can be carried away and checked by anyone.

## 2. Principles borrowed from Urbit

Urbit is a personal server built as a small deterministic computer. It runs as one ordinary process on any Unix, and every state change is an event in an append-only log. Yogilib borrows its design philosophy, not its stack.

| Urbit idea                                                     | What it means for Yogilib                                                                                                                                                         |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **State is a function of the event log.**                      | Archive changes become ordered, hash-chained events. The **time capsule** (`/api/capsule`) is the first step: a hash-chained snapshot of all documents and revisions.             |
| **Your data lives on your own computer, in one portable unit** | A capsule can be copied, verified offline (`npm run capsule:verify`) and later replayed into a fresh install, the way an Urbit ship's data can be moved between machines.         |
| **Small, frozen core; upgrades by replacement**                | Keep the core small: documents, revisions, identity and permissions. AI, payments and other features are optional add-ons. Each can be switched off without touching the archive. |
| **Determinism**                                                | Same input, same output. Capsule hashes use canonical JSON, and converters (Preeti, ITRANS) are pure functions with tests.                                                        |
| **Calm computing**                                             | No ads, no engagement tricks, no surprise notifications. A compact saffron interface that stays out of the reader's way.                                                          |
| **Runs on bare Unix**                                          | One process with one data directory. No cloud service is mandatory: PGlite already runs embedded, and storage already works from a local disk.                                    |
| **Identity you own**                                           | Later: an account can export its own notes and progress as a personal capsule. Private data is never included in public capsules.                                                 |

## 3. Roadmap

Each phase must pass `npm run check`, `npm test`, `npm run build` and `npm run build:mobile` before it is pushed. Each one also needs explicit approval before production use.

### Phase A: archive integrity (started)

- ✅ Time capsule export: admin-only, hash-chained, offline-verifiable, and free of accounts, sessions, notes and reading positions.
- ✅ First-visit welcome card for new readers (English and Nepali).
- Next: let capsules include originals by referencing each file's SHA-256 and storing the bytes alongside the capsule. Add capsule **import** into an empty PGlite instance, so a restore can be rehearsed.
- Next: an `archive_events` table (an additive migration, reviewed before `db:migrate`). Every save, restore and delete appends a hash-chained event, so the capsule becomes a projection of the event log.
- Next: a typed confirmation and an automatic capsule download before "Delete all documents".

### Phase B: Wikipedia-scale reading

- Stable citation URLs and "cite this" text for each document and revision.
- Author, period and collection pages, with cross-links between works.
- Full-text search with transliteration-insensitive matching, so a Roman-script query finds Devanagari text.
- Guided onboarding by role: a reader tour, contributor guidelines and an admin checklist.
- Accessibility and performance audit, and sitemaps.

### Phase C: AI features (optional add-on, off by default)

- Semantic search and "related works" over embeddings stored next to each document.
- Reading aids: glossary lookups, transliteration help and short summaries, always labelled as machine-generated.
- OCR suggestions for scanned originals, which an admin reviews before anything is saved.
- Rule: AI output never overwrites original material. It is stored separately, attributed, and can be removed.
- The model provider is set on the server only. API keys never reach the client or the mobile build.

### Phase D: support and payments (optional add-on, off by default)

- Donations, memberships and paid scholarly services. The archive itself stays free to read.
- A single `PaymentProvider` interface on the server, with one adapter per gateway. Payments are confirmed only by server-side verification or signed webhooks, never by a client redirect. Card data is never stored.
- International: Stripe or PayPal (cards, Apple Pay and Google Pay wallets).
- Nepal: **eSewa**, **Khalti**, **Fonepay** (QR) and **ConnectIPS**. These are the gateways a Nepali merchant can actually register with.
- About the other wallets that were requested:
  - **PhonePe** is an Indian UPI app. Indian donors' UPI payments (PhonePe, Google Pay) would come through an Indian UPI gateway such as Razorpay, or through Fonepay's cross-border UPI link.
  - **Google Pay** in other countries works through Stripe.
  - Each gateway needs its own merchant account, legal entity and keys. None of these can be set up from the code.
- Needs before going live: an organisation or merchant registration, tax and receipt rules, refund policy and sandbox testing for each gateway.

### Phase E: runs on bare Linux

1. **One process, one directory.** `node build` with PGlite and local storage under a single `YOGILIB_HOME`, managed by a systemd unit.
2. **One file to install.** Package it as a Node single-executable application (SEA) with its assets embedded, so the host needs no npm.
3. **Appliance.** A minimal Linux image (for example a small distribution, or a custom initramfs) that boots straight into Yogilib. It would keep its data on a dedicated partition and back up capsules to removable media or peers.
4. **Federation (exploratory).** Libraries exchange signed capsules and stay in sync by replaying events.

## 4. Non-negotiables

- Original archive material is preserved and never machine-altered. Interface text is localised; sources are not.
- Permissions are enforced on the server. Optional add-ons inherit the same role checks.
- Changes to an external database are explicit, additive and reviewed. There are no destructive reset scripts.
- No credentials in the repository, and no production deployment or store submission without explicit authorisation.

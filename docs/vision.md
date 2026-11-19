# Yogilib vision: a library that remembers

Drafted 2026-11-19. This is the long-range direction for the project. It is not a release plan. Every phase still has to follow `CLAUDE.md`: additive migrations, server-side permissions, no production deployment or payment go-live without explicit authorization.

Yogilib is a time capsule. Its job is to keep original Nepali, Sanskrit and English material readable, provable and portable for decades, and outlast any one host, vendor or maintainer. Wikipedia sets the bar for scale. Urbit is the model for how the system should be built.

> Source note: this run could not reach `docs.urbit.org` because the session's network policy blocks it. The Urbit concepts below come from its published design (Nock, Arvo, Vere, Azimuth, the event log and "kelvin" versioning). They should be checked against the live docs once that domain is allowed.

## 1. What we borrow from Urbit

| Urbit idea                         | What it means there                                                                             | What it means for Yogilib                                                                                                                                                                                                 |
| ---------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **The event log is the computer**  | An Urbit ship's state is a deterministic function of its event log. Snapshots are just a cache. | The archive's true history is an append-only, hash-chained **ledger** (`archive_events`). Tables like `documents` are a projection that can be rebuilt by replaying the ledger. **Phase 1 of this ships in this commit.** |
| **Solid-state, deterministic**     | The same events always give the same state. No hidden mutable state.                            | `replay()` is a pure fold. Hashes use canonical JSON, so any machine in any language can re-verify the chain.                                                                                                             |
| **The pier**                       | One directory holds a whole ship. Copy it and you've moved the computer.                        | A Yogilib "pier" is one directory: the ledger, the originals and the config. `/api/ledger/export` already produces the ledger part as NDJSON.                                                                             |
| **Runtime vs. OS (Vere vs. Arvo)** | A thin, replaceable runtime hosts a stable OS.                                                  | The Node/SvelteKit server is the _runtime_. The ledger format and the archive rules are the _OS_. Runtimes can change (Node, a Rust binary, bare Linux), but the OS has to stay stable.                                   |
| **Kelvin versioning**              | Versions count _down_ toward a frozen, final spec.                                              | Event kinds and payload shapes get a kelvin number. Changes only make the spec smaller and stricter, so a reader written today can still verify a 2060 ledger.                                                            |
| **Identity you own (Azimuth)**     | Cryptographic, portable identity that isn't rented from a platform.                             | Later: contributors sign their ledger events with their own keys, so authorship can be proven outside our server.                                                                                                         |
| **Calm computing**                 | Software that is quiet, legible and yours.                                                      | No ads and no engagement loops. The interface stays compact and saffron. Readers can always get their data out.                                                                                                           |

## 2. Phases

### Phase 1: the ledger (done in this commit)

- `migrations/002-ledger.sql` adds `archive_events`. It is additive, and external Postgres only gets it through a reviewed `npm run db:migrate`.
- `src/lib/server/ledger.ts` records `create / update / restore / delete / delete-all` in the same transaction as the change. A rolled-back change leaves no event behind.
- Each event is `sha256(canonical({at, actor, kind, document_id, payload, prev_hash}))`, chained from a zero genesis hash.
- Admin `GET /api/ledger` returns verification plus recent events. `GET /api/ledger/export` streams the full history as NDJSON.
- Private notes and reading progress stay **out** of the shared ledger, because they belong to the reader.
- If migration 002 hasn't been applied, the ledger stays silent, so a live archive keeps working unchanged.

### Phase 2: the ledger becomes the source of truth

- A "genesis import" event that records the current state of documents that existed before the ledger.
- A `yogilib verify <file.ndjson>` CLI with no dependencies, so anyone can audit an exported history.
- `replay → documents` rebuild tooling, tested so that a projection rebuilt from the ledger equals the live table.
- Original files get content addresses (sha256) stored in their events, which makes the originals tamper-evident too.
- Scheduled off-site export of the ledger and originals (object storage plus a second provider).

### Phase 3: seamless onboarding

- First visit: choose a language (नेपाली / English), search right away, with no account needed to read.
- Sign-in: Google OAuth on the server (already planned), plus email magic links. Passwords stay for existing contributors.
- A three-step contributor path: _read → annotate → upload_. Roles are earned through review, not configured by hand.
- A guided first upload with the Preeti/ITRANS converter built in and a preview of how the stored text will look.

### Phase 4: AI as a careful librarian

All AI output is stored **next to** the original, labeled as machine-generated, and never overwrites archive material. Keys stay on the server.

- OCR for scanned originals (Devanagari first), queued for human review.
- Semantic and cross-script search: the same query finds matches in Devanagari, romanized text and English.
- Summaries and glossaries in Nepali and English, with citations that point to passages.
- Help with transliteration and translation for contributors, shown as suggestions.
- Metered per user, which ties into payments below.

### Phase 5: payments (donations, memberships, AI credits)

A provider-neutral `PaymentProvider` interface (create intent → redirect/QR → verify server-side → append a `payment` event to a **separate** financial ledger). Never trust the client callback.

| Market        | Realistic gateways                                                               | Notes                                                                                                                                                                                                   |
| ------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nepal         | **eSewa**, **Khalti**, **Fonepay** (QR), **ConnectIPS**                          | Merchant agreements and NRB rules apply. Every gateway has a sandbox to build against first.                                                                                                            |
| India → Nepal | UPI apps (**PhonePe, Google Pay, Paytm**) via Fonepay's cross-border UPI QR link | PhonePe and Google Pay don't operate as Nepali gateways. The route for Indian visitors is UPI paying a Fonepay merchant QR. Check the current status with Fonepay.                                      |
| International | Stripe, PayPal, or card acquiring through a Nepali bank                          | A Nepal-registered entity can't receive through Stripe/PayPal directly. This needs a foreign entity, a fiscal sponsor, or a bank card gateway, which is a **legal and banking decision for the owner**. |

Nothing goes live without explicit authorization, signed merchant agreements and a security review.

### Phase 6: Yogilib on bare Linux

The aim: one appliance that boots straight into the library.

1. **Self-contained process**: one directory "pier" (embedded PGlite or SQLite projection, local originals, the ledger). Already close to how `npm run dev` works today.
2. **Single binary**: bundle the runtime (Node SEA or a port to a compiled runtime) and keep the ledger format unchanged.
3. **systemd service plus a reproducible image**: `yogilib.service`, automatic ledger export and verification on boot.
4. **Minimal OS image** (a Buildroot or Yocto class image) that runs only the Yogilib runtime, verifies the pier and serves the archive. Federation between appliances happens by exchanging signed ledger segments.

## 3. Being "as grand as Wikipedia", honestly

Scale comes from trust and openness, not from feature count. In order:

1. Provable history (ledger).
2. Open export and mirrors.
3. An easy path for contributors.
4. Multilingual search.
5. Careful AI.
6. Sustainable funding.

Each phase above builds on the one before it.

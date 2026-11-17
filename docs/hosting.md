# Hosting plan (draft, 2026-11-17)

Goal: put the public archive online this week, as cheaply as possible, at a
short `.org` domain. Nothing here is deployed yet. Production deployment still
needs explicit approval (see `CLAUDE.md`).

## Domain

| Name          | Status on 2026-11-17 (registry RDAP lookup) |
| ------------- | ------------------------------------------- |
| `yogilib.org` | Not registered                              |
| `yogilib.com` | Not registered                              |
| `yogilib.net` | Not registered                              |

Registry "not found" means the name is not taken; a registrar's checkout is the
final word (some names are reserved or premium). Typical `.org` prices in late
2026: about $8–8.50 the first year at Porkbun or Cloudflare Registrar, and
about $11.20 a year to renew at Cloudflare, which sells at cost. Buy the
`.org` first. Add the `.com` only if it is worth about $10 a year to stop
someone else taking it.

## Cheapest stack that fits the current code

| Piece                  | Choice                                   | Cost                | Why                                                                          |
| ---------------------- | ---------------------------------------- | ------------------- | ---------------------------------------------------------------------------- |
| App server             | Google Cloud Run (existing `Dockerfile`) | $0 within free tier | Scales to zero; 2M requests and 180k vCPU-seconds a month free               |
| Database               | Neon free tier (already in use)          | $0                  | `DATABASE_URL`; run reviewed `migrations/001-platform.sql` on a branch first |
| Original PDFs / images | Cloudflare R2                            | $0 up to 10 GB      | S3-compatible, so the existing `S3_*` settings work; no egress fees          |
| DNS + TLS              | Cloudflare (free)                        | $0                  | Point the domain at Cloud Run's domain mapping                               |
| Domain                 | `yogilib.org`                            | ~$8–11 / year       |                                                                              |

Expected running cost: about $1 a month (the domain), as long as traffic stays
within the free tiers.

### Known gaps to close before launch

1. ~~**Upload size.**~~ Done 2026-11-17: uploads are capped at 30 MB
   (`src/lib/limits.ts`) and `BODY_SIZE_LIMIT` is 32M, under Cloud Run's
   32 MiB HTTP/1 request limit. Larger originals would need direct-to-R2
   presigned uploads.
2. **No local disk.** Cloud Run storage is temporary. `S3_BUCKET` must be set
   so uploads go to R2, not `.local/uploads`.
3. **Production settings.** Set `ORIGIN`/`PUBLIC_APP_ORIGIN` to the real
   domain, leave `YOGILIB_DATABASE` unset, and never enable PGlite demo
   accounts publicly.
4. ~~**Smoke test.**~~ Done 2026-11-17: the smoke-test fix
   (https://github.com/helonmelon/yogilib-svelte/pull/1) is merged into `main`.
5. **Accounts.** There is no self-registration. Create the first admin
   directly in the database.

### Fallback

If Cloud Run's billing-account setup or upload limit is a problem, a small VPS
(about €4 a month) running the same `Dockerfile` behind Caddy has a real disk
and no request-size limit. It costs more and has to be patched by hand.

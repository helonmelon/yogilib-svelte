# Hosting plan (draft, updated 2026-11-18)

Goal: put the public archive online this week, as cheaply as possible, at a
short `.org` domain. Nothing here is deployed yet. Production deployment still
needs explicit approval (see `CLAUDE.md`).

## Domain

**Recommendation: buy `yogilib.org` at Cloudflare Registrar.** It costs about
$8.50 the first year and $11.20 a year after that, about $53.30 over five
years, the lowest five-year total found. Cloudflare sells at cost and is
already the DNS provider in this plan (its registrar requires Cloudflare DNS).
It includes WHOIS privacy and has no renewal mark-up. Turn on auto-renew.

### Availability (registry RDAP lookups, 2026-11-18)

| Name                   | Status                                       |
| ---------------------- | -------------------------------------------- |
| `yogilib.org`          | Not registered                               |
| `yogilib.com`          | Not registered                               |
| `yogilib.net`          | Not registered                               |
| `yogilibrary.org`      | Not registered                               |
| `narharinath.org`      | Not registered                               |
| `yoginarharinath.org`  | Not registered                               |
| `yogilib.info`, `.app` | Not checked (registry host not allowed here) |

The lookups were checked against `wikipedia.org` and `google.com`, which
return as registered. "Not registered" means nobody owns the name. Premium or
reserved pricing only shows at a registrar's checkout, so confirm the price
there before paying.

### `.org` prices (third-party comparisons, Oct–Nov 2026)

| Registrar  | First year    | Renewal | 5-year total |
| ---------- | ------------- | ------- | ------------ |
| Cloudflare | $8.50         | $11.20  | ~$53.30      |
| Porkbun    | $6.98         | $11.84  | ~$54.34      |
| Dynadot    | $7.99         | $11.64  | ~$54.55      |
| Namecheap  | $7.44 (promo) | $15.38  | ~$68.96      |

The .org registry raised its wholesale price to $11.00 on 2026-06-01. Prices
move, so check the registrar's own page at checkout.

### Optional extras

- **`yogilib.com`:** about $10.50–11 a year at Cloudflare, Dynadot or Porkbun
  (Namecheap renews at about $18.68). Worth it only to stop someone else
  taking it; it can redirect to `yogilib.org`.
- **`.np`:** `.org.np` and `.com.np` are free from the NIC registry
  (register.com.np, run by Mercantile). But `.org.np` needs an organization
  registration certificate (for example an NGO or trust registered with the
  District Administration Office), and the name must match the registered
  organization. Approval takes a few working days. It's only an option if a
  registered Yogilib or Narharinath organization exists.

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
6. **Old seed accounts (launch blocker).** The original Go app seeded
   `admin@yogilib.org` and `upload@yogilib.org` with weak passwords, and those
   passwords are visible in this public repo's early history. Before the site
   goes live, check the live Neon `users` table for both emails and delete them
   or set new strong passwords. The migration keeps existing passwords, so it
   will not remove them. The current code seeds only random-password demo
   accounts, and only in PGlite.

### Fallback

If Cloud Run's billing-account setup or upload limit is a problem, a small VPS
(about €4 a month) running the same `Dockerfile` behind Caddy has a real disk
and no request-size limit. It costs more and has to be patched by hand.

# Feature validation — 2026-10-08

## Preserved workflows and implementation

| Existing workflow                | Svelte implementation                                                                     | Evidence / remaining checks                                                                   |
| -------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Public document reading          | `/document/:id`, SSR website and mobile route                                             | Built Node HTTP 200; treaty English and Devanagari content asserted                           |
| Login and roles                  | Bcrypt accounts, hashed revocable sessions, role checks                                   | Automated login/logout and permission tests                                                   |
| Archive search and categories    | PostgreSQL text search plus Unicode substring fallback                                    | English/Nepali API tests; authenticated search HTTP check                                     |
| Informational pages and excerpts | Original source content retained                                                          | All principal page routes return HTTP 200                                                     |
| Upload originals                 | PDF/PNG/JPEG/WebP, 30 MB, local or S3 storage                                             | Local API upload and disguised-file rejection tests; S3 integration untested                  |
| Rich-text/source editing         | Lazy Quill, metadata, Preeti and ITRANS tools                                             | Build/type check, server editing tests and converter tests; visual interaction review pending |
| Revision history/restore         | Transactional snapshots, optimistic document versions                                     | Create/edit/stale conflict/restore tests                                                      |
| Private notes/highlights         | Account-scoped notes, reader highlights, UUID retry keys                                  | API privacy and idempotency tests; browser highlight behavior not verified                    |
| Passage links and reader tools   | Table of contents, passage anchors, text search, type size, spacing, width, original view | Implemented and compiled; visual/mobile review pending                                        |
| UI language                      | Preserved English/Nepali catalogue plus new translations                                  | Build/type check; new helper/status copy still needs a native-language review                 |
| Existing attachments             | Existing `/static/docs/:name` read-only directory adapter                                 | Implemented, but actual untracked originals unavailable in cloud                              |
| Downloaded reading               | IndexedDB web, SQLite/filesystem native, cold-start offline web shell                     | Offline queue/storage tests and shell HTTP checks; real browser/airplane-mode test pending    |
| Reading positions                | Versioned server updates, per-account queue, conflict choice                              | API conflict and concurrent-local-update tests                                                |
| Native applications              | Android and iOS Capacitor scaffolds                                                       | Static client build and native sync; no signed/device build                                   |

## Checks run — 2026-10-08

- `npm run check`: zero Svelte/TypeScript errors and warnings.
- `npm test`: 19 automated tests in two files, covering server workflows and offline queue invariants.
- `npm run build`: successful Node/server-rendered website build.
- `npm run test:smoke`: failed at `/about` (HTTP 404 instead of 200). The unchanged script expects informational routes that are absent from the current route tree. This documentation cleanup does not change application routes.
- `git diff --check`: whitespace validation passed.
- No Android/iOS compilation or device checks were run for this documentation cleanup.

Runtime and database checks use disposable PGlite data unless a Neon development branch is explicitly configured. Tests must never use production data.

## Explicitly not verified

Cloud browser navigation to the internal preview failed with `net::ERR_BLOCKED_BY_CLIENT`. Downloading a standalone Chromium binary also failed. Consequently no rendered screenshot, visual acceptance check, service-worker offline reload, or usable public cloud preview is claimed. HTTP checks alone are not proof that every interactive control works.

No actual Android/iOS app was compiled, signed, installed or exercised. Capacitor cookies, SQLite/filesystem behavior, PDF rendering, native back navigation and cold start need device testing. No App Store or Google Play release was made.

No test was run on the real Neon archive or the untracked original-file collection. Perform a complete migration rehearsal on copied data, including stored HTML appearance, password compatibility, attachment URLs and revision snapshots. The migration test verifies a representative existing notes table remains intact and migration reruns safely; it is not proof of complete production-data compatibility.

Other limitations: no offline document editing; the browser cold-start offline shell has fewer reading controls than the connected/native full interface; third-party inline images are not fully cached; offline private caches are unencrypted; search has no OCR or language-aware stemming; local sample mode is not a production database server. Production load, accessibility, infrastructure and security reviews remain outstanding.

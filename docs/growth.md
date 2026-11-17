# Onboarding, data management, AI and contributions

Added 2026-11-17. Everything here is additive (`migrations/002-growth.sql`) and is off or sandboxed by default.

## Reader onboarding

- `/join` creates a free **reader** (viewer) account. The server always assigns `viewer`, whatever the request contains. Only an admin can raise a role.
- After joining, `/welcome` runs a three-step setup: interface language, interests (archive categories), and a short tour. The answers go to `users.preferred_lang`, `users.interests` and `users.onboarded_at`.
- Signed-in readers who have not finished setup see a "Finish setting up" notice.
- Passwords must be at least 10 characters. Emails are stored lowercase and login is case-insensitive for them. Registration is limited to 5 per client address per hour. Set `YOGILIB_REGISTRATION=closed` to stop new sign-ups.
- Login and onboarding interface text is localised (English/Nepali). Google sign-in is still a disabled placeholder.

## Data management

- `audit_log` is an append-only record of document create/update/delete/delete-all/restore, registrations, onboarding, archive exports and payment status changes. Admins see it under **Dashboard → Activity log**.
- **Dashboard → Download archive backup** (`GET /api/admin/export`, admin only) returns a JSON file with every document and revision. It contains no password hashes, sessions or notes. It is metadata and text only: original files stay in storage and must be backed up separately.
- `GET /api/stats` (public) returns document counts by category.
- Migrations now run every `migrations/NNN-*.sql` file in name order. `002-growth.sql` only adds columns and tables. Review it before running `npm run db:migrate` against any shared database.

## AI reading companion

- On each document page, signed-in readers can **Summarise**, **Explain selected passage** or **Ask** a question. The panel is hidden unless `ANTHROPIC_API_KEY` is set on the server.
- The server sends the transcribed text to Claude (`claude-opus-5-5`, low effort, server-side refusal fallback enabled). The system prompt and the document are prompt-cached, so follow-up questions on the same document are cheaper.
- The prompt tells the model to ground answers in the document, quote the original script, label translations as its own reading, and treat the document as source material, not instructions. Answers are marked "AI-generated" in the interface.
- Each reader is limited to `YOGILIB_AI_DAILY_LIMIT` requests per 24 hours (default 20). Token usage is logged to `ai_requests` for cost tracking.
- Documents longer than about 900,000 characters are refused rather than silently truncated.
- **Privacy:** enabling this sends archive text and reader questions to Anthropic. Decide on this, and mention it in a privacy notice, before turning it on in production.

## Contributions (payments)

`/support` lists only the providers whose secrets are configured. With none configured it shows a contact link.

| Provider | Region | Currency | Flow | Verification |
| --- | --- | --- | --- | --- |
| eSewa (ePay v2) | Nepal | NPR | Signed form POST (HMAC-SHA256) | Server calls the eSewa transaction status API |
| Khalti (KPG-2 ePayment) | Nepal | NPR (paisa) | Server calls `epayment/initiate/`, then redirects | Server calls `epayment/lookup/` and checks the amount |
| Stripe Checkout | International cards | USD (configurable) | Server creates a Checkout Session, then redirects | Server retrieves the session and checks `payment_status`, amount and currency |

- The payment status is decided **only** by a server-to-server lookup. Query strings from the browser redirect are never trusted. A completed payment is final, and a payment whose amount doesn't match is marked failed.
- Guests can contribute. A signed-in contributor is linked to their account.
- Sandbox endpoints are used unless `ESEWA_ENV=live` / `KHALTI_ENV=live`. Stripe test or live mode follows the key.

### Before going live (not yet done)

1. **Sandbox test each provider end to end.** The adapters were unit-tested against mocked provider responses only. No real gateway call has been made. In particular, check eSewa's signature and amount formatting (`total_amount` as `100` vs `100.0`) against the current eSewa developer documentation. That site could not be reached from the build environment.
2. **Merchant accounts.** eSewa and Khalti need a registered Nepali merchant. Stripe does not onboard Nepal-registered businesses, so international cards need either an entity in a Stripe-supported country or a Nepali bank card gateway (for example a NIC Asia, Nabil or Himalayan Bank card gateway). Treat that as a follow-up adapter.
3. **Fonepay / QR.** Not implemented yet. Fonepay is the Nepali interoperable QR network. PhonePe and Google Pay operate in India and are not available to Nepali merchants. Fonepay QR is the local equivalent and is the next adapter to add once merchant credentials exist.
4. Add refund handling and a receipt email if contributions become recurring or tax-relevant.
5. Production deployment and turning on live keys need explicit authorisation.

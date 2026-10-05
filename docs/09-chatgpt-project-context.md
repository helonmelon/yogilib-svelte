# Yogilib current context

Updated 2026-10-05.

Yogilib uses SvelteKit and TypeScript on Node, with PostgreSQL, Capacitor mobile shells, IndexedDB browser downloads, native SQLite/filesystem downloads, and optional S3 originals.

## Current source

- New Svelte remote (`origin`): https://github.com/helonmelon/yogilib-svelte
- Check Git status and remote refs before publishing changes.

## Architecture and product

SvelteKit + TypeScript on Node, shared PostgreSQL, Capacitor Android/iOS shells, IndexedDB browser downloads, native SQLite/filesystem downloads, optional S3 originals. Keep saffron/brown/cream visual identity, original archive scripts and language, server-enforced roles, existing public document URLs, uploads/editing, private notes and revisions. See architecture.md and verification.md for exact implementation and evidence.

Local development uses `npm ci`, then `npm run dev`, with disposable PGlite sample data. For Neon, configure a private `DATABASE_URL` and run `npm run dev:postgres`. External schema changes are opt-in.

## Boundaries

Do not expose credentials, use production data as disposable test data, deploy production, or publish an app-store release without separate authorization.

Run check, test, build and smoke checks before publishing. Validate visuals in an available browser, rehearse database changes against a Neon development branch, and test native apps on devices before claiming device readiness. Never expose credentials in tool output or public environment variables.

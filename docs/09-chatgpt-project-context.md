# Yogilib current context — Svelte migration

Updated 2026-10-05. This document supersedes the Go execution details in `docs/v0.1/09-chatgpt-project-context.md` for this checkout.

The user explicitly approved moving away from Go to a lightweight JavaScript architecture, preserving all previous work in `yogilib0.1`, and building the Svelte app. Work belongs in the “Build Yogilib Context” conversation inside the Yogilib ChatGPT Project. Do not redirect work to the Moving Project conversation.

## Current source

- New Svelte remote (`origin`): https://github.com/helonmelon/yogilib-svelte
- Original Go remote (`legacy-go`): https://github.com/helonmelon/yogilib
- Migration branch: `migration/sveltekit`.
- Base commit: `249a3e92b108a17f5ed7ede37a20621ee21f87f5`.
- The user authorized committing and pushing this migration to the new repository. Check Git status and remote refs for the current publication state. Use the saved `yogilib0.2-svelte.zip` to recover this working source if the scratch checkout expires.
- The preserved Go checkout is a separate sibling `yogilib0.1/`; its saved ZIP includes the original Git bundle.
- The saved backups include cloud-accessible source, not the live database, ignored credentials, or Windows/Mac-only attachments.

## Architecture and product

SvelteKit + TypeScript on Node, shared PostgreSQL, Capacitor Android/iOS shells, IndexedDB browser downloads, native SQLite/filesystem downloads, optional S3 originals. Keep saffron/brown/cream visual identity, original archive scripts and language, server-enforced roles, existing public document URLs, uploads/editing, private notes and revisions. See architecture.md and verification.md for exact implementation and evidence.

Local development is self-contained: `npm ci`, then `npm run dev`, using disposable PGlite sample data. No Go or standalone PostgreSQL service is necessary for this mode. Real PostgreSQL integration is implemented but has not been run against the shared Neon archive. External schema changes are opt-in, not part of startup.

## Boundaries

Production deployment, shared-database mutations and app-store release remain outside the authorized scope. The user subsequently authorized committing and pushing the Svelte source to the new repository. Windows was not accessed or modified. The user previously reported a verified Windows Go preview at http://localhost:8080/; it is Windows-local and is not the new Svelte version. This task does not verify cross-device conversation/file sync.

Production Node HTTP smoke tests and the mobile static compilation are verified. Cloud browser access to the internal development preview failed with `net::ERR_BLOCKED_BY_CLIENT`. A Chromium download also failed. No user-accessible cloud preview URL or successful browser/physical-device test is claimed.

## Continue here

Restore/open the new source; inspect Git status before changing it. Preserve old snapshots. Run check/test/build/smoke checks. Next, validate visuals in an available browser, rehearse against a copied real database plus original files, and test the native apps on devices. Do not connect a live database, deploy the website or publish an app-store release without separate authorization. Never expose credentials in tool output or public environment variables.

# Yogilib ChatGPT project context

Updated October 4, 2026. This is the safe, durable context to attach to the
Yogilib ChatGPT project. It intentionally contains no passwords, API keys,
database URLs, session tokens, or other credentials.

## Purpose

Yogilib is a digital archive for the works of Yogi Narharinath and related
historical material. It serves English, Nepali, and Sanskrit content. Preserve
source material in its original script. The interface itself can be switched
between English and Nepali without translating or modifying archive content.

The user prefers direct, simple explanations and expects requested changes to
be implemented, checked, committed, and pushed when they ask for a GitHub push.
Keep the interface fast, compact, readable, and respectful of the archive.

## Current product decisions

- Signed-out visitors who open `/` are sent to `/login`. Direct document links
  and other reading pages remain public.
- After login, users enter the archive homepage. Admin-only and uploader-only
  actions remain protected by role checks.
- The public masthead is compact: portrait and Yogilib wordmark on the left;
  language controls and a Login action on the right. About and Contribute were
  removed from the masthead.
- The visual theme is modern saffron: temple brown, burnt saffron, warm cream,
  amber borders, and vermilion accents. Maintain strong text contrast and avoid
  flooding large areas with bright orange.
- Document pages follow a dense reference-layout philosophy inspired by
  Wikipedia. They use the full page, keep the table of contents on the left,
  article content in the center, and search/reading controls on the right.
- The left contents panel and right tools remain visible while scrolling on
  desktop. On the right, Find in document appears above Reading tools.
- Mobile readers prioritize the article and collapse the multi-column layout
  into a usable sequence.
- Admins can delete any document. Uploaders can delete only documents they
  uploaded. Other users and anonymous visitors cannot delete documents.
- Interface strings come from `ui-translations.json`. The interface preference
  is remembered in a cookie. Stored document titles, descriptions, text,
  author fields, excerpts, and notes are never auto-translated.

## Technical shape

- Server-rendered Go application using `net/http` and `html/template`.
- Go 1.25 or newer, as declared by `go.mod`.
- Neon Postgres provides shared application data. `DATABASE_URL` is required
  to run the app and must remain private.
- Sessions are stored in Postgres; passwords use bcrypt.
- Main templates live in `templates/`; shared styling is in
  `static/css/style.css`; reader-specific styling and behavior are in
  `static/css/reader.css` and `static/js/reader.js`.
- Uploaded files under `static/docs` are local and ignored by Git. GitHub does
  not transfer them. Object storage is not connected yet.

## Safe development workflow

1. Read `AGENTS.md`, `README.md`, and the relevant files in `docs/`.
2. Check the current branch, working tree, and remote state before syncing.
3. Preserve existing work. Do not force-push or reset to resolve ordinary sync
   issues.
4. For code changes, run:

   ```bash
   env -u TEST_DATABASE_URL -u YOGILIB_READER_TEST go test ./...
   env -u TEST_DATABASE_URL -u YOGILIB_READER_TEST go vet ./...
   ```

5. Database integration tests are opt-in. Never use shared live data as
   disposable test data.
6. Keep credentials in ignored local environment files or the environment.
7. Report the branch, commit, checks run, and whether changes were pushed.

## Repository and current state

- GitHub: `https://github.com/helonmelon/yogilib`
- Primary local project: `/Users/kafle/Desktop/yogilib`
- Codex working branch used for recent work: `codex/cross-device-setup`
- Immediately before this context bundle was added on October 4, 2026, local
  `main`, the working branch, and `origin/main` were aligned at `48f9096`
  (`Adopt modern saffron interface palette`). Recheck this before relying on it
  because it is a dated handoff fact.
- The repository remote uses authenticated HTTPS because SSH authentication was
  rejected on this computer.

## Known limits and open work

- Hosting and production deployment remain unverified. Fly configuration may
  still describe the older SQLite setup; do not deploy as part of routine setup.
- Git does not transfer `.env.local`, database contents, or ignored uploaded
  documents.
- Phone pairing and Remote access were reported as completed, but a verified
  phone-originated edit and the other-desktop setup are still outstanding.
- A ChatGPT project preserves its uploaded sources, instructions, and Chat/Work
  chats. It does not automatically copy Codex conversation history or gain
  direct access to this local folder.

## Files that define the project

- `AGENTS.md` — operational rules
- `README.md` — setup, architecture, and feature overview
- `docs/02-architecture.md` — routes and template structure
- `docs/03-design-system.md` — visual language and components
- `docs/04-backend-integration.md` — database and handler behavior
- `docs/05-language-support.md` — Nepali/Sanskrit handling and UI locale rules
- `docs/07-cross-device-work.md` — multi-device workflow
- `docs/08-project-handoff.md` — current device/setup handoff

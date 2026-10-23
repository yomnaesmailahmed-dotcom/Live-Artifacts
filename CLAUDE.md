# Project Controls workspace

A static site (no build step) on Supabase for managing projects, deliverables, budget, QC and client progress. Read `docs/spec.md`, `docs/architecture.md`, `docs/plan.md` before changing anything.

## Stack
- Pages: `*.dc.html` (DC runtime + React from `vendor/`), logic in ES modules under `js/`.
- Backend: Supabase (project `tsghvdwpcasnfevynebe`): Auth, Postgres with RLS, Realtime, Vault, Edge Functions `mail-scan` and `ask`.
- AI: Claude (`claude-opus-5-5`) called only from Edge Functions.

## Commands
- Run locally: `python scripts/dev_server.py 5517`, open http://localhost:5517/Projects.dc.html
- Test everything: `for t in tests/*.test.mjs; do node $t; done`
- Before every deploy: `python scripts/stamp_versions.py`
- Deploy: commit, then `git push origin main` and `git push live-artifacts main` (both publish via GitHub Pages)

## Rules
- Rules live in `js/domain/` as pure functions with a test in `tests/`; SQL views must give the same numbers.
- New code must work if a new table or view is not there yet (the last release keeps running).
- Database changes: add a file in `supabase/migrations/`, ask the user, then run it in the Supabase dashboard SQL editor (the connector declines writes). Test rules in a rolled-back block. Watch trigger names: Postgres fires them alphabetically.
- Ask before running migrations, committing or publishing.
- Colours: muted palette (slate `#2A3042`, indigo `#5A63A8`, sage `#7FA08A`, sand `#C2A25A`); no bright colours.
- Never write secrets to files. Secrets by name: `ANTHROPIC_API_KEY`, `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET` (Edge Function secrets). `supabase/migrations/` is git-ignored because it holds the admin allow-list.
- Testing gotcha: after code changes use `location.reload()`; changing only the URL hash does not reload.

## Docs
- [docs/spec.md](docs/spec.md) · [docs/architecture.md](docs/architecture.md) · [docs/plan.md](docs/plan.md) · [docs/tooling.md](docs/tooling.md)
- [README.md](README.md) (how the numbers work) · [OUTLOOK_SETUP.md](OUTLOOK_SETUP.md)

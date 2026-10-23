# Architecture

## In one picture
```
Browser (static pages, no build step)
  Projects / Project / Main (review) / Admin  .dc.html
  js/pages → js/state (stores) → js/view (view models) → templates
        │  supabase-js (publishable key, user's login)
        ▼
Supabase
  Auth · PostgreSQL + Row Level Security · Realtime · Vault
  Views: project_metrics, project_progress, project_qc
  Edge Functions: mail-scan (Outlook → Claude), ask (AI helper → Claude)
  pg_cron: runs mail-scan every 30 minutes
        │
        ▼
Microsoft Graph (Outlook mail)      Anthropic API (Claude)
```

## Why it is built this way
| Choice | Reason | Rejected |
|---|---|---|
| Static site, ES modules, no bundler | Host anywhere for free (GitHub Pages); nothing to build or break | A framework + build pipeline |
| Supabase | Login, database, live updates and per-row security in one service | Writing our own server |
| Row Level Security does the access control | The browser is untrusted; the database enforces roles | Hiding buttons only |
| Rules live in SQL views and mirrored pure JS functions with tests | Same numbers on every page; tests catch drift | Calculating in each page |
| AI functions read data as the signed-in user | The AI can never see more than the person asking | A service key that reads everything |
| Excel read by our own small reader | No third-party library with known file-parsing flaws | Importing an Excel library |

## Folder map (`Summary Refresh – interactive prototype-html/`)
| Path | What is there |
|---|---|
| `*.dc.html` | The four pages (templates plus a thin adapter) |
| `js/pages/` | Page entry points; each starts a session and its store |
| `js/state/` | Stores: load tables, live sync, actions |
| `js/view/` | View models: turn state into what the template shows |
| `js/domain/` | Pure rules: roles, deliverables, schedule, registers, progress, qc, import-map, review, mail |
| `js/lib/` | Live table sync, Supabase client, Excel/CSV reader |
| `js/ui/` | Formatting, colour tokens, the Ask AI panel |
| `css/app.css` | Sidebar layout, cards, meters, AI panel |
| `supabase/migrations/` | Database changes in order (git-ignored: holds the admin allow-list) |
| `supabase/functions/` | `mail-scan` and `ask` Edge Functions (published) |
| `tests/` | One test file per rule area |
| `scripts/` | Dev server, version stamping |
| `docs/` | These documents |

## Data model (main tables)
`clients` → `projects` (budget hours, contract fee, currency, invoiced, cost) → `components`, `deliverables` → `submissions`, `qc_checks` (three gates each).
Also per project: `milestones`, `actions`, `ptm_queries`, `team_status`, `variations`, `incidents`, `hours_snapshots`, `project_members`, `project_invites`.
Mail: `mail_connections`, `mail_folders`, `mail_candidates`, `mail_scan_runs`, `mail_oauth_states`.
Review: `refresh_runs`, `run_decisions`. Settings and audit: `app_settings`, `audit_events`, `profiles`.

Views: `project_metrics` (status, hours, schedule, queries), `project_progress` (completion %, approved %, fee), `project_qc` (gate counts).

## Security
- Roles: global (`admin`, `management`, `member`) and per project (`dm`, `ptm`, `team`, `viewer`).
- Every table has RLS; anonymous users get nothing.
- Gate and variation decisions are guarded by database triggers (who may sign, in what order).
- All edits are written to an audit trail with who and when.
- Outlook tokens are encrypted in Supabase Vault; each person's scan reads only their own mailbox and only the folders they map.
- The publishable key in `js/config.js` is meant to be public. Secrets are never in files.

**Secrets (names only, stored as Edge Function secrets):** `ANTHROPIC_API_KEY` (not added yet), `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET` (not added yet).

## Deploy
Two GitHub repos hold the same code and both publish via GitHub Pages: `summary-refresh` (live site) and `Live-Artifacts`. Before each deploy run `python scripts/stamp_versions.py` so browsers never mix old and new files.

## Known risks
- GitHub Pages sometimes queues or rejects a build while an earlier one is in progress; re-run it.
- Database changes cannot be applied through the Supabase connector in this setup; they run in the dashboard SQL editor.
- Trigger order matters in Postgres (alphabetical). A QC permission bug came from this and was fixed; keep it in mind for new tables.
- The AI answers from a text snapshot of the data; very large portfolios may need trimming (currently capped at 200 projects).

# Project Controls workspace (formerly Summary Refresh)

A company-wide project-controls workspace for the management department, backed
by Supabase (Auth, PostgreSQL, Row Level Security, Realtime, Presence). It is a
plain static site: no build step, no framework, and supabase-js comes from the CDN.

Being built in phases. Done: (1) roles, clients, projects, deliverables +
submissions, teams/invites, admin, live presence; (2) variation orders with the
email checkpoint, internal/external incidents, PCU hours ledger; (3) timeline
(milestones + Gantt), action plan, PTM → DM queries, weekly team status, and
"Waiting on you" on the Projects page. Next: generic management review (4) ·
Outlook VO scan (5).

**Schedule rules (phase 3).** An unfinished milestone slips when its forecast
(or today) passes its baseline → Delayed. An action is late when it's overdue
or due after its milestone → At Risk; so is a team update marked Blocked.
Team members can update status, actual hours and notes of their own actions;
anyone on the project except viewers can raise queries and post status.

**How the numbers work (phase 2).** Budget = baseline + approved external VO
hours. Consumed = latest PCU snapshot (per component, or one project total).
To complete = planned hours of open deliverables + remaining incident hours.
At completion = consumed + to complete. Contract finish = baseline + approved
VO days. Status: Delayed if a deliverable is late, the forecast passes the
contract finish, or an open incident has a time impact; At Risk at ≥ the
admin's threshold (90%), when the forecast exceeds budget, or while a VO is
still a draft.

## Pages

| Page | What it does |
| --- | --- |
| `Projects.dc.html` (home) | Portfolio of every project you can see: status (with the reason), late deliverables, next due, last submission, filters, **New project** (management) |
| `Project.dc.html?id=…` | **Overview** (details, components, hours KPIs, archive/delete) · **Deliverables** (RFP / proposal / scope / added / VO, baseline–forecast–actual, submissions with client response, paste from Excel, ✉ email checkpoint) · **Timeline** (Gantt, milestones, action plan with owners) · **Queries & status** (PTM → DM queries with answers, weekly team status) · **Variations** (VO-nnn with email evidence, time/hours/fee impact, client decision, add as deliverable) · **Incidents** (INC-nnn internal/external, responsibility + basis, hours/cost/delay, recovery VO) · **Hours** (PCU snapshots, paste export, budget build-up, EAC) · **Team** (roles, invites by email, who's here now) |
| `Admin.dc.html` | Company name, at-risk %, email-scan keywords · people and global roles · clients |
| `Main.dc.html` | The original 8-step COO summary refresh (made generic in phase 4) |

Roles: **admin** / **management** see every project; **members** see projects
they're on, as **DM** (edits + manages the team), **PTM** (edits), **team** or
**viewer** (read). Everything is enforced by RLS in the database; the UI only
hides what you can't do.

## Layout

```
Projects.dc.html, Project.dc.html, Admin.dc.html   workspace pages (template + thin adapter)
Main.dc.html            the original review page: <x-dc> template (UI) + a thin logic adapter
index.html              redirects to Projects.dc.html (for static hosts)
css/app.css             shared design tokens for the workspace pages
js/pages/*.js           one entry per workspace page → window.DCPage
js/lib/live-table.js    two-way table sync: load, Postgres Changes, optimistic debounced writes
js/state/session-store.js, page-base.js, *-store.js   session + one store per page
js/domain/*.js          pure rules (deliverable sources/statuses, paste parser, roles)
js/view/<page>/*.js     page view models; js/view/shell.js = header + sign-in gate
scripts/dev_server.py   local server with caching disabled
support.js, vendor/     DC runtime that renders the template (unchanged)
js/
  main.js               entry module → exposes window.SummaryRefresh
  config.js             Supabase URL, publishable key, pinned supabase-js CDN URL
  lib/supabase-client.js  lazy createClient() via dynamic import
  services/auth.js      sign in / sign up / magic link / sign out / profile
  services/run-repository.js  refresh_runs + run_decisions CRUD
  services/realtime.js  Postgres Changes subscription for one run
  state/app-store.js    single store: UI state, debounced saves, realtime merge
  state/initial-state.js, state/persistence-map.js   state ⇄ row mapping
  data/reference-data.js  the static reference content (projects, conflicts…)
  ui/tokens.js          design-token style strings
  view/*.js             per-step view models → template bindings
supabase/migrations/    schema, RLS, triggers, grants, realtime publication (kept local, not in the public repo)
tests/*.test.mjs        `node tests/workspace.test.mjs` and `node tests/app-store.test.mjs` (fake Supabase client)
```

Workspace tables (Phase 1): `app_settings`, `clients`, `projects`,
`project_members`, `project_invites`, `components`, `deliverables`,
`submissions`, `audit_events` (written by triggers), and the
`project_metrics` view (`security_invoker`), which computes status and the
reason for it the same way on every page.

The DC runtime evaluates the component as a classic script, so it cannot
`import`. `js/main.js` publishes one frozen global (`window.SummaryRefresh`)
and the component just subscribes to the store and renders
`buildViewModel(state, actions)`.

## Data model (project `Live-Artifacts`, ref `tsghvdwpcasnfevynebe`)

| Table | Purpose |
| --- | --- |
| `profiles` | one row per auth user; `role` = `admin` \| `member` |
| `refresh_runs` | one refresh: dates, step, inputs, check/extract state, status (`active` / `approved` / `archived`) |
| `run_decisions` | every user decision in a run, keyed `(run_id, kind, item_key)` — reviews, DM answers, conflict picks, status approvals, responsibility, stages, wording, next actions |
| `run_members` | optional sharing: add a user to a run (`can_edit` true/false) |

**Admin role.** A trigger on `auth.users` creates the profile and makes the
allow-listed owner email an admin automatically — only once that email is
confirmed. The allow-list lives in `private.admin_allowlist` (not exposed
via the API). Admins cannot be demoted while on the allow-list, and only
admins can change anyone's role.

**RLS.** Members see and edit only runs they own or were added to; viewers
(`can_edit = false`) can read but not write; archived runs are read-only;
admins see everything. `anon` has no access to any table. `updated_by`,
`approved_by` and timestamps are stamped by triggers, so they can't be spoofed.

**Realtime.** `refresh_runs` and `run_decisions` are in the
`supabase_realtime` publication; Postgres Changes respects the SELECT
policies. Each tab tags its writes with an origin id so its own echoes are
ignored, and a field you are still typing in is never overwritten by a
remote value. Collaborators' changes merge in live; your current step only
follows *your own* other devices.

**Sharing a run.** The open run's id is in the URL (`?run=<uuid>`). The owner
(or an admin) adds a collaborator with:

```sql
insert into public.run_members (run_id, user_id, can_edit)
values ('<run uuid>', (select id from public.profiles where email = 'person@company.com'), true);
```

## Run locally

Serve the folder over HTTP (ES modules don't load from `file://`):

```bash
python -m http.server 5517
```

then open http://localhost:5517/Main.dc.html.

## Deploy

Before each deploy, stamp module versions so browsers never mix new HTML with
cached old modules (GitHub Pages caches ~10 minutes):

```bash
python scripts/stamp_versions.py
```

Then upload this folder as-is to any static host (Netlify, Vercel static,
Cloudflare Pages, GitHub Pages, S3). Then, in the Supabase dashboard →
Authentication → URL Configuration, set **Site URL** to the deployed page and
add it (and `http://localhost:5517/**` for local use) to **Redirect URLs**, so
confirmation and magic-link emails return to the app.

Recommended in Authentication settings: keep **Confirm email** on (admin is
only granted to a confirmed address) and turn on **leaked password
protection**.

The publishable key in `js/config.js` is meant to be public; never put a
secret / `service_role` key in this folder.

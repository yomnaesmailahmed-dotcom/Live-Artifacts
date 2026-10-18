# Summary Refresh – interactive prototype

The NHC COO executive-summary refresh workflow, now backed by Supabase
(Auth, PostgreSQL, Row Level Security, Realtime). It is still a plain static
site: no build step, no framework, and supabase-js comes from the CDN.

## Layout

```
Main.dc.html            the page: <x-dc> template (UI) + a thin logic adapter
index.html              redirects to Main.dc.html (for static hosts)
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
tests/app-store.test.mjs  `node tests/app-store.test.mjs` (fake Supabase client)
```

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

Upload this folder as-is to any static host (Netlify, Vercel static,
Cloudflare Pages, GitHub Pages, S3). Then, in the Supabase dashboard →
Authentication → URL Configuration, set **Site URL** to the deployed page and
add it (and `http://localhost:5517/**` for local use) to **Redirect URLs**, so
confirmation and magic-link emails return to the app.

Recommended in Authentication settings: keep **Confirm email** on (admin is
only granted to a confirmed address) and turn on **leaked password
protection**.

The publishable key in `js/config.js` is meant to be public; never put a
secret / `service_role` key in this folder.

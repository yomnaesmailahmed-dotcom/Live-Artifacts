# Spec — Project Controls workspace

One shared place where a consultancy's management department sees every project: what is late, what the budget and hours look like, what the client has approved, and what needs a decision. It replaces a set of Excel trackers and email chasing.

## Who uses it
- **Management / admin** — see every project, create projects, run the management review.
- **DM (Design Manager)** — edits and manages their projects and team; signs QC3; records the client's decision on variations.
- **PTM (Project Technical Manager)** — edits the project; signs QC2.
- **Team members** — contribute (status updates, queries, QC1, their own actions).
- **Viewers** — read only.

Scale: one company, tens of people, tens of projects. *(Assumption — not confirmed with the user.)*

## What it does today (version one, built)
| Area | What the user can do |
|---|---|
| Projects | Portfolio with status and the reason for it; filters; per-client progress cards; create projects |
| Deliverables | Track RFP / proposal / scope / added / VO deliverables with baseline, forecast, actual dates, submissions and client responses |
| Timeline | Milestones with a Gantt chart, action plan with owners, slip and late rules |
| Queries and status | PTM questions to the DM with due dates; weekly team status with blockers |
| Variations and incidents | Variation orders with the client email as evidence; internal and external incidents with hours, cost and delay |
| Hours | Monthly consumed-hours snapshots (PCU), budget build-up, forecast at completion |
| Budget and progress | Contract fee, invoiced and cost to date; completion % from deliverables; share approved by the client; client roll-up |
| QC gates | QC1 → QC2 → QC3 per deliverable, with the sign-off email stored as evidence |
| Import | Excel / CSV files into deliverables, milestones, actions, hours, with preview and duplicate skipping |
| Outlook scan | Finds client emails that may justify a variation order (needs Microsoft setup) |
| Management review | Eight-step review over the real data, Excel export, briefing notes |
| Ask AI | Plain-language questions answered only from data the user can see (needs the Claude API key) |

## Done means
- Everyone sees the same numbers on every page, live.
- A person can only see and change what their role allows — enforced in the database, not only on screen.
- Every rule has a test, and the site works with no build step.

## Not built yet
1. **PDF import** — needs the AI; waits for the API key.
2. **Client reviews from Outlook** — collect each client's comments and feedback on a submission into a "client review" register.
3. **Automatic QC evidence** — archive the sign-off email from Outlook instead of pasting it.
4. **Google Sheets live link, ERP and archiving portal** — the system names and API / export options are unknown; today these come in as Excel / CSV exports.

## Out of scope
- Replacing the ERP, accounting or document-control systems.
- Editing data through the AI helper (it only reads and explains).
- Mobile apps.

## Assumptions to confirm
- Default currency is SAR (editable per project).
- "Delivered" = submitted or approved; "approved" = approved by the client.
- QC meaning: QC1 team self-check, QC2 PTM review, QC3 DM sign-off.

# Build plan

Each step ends with a proof. Do one step, show the proof, then wait.

## Done
| # | Phase | Proof |
|---|---|---|
| 1 | Roles, clients, projects, deliverables, admin, presence | Database rule test 27/27 |
| 2 | Variation orders, incidents, PCU hours | Rule test 22/22 |
| 3 | Timeline, action plan, queries, team status | Rule test 21/21 |
| 4 | Management review over real data | `tests/review.test.mjs` |
| 5 | Outlook scan (code and function deployed) | RLS test 29/29 · waiting on Microsoft and API key setup |
| 6 | Money budget, completion %, client progress | `tests/progress.test.mjs` · view returns a row per project |
| 7 | QC1/QC2/QC3 gates with email evidence | `tests/qc.test.mjs` · database rule test passes after the trigger-order fix |
| 8 | Excel / CSV import | `tests/import.test.mjs` (real .xlsx round trip) |
| – | Muted sidebar redesign | Checked on sign-in and Projects pages |
| – | Ask AI helper | `tests/ask.test.mjs` · function deployed, returns 401 without sign-in |

## Open items (do first)
1. **Publish the Import tab.** Commit `35fe763` is pushed but GitHub's Pages build is stuck. Proof: `https://yomnaesmailahmed-dotcom.github.io/summary-refresh/js/lib/xlsx-reader.js` returns 200. If still stuck, trigger a new build from the repository's Pages settings or push a new commit.
2. **Add the Claude API key** as the `ANTHROPIC_API_KEY` Edge Function secret. Proof: the Ask AI panel answers a question.
3. **Finish Outlook setup** (`OUTLOOK_SETUP.md`). Proof: "Connect Outlook" on a project's Variations tab succeeds.
4. **Look at every new tab signed in** (QC, Import, Budget and Progress cards, By client). They were only tested by code and database checks.

## Next phases
| # | Step | Proof |
|---|---|---|
| 9 | **Client reviews register:** table for client comments per submission (comment, discipline, status, response); manual entry and Excel import | Rule test, tests, a row shows on the deliverable |
| 10 | **Outlook → client reviews:** extend `mail-scan` to detect review comments and feedback and propose rows in an inbox, like VO candidates | Test email produces a candidate; accepting it creates a client-review row |
| 11 | **Outlook → QC evidence:** attach a scanned email to a QC gate | Picking an email fills the gate's evidence fields |
| 12 | **PDF import:** a function that reads a PDF with Claude and returns rows for the same preview as Excel | A sample PDF produces a correct preview; nothing is saved before confirming |
| 13 | **Google Sheets by link:** read a shared sheet as CSV into the import preview | A public sheet link fills the preview |
| 14 | **ERP and archiving portal:** needs the system names and whether they have an API or export. Until then use step 8 with exports | Decide after the user names the systems |
| 15 | **Ask AI polish:** include QC, client reviews and import history in what it can answer about | Questions about QC status answered correctly |

## Working rules
- Database changes: write the migration file, then ask before running it in the SQL editor; test rules inside a rolled-back block.
- Publish only after approval, using the steps in `CLAUDE.md`.
- Keep the last release working: new code must cope with a table or view that does not exist yet.

# Tooling

Only what this project needs.

| Tool | Why | Status |
|---|---|---|
| Supabase connector (MCP) | Read data, deploy Edge Functions, check results. It declines database writes, so schema changes go through the dashboard SQL editor | In use |
| Built-in browser pane | Open the Supabase SQL editor and preview the site | In use |
| `gh` (GitHub CLI) | Check and re-run GitHub Pages builds | In use |
| Node 26 | Runs the tests | In use |
| Python | Dev server and version stamping | In use |
| Claude API key | Needed by the Ask AI helper, PDF import and the Outlook scan | **Not added yet** |
| Microsoft Entra app (tenant, client id and secret) | Needed for the Outlook scan | **Not set up yet** |

No extra skills, plugins or MCP servers are required for the next phases.

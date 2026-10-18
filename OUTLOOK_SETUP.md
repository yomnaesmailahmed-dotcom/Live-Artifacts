# Outlook scan — setup (phase 5)

The scan needs **one Microsoft Entra app registration** and **one Claude API key**. Everything
else (tables, Vault, the 30-minute schedule, the `mail-scan` Edge Function) is already in place.

## 1. Register the app in Microsoft Entra ID (Azure)

You need a Microsoft 365 account that can register apps (or ask IT to do this part).

1. Go to <https://entra.microsoft.com> → **Identity → Applications → App registrations → New registration**.
2. **Name:** `Project Controls – Outlook scan`.
3. **Supported account types:** *Accounts in this organizational directory only (single tenant)*.
4. **Redirect URI:** platform **Web**, value exactly:

   ```
   https://tsghvdwpcasnfevynebe.supabase.co/functions/v1/mail-scan
   ```

5. Click **Register**. On the **Overview** page copy:
   - **Application (client) ID** → `MS_CLIENT_ID`
   - **Directory (tenant) ID** → `MS_TENANT_ID`
6. **Certificates & secrets → Client secrets → New client secret**. Description `supabase`, expiry 24 months.
   Copy the **Value** column straight away (it is shown once) → `MS_CLIENT_SECRET`.
   Put the expiry date in your calendar: the scan stops when the secret expires.
7. **API permissions → Add a permission → Microsoft Graph → Delegated permissions**, tick:
   - `Mail.Read` (read the signed-in person's mail)
   - `offline_access` (keep scanning without signing in again)
   - `User.Read` (already there by default)

   Then **Grant admin consent for <your organisation>**. If the button is greyed out, ask an IT admin;
   if your tenant lets users consent to `Mail.Read` themselves, it also works without it.

Only delegated permissions are used: each person's scan can read **only their own mailbox**, and only
the folders they map to a project are read.

## 2. Get a Claude API key

<https://console.anthropic.com> → **API keys → Create key** (name it `project-controls-mail-scan`) →
copy it → `ANTHROPIC_API_KEY`. Add billing/credits on the same console. Cost is small: only emails that
match the admin keywords are sent, one short request each (Claude Opus 5.5, low effort).

## 3. Put the four values into Supabase (not into chat or code)

Supabase dashboard → project **Live-Artifacts** → **Edge Functions → Secrets**
(<https://supabase.com/dashboard/project/tsghvdwpcasnfevynebe/functions/secrets>) → add:

| Name | Value |
| --- | --- |
| `MS_TENANT_ID` | Directory (tenant) ID |
| `MS_CLIENT_ID` | Application (client) ID |
| `MS_CLIENT_SECRET` | the client secret **Value** |
| `ANTHROPIC_API_KEY` | the Claude API key |

They take effect immediately; nothing needs redeploying. **Admin → Outlook scan** then shows
"✓ set" for both lines.

## 4. Use it

1. Open a project → **Variations** → **Connect my Outlook** → sign in with Microsoft → accept.
2. **Add a folder to scan…** → pick the project's folder (for example `Inbox / Projects / Ubayya`).
   One folder feeds one project. The first scan looks back 14 days (Admin can change this).
3. **Scan now**, or wait — every 30 minutes all connected mailboxes are scanned.
4. Candidates appear above the VO list with the quote, sender, suggested deliverable and estimate.
   **Accept → draft VO** creates VO-nnn with the email evidence; **Not a change** dismisses it.

Admin → **Outlook scan** shows who is connected, the last scans, and lets you pause the scan for everyone.

## What leaves the company

For emails that match a keyword, the newest message of the thread (plus up to 3,000 characters of the
earlier thread), the sender, subject, the project name/scope and its deliverable titles are sent to
Anthropic's API to be judged. Nothing else is sent. Refresh tokens are encrypted in Supabase Vault; the
browser never sees them.

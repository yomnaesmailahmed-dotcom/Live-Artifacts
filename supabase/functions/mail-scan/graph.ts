// Microsoft identity platform (OAuth 2.0 + PKCE) and Microsoft Graph calls for the Outlook scan.
const GRAPH = 'https://graph.microsoft.com/v1.0';
export const SCOPES = 'offline_access User.Read Mail.Read';

export type MsConfig = { tenant: string; clientId: string; clientSecret: string; redirectUri: string };

export function msConfig(): MsConfig | null {
  const tenant = Deno.env.get('MS_TENANT_ID') || '';
  const clientId = Deno.env.get('MS_CLIENT_ID') || '';
  const clientSecret = Deno.env.get('MS_CLIENT_SECRET') || '';
  if (!tenant || !clientId || !clientSecret) return null;
  return { tenant, clientId, clientSecret, redirectUri: `${Deno.env.get('SUPABASE_URL')}/functions/v1/mail-scan` };
}

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const randomToken = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)));
export async function pkceChallenge(verifier: string) {
  return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
}

export function authorizeUrl(cfg: MsConfig, state: string, challenge: string) {
  const q = new URLSearchParams({
    client_id: cfg.clientId, response_type: 'code', redirect_uri: cfg.redirectUri, response_mode: 'query',
    scope: SCOPES, state, code_challenge: challenge, code_challenge_method: 'S256', prompt: 'select_account',
  });
  return `https://login.microsoftonline.com/${encodeURIComponent(cfg.tenant)}/oauth2/v2.0/authorize?${q}`;
}

export class MsError extends Error {
  constructor(message: string, public status = 0, public code = '') { super(message); }
}

async function tokenRequest(cfg: MsConfig, params: Record<string, string>) {
  const res = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(cfg.tenant)}/oauth2/v2.0/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, scope: SCOPES, ...params }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    const desc = String(data.error_description || data.error || `HTTP ${res.status}`).split('\r\n')[0];
    throw new MsError(`Microsoft sign-in failed: ${desc}`, res.status, String(data.error || ''));
  }
  return data as { access_token: string; refresh_token?: string; expires_in: number };
}

export const redeemCode = (cfg: MsConfig, code: string, verifier: string) =>
  tokenRequest(cfg, { grant_type: 'authorization_code', code, redirect_uri: cfg.redirectUri, code_verifier: verifier });
export const refreshAccess = (cfg: MsConfig, refreshToken: string) =>
  tokenRequest(cfg, { grant_type: 'refresh_token', refresh_token: refreshToken });

export async function graphGet(token: string, url: string, prefer: string[] = []) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url.startsWith('http') ? url : `${GRAPH}${url}`, {
      headers: { Authorization: `Bearer ${token}`, ...(prefer.length ? { Prefer: prefer.join(', ') } : {}) },
    });
    if (res.status === 429 || res.status === 503) {
      const wait = Math.min(Number(res.headers.get('Retry-After') || 2), 10);
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new MsError(`Outlook: ${(data.error && data.error.message) || `HTTP ${res.status}`}`, res.status, (data.error && data.error.code) || '');
    return data;
  }
  throw new MsError('Outlook is throttling requests; the next scan will continue', 429, 'throttled');
}

export async function me(token: string) {
  const d = await graphGet(token, '/me?$select=displayName,mail,userPrincipalName');
  return { mailbox: String(d.mail || d.userPrincipalName || ''), displayName: String(d.displayName || '') };
}

// The mailbox's folders as "Inbox / Projects / Ubayya" paths (three levels, at most 400).
export async function listFolders(token: string) {
  const out: { id: string; path: string; total: number }[] = [];
  const sel = '$top=250&$select=id,displayName,childFolderCount,totalItemCount';
  async function walk(url: string, prefix: string, depth: number) {
    let next: string | null = url;
    while (next && out.length < 400) {
      const page = await graphGet(token, next);
      for (const f of page.value || []) {
        const path = prefix ? `${prefix} / ${f.displayName}` : f.displayName;
        out.push({ id: f.id, path, total: f.totalItemCount || 0 });
        if (f.childFolderCount > 0 && depth < 3) await walk(`/me/mailFolders/${encodeURIComponent(f.id)}/childFolders?${sel}`, path, depth + 1);
      }
      next = page['@odata.nextLink'] || null;
    }
  }
  await walk(`/me/mailFolders?${sel}`, '', 1);
  return out;
}

const MESSAGE_FIELDS = 'subject,from,receivedDateTime,bodyPreview,body,webLink,internetMessageId';
export const PAGE_PREFER = ['odata.maxpagesize=25', 'outlook.body-content-type="text"'];

export function initialDeltaUrl(folderId: string, sinceIso: string) {
  return `${GRAPH}/me/mailFolders/${encodeURIComponent(folderId)}/messages/delta?$select=${MESSAGE_FIELDS}&$filter=receivedDateTime+ge+${sinceIso}`;
}

export const fetchMessage = (token: string, id: string) =>
  graphGet(token, `/me/messages/${encodeURIComponent(id)}?$select=${MESSAGE_FIELDS}`, ['outlook.body-content-type="text"']);

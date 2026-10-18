// mail-scan: connect Outlook (OAuth + PKCE), list folders, and scan mapped folders for VO candidates.
//   GET  ?code=…&state=…            Microsoft redirects here after sign-in (the Azure redirect URI)
//   POST {action:"cron"}             pg_cron, with the x-cron-secret header — scans every active mailbox
//   POST {action:"status"|"connect"|"folders"|"scan"}   the signed-in user (Authorization: Bearer <user JWT>)
// Deployed with verify_jwt = false: every route checks its own caller.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.117.2';
import { msConfig, authorizeUrl, randomToken, pkceChallenge, redeemCode, refreshAccess, me, listFolders, graphGet, initialDeltaUrl, fetchMessage, PAGE_PREFER, MsError, type MsConfig } from './graph.ts';
import { analyseEmail, claudeConfigured, StopScan, MODEL } from './analyse.ts';
import { bodyText, splitThread, matchKeywords, buildUserPrompt, candidateRow, safeReturnTo, RETURN_ORIGINS, type Mail } from './rules.ts';

const secretKey = (() => {
  try { return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''; } catch (_) { return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''; }
})();
const db: SupabaseClient = createClient(Deno.env.get('SUPABASE_URL')!, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });

const RUN_BUDGET_MS = 110_000;   // stay well inside the Edge Function wall-clock limit
const PAGES_PER_FOLDER = 8;      // 8 × 25 messages per folder per run; the rest continues next run

function cors(req: Request) {
  const origin = req.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': RETURN_ORIGINS.includes(origin) ? origin : RETURN_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    Vary: 'Origin',
  };
}
const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(req), 'Content-Type': 'application/json' } });
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 1000);

async function must<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data;
}

async function callerId(req: Request): Promise<string | null> {
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!jwt) return null;
  const { data, error } = await db.auth.getUser(jwt);
  return error || !data.user ? null : data.user.id;
}

// ── OAuth ───────────────────────────────────────────────
async function startConnect(cfg: MsConfig, userId: string, returnTo: string) {
  const state = randomToken(32), verifier = randomToken(48);
  await must(db.from('mail_oauth_states').delete().eq('user_id', userId));
  await must(db.from('mail_oauth_states').insert({ state, user_id: userId, code_verifier: verifier, return_to: safeReturnTo(returnTo) }));
  return authorizeUrl(cfg, state, await pkceChallenge(verifier));
}

function backTo(url: string, params: Record<string, string>) {
  const u = new URL(url);
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  return Response.redirect(u.toString(), 302);
}

async function finishConnect(cfg: MsConfig, url: URL) {
  const state = url.searchParams.get('state') || '';
  const rows = state ? await must(db.from('mail_oauth_states').select('*').eq('state', state).gt('expires_at', new Date().toISOString())) : [];
  const st = rows && rows[0];
  if (st) await db.from('mail_oauth_states').delete().eq('state', state);
  const home = st ? st.return_to : safeReturnTo('');
  if (!st) return backTo(home, { outlook: 'error', reason: 'The sign-in link expired. Try Connect Outlook again.' });
  if (url.searchParams.get('error')) {
    return backTo(home, { outlook: 'error', reason: (url.searchParams.get('error_description') || url.searchParams.get('error') || '').split('\r\n')[0].slice(0, 300) });
  }
  try {
    const tok = await redeemCode(cfg, url.searchParams.get('code') || '', st.code_verifier);
    if (!tok.refresh_token) throw new Error('Microsoft did not return a refresh token (is offline_access granted?)');
    const who = await me(tok.access_token);
    const conn = await must(db.from('mail_connections').upsert({ user_id: st.user_id, mailbox: who.mailbox, display_name: who.displayName, status: 'active', last_error: '' }, { onConflict: 'user_id' }).select('id').single());
    await must(db.rpc('mail_token_save', { p_connection: conn.id, p_token: tok.refresh_token }));
    return backTo(home, { outlook: 'connected' });
  } catch (e) {
    return backTo(home, { outlook: 'error', reason: errText(e).slice(0, 300) });
  }
}

async function accessTokenFor(cfg: MsConfig, conn: { id: string }) {
  const rt = await must(db.rpc('mail_token_read', { p_connection: conn.id }));
  if (!rt) throw new MsError('No Outlook token stored — connect Outlook again', 401, 'no_token');
  const tok = await refreshAccess(cfg, rt as string);
  if (tok.refresh_token && tok.refresh_token !== rt) await must(db.rpc('mail_token_save', { p_connection: conn.id, p_token: tok.refresh_token }));
  return tok.access_token;
}

// ── scan ────────────────────────────────────────────────
type Conn = { id: string; user_id: string; mailbox: string; status: string };
type Totals = { folders: number; messages: number; keyword_hits: number; analysed: number; candidates: number };

async function scanConnection(cfg: MsConfig, conn: Conn, trigger: 'cron' | 'manual', deadline: number, onlyProject?: string) {
  const busy = await must(db.from('mail_scan_runs').select('id').eq('connection_id', conn.id).is('finished_at', null).gt('started_at', new Date(Date.now() - 3 * 60_000).toISOString()).limit(1));
  if (busy && busy.length) return { skipped: 'A scan of this mailbox is already running' };
  const run = await must(db.from('mail_scan_runs').insert({ connection_id: conn.id, trigger }).select('id').single());
  const t: Totals = { folders: 0, messages: 0, keyword_hits: 0, analysed: 0, candidates: 0 };
  let error = '';
  try {
    const settings = (await must(db.from('app_settings').select('scan_keywords, scan_lookback_days').limit(1)))[0] || {};
    const keywords: string[] = settings.scan_keywords || [];
    const since = new Date(Date.now() - (settings.scan_lookback_days || 14) * 86_400_000).toISOString().replace(/\.\d+Z$/, 'Z');
    let q = db.from('mail_folders').select('*').eq('connection_id', conn.id).eq('enabled', true);
    if (onlyProject) q = q.eq('project_id', onlyProject);
    const folders = await must(q);
    const token = await accessTokenFor(cfg, conn);
    for (const f of folders || []) {
      if (Date.now() > deadline) break;
      const project = (await must(db.from('projects').select('id, code, name, scope_summary, archived').eq('id', f.project_id)))[0];
      if (!project || project.archived) continue;
      const deliverables = await must(db.from('deliverables').select('id, title, phase, source').eq('project_id', f.project_id).order('sort_order'));
      t.folders++;
      let url: string = f.delta_link || initialDeltaUrl(f.folder_id, since);
      let seen = 0;
      try {
        for (let page = 0; page < PAGES_PER_FOLDER && Date.now() < deadline; page++) {
          const res = await graphGet(token, url, PAGE_PREFER);
          for (const raw of res.value || []) {
            if (raw['@removed']) continue;
            let m: Mail = raw;
            seen++; t.messages++;
            if (!m.body && !m.bodyPreview) m = await fetchMessage(token, m.id);
            const { latest, earlier } = splitThread(bodyText(m));
            const hits = matchKeywords(`${m.subject || ''}\n${latest}`, keywords);
            if (!hits.length) continue;
            t.keyword_hits++;
            const key = (m.internetMessageId || m.id).slice(0, 1000);
            const dup = await must(db.from('mail_candidates').select('id').eq('project_id', f.project_id).eq('dedupe_key', key).limit(1));
            if (dup && dup.length) continue;
            const { analysis, model } = await analyseEmail(buildUserPrompt(project, deliverables || [], m, latest, earlier, hits));
            t.analysed++;
            if (!analysis || !analysis.is_change) continue;
            const row = candidateRow({ projectId: f.project_id, folderRowId: f.id, connectionId: conn.id, m, analysis, deliverables: deliverables || [], keywords: hits, model: model || MODEL });
            const ins = await db.from('mail_candidates').upsert(row, { onConflict: 'project_id,dedupe_key', ignoreDuplicates: true }).select('id');
            if (ins.error) throw new Error(ins.error.message);
            t.candidates += (ins.data || []).length;
          }
          // The page is done: remember where to continue (deltaLink when caught up, nextLink otherwise).
          const delta = res['@odata.deltaLink'], next = res['@odata.nextLink'];
          url = delta || next || url;
          await must(db.from('mail_folders').update({ delta_link: url }).eq('id', f.id));
          if (delta || !next) break;
        }
      } catch (e) {
        if (e instanceof MsError && (e.status === 404 || e.code === 'ErrorItemNotFound')) {
          await must(db.from('mail_folders').update({ enabled: false }).eq('id', f.id));
          error = `Folder "${f.folder_name}" no longer exists in Outlook — it was switched off`;
          continue;
        }
        if (e instanceof MsError && e.status === 410) { // delta link expired: start this folder again
          await must(db.from('mail_folders').update({ delta_link: null }).eq('id', f.id));
          continue;
        }
        throw e;
      } finally {
        await db.from('mail_folders').update({ last_scan_at: new Date().toISOString(), messages_seen: (f.messages_seen || 0) + seen }).eq('id', f.id);
      }
    }
    await must(db.from('mail_connections').update({ last_scan_at: new Date().toISOString(), status: 'active', last_error: error }).eq('id', conn.id));
  } catch (e) {
    error = errText(e);
    const hard = e instanceof MsError && (e.code === 'invalid_grant' || e.code === 'no_token' || e.status === 401);
    await db.from('mail_connections').update({ last_scan_at: new Date().toISOString(), status: hard ? 'error' : conn.status, last_error: hard ? `${error} — reconnect Outlook` : error }).eq('id', conn.id);
    if (!(e instanceof StopScan) && !(e instanceof MsError)) console.error('mail-scan', conn.id, e);
  }
  await db.from('mail_scan_runs').update({ ...t, finished_at: new Date().toISOString(), error }).eq('id', run.id);
  return { ...t, error };
}

// ── routes ──────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  const cfg = msConfig();
  const url = new URL(req.url);

  if (req.method === 'GET') {
    if (!url.searchParams.has('state')) return json(req, { ok: true, service: 'mail-scan' });
    if (!cfg) return new Response('Outlook scan is not configured yet (MS_* secrets missing).', { status: 503 });
    return finishConnect(cfg, url);
  }
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405);

  const body = await req.json().catch(() => ({}));
  const action = String(body.action || '');
  const started = Date.now();

  if (action === 'cron') {
    const ok = await must(db.rpc('mail_cron_secret_ok', { p_secret: req.headers.get('x-cron-secret') || '' }));
    if (!ok) return json(req, { error: 'Forbidden' }, 403);
    if (!cfg || !claudeConfigured()) return json(req, { skipped: 'not configured' });
    const settings = (await must(db.from('app_settings').select('scan_enabled').limit(1)))[0];
    if (settings && settings.scan_enabled === false) return json(req, { skipped: 'scan switched off in Admin' });
    const conns: Conn[] = await must(db.from('mail_connections').select('id, user_id, mailbox, status').eq('status', 'active').order('last_scan_at', { ascending: true, nullsFirst: true }));
    const results = [];
    for (const c of conns || []) {
      if (Date.now() - started > RUN_BUDGET_MS - 15_000) break;
      results.push({ connection: c.id, ...(await scanConnection(cfg, c, 'cron', started + RUN_BUDGET_MS)) });
    }
    return json(req, { scanned: results.length, results });
  }

  const userId = await callerId(req);
  if (!userId) return json(req, { error: 'Sign in first' }, 401);
  const conn: Conn | undefined = (await must(db.from('mail_connections').select('id, user_id, mailbox, status').eq('user_id', userId)))[0];

  if (action === 'status') {
    return json(req, { microsoft: !!cfg, claude: claudeConfigured(), model: MODEL, connection: conn ? { id: conn.id, mailbox: conn.mailbox, status: conn.status } : null });
  }
  if (!cfg) return json(req, { error: 'The Outlook scan is not set up yet: an admin must add the MS_TENANT_ID, MS_CLIENT_ID and MS_CLIENT_SECRET secrets.' }, 503);

  if (action === 'connect') return json(req, { url: await startConnect(cfg, userId, String(body.return_to || '')) });
  if (!conn) return json(req, { error: 'Connect Outlook first' }, 409);

  try {
    if (action === 'folders') return json(req, { mailbox: conn.mailbox, folders: await listFolders(await accessTokenFor(cfg, conn)) });
    if (action === 'scan') {
      if (!claudeConfigured()) return json(req, { error: 'The Claude API key (ANTHROPIC_API_KEY) is not set yet.' }, 503);
      const project = typeof body.project_id === 'string' && /^[0-9a-f-]{36}$/i.test(body.project_id) ? body.project_id : undefined;
      return json(req, await scanConnection(cfg, conn, 'manual', started + RUN_BUDGET_MS, project));
    }
  } catch (e) {
    if (e instanceof MsError && (e.code === 'invalid_grant' || e.code === 'no_token')) {
      await db.from('mail_connections').update({ status: 'error', last_error: `${errText(e)} — reconnect Outlook` }).eq('id', conn.id);
    }
    return json(req, { error: errText(e) }, 502);
  }
  return json(req, { error: 'Unknown action' }, 400);
});

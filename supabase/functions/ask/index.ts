// ask: the in-app assistant. The browser sends a question (and optionally a project id); this function reads the
// workspace data AS THE SIGNED-IN USER (row-level security applies, so it can only see what they can see) and
// has Claude answer from it. Read-only: it has no tools and writes nothing.
// Deployed with verify_jwt = false: the function checks the caller itself.
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import Anthropic from 'npm:@anthropic-ai/sdk@0.135.0';
import { SYSTEM_PROMPT, portfolioContext, projectContext, cleanHistory } from './context.ts';

const MODEL = 'claude-opus-5-5';
const ORIGINS = ['https://yomnaesmailahmed-dotcom.github.io', 'http://localhost:5517', 'http://127.0.0.1:5517'];
const cors = (req: Request) => {
  const o = req.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': ORIGINS.includes(o) ? o : ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin',
  };
};
const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(req), 'Content-Type': 'application/json' } });

const UUID = /^[0-9a-f-]{36}$/i;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return json(req, { error: 'POST only' }, 405);
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!jwt) return json(req, { error: 'Sign in first.' }, 401);
  if (!Deno.env.get('ANTHROPIC_API_KEY')) return json(req, { error: 'The AI helper is not set up yet: the ANTHROPIC_API_KEY secret is missing.' }, 503);

  let body: { question?: string; project_id?: string; history?: unknown };
  try { body = await req.json(); } catch (_) { return json(req, { error: 'Bad request.' }, 400); }
  const question = String(body.question || '').trim().slice(0, 2000);
  if (!question) return json(req, { error: 'Type a question.' }, 400);

  // Reads run with the user's own JWT, so row-level security limits everything to their projects.
  const apikey = req.headers.get('apikey') || Deno.env.get('SUPABASE_ANON_KEY') || '';
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, apikey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: who, error: whoErr } = await sb.auth.getUser(jwt);
  if (whoErr || !who.user) return json(req, { error: 'Your session expired. Sign in again.' }, 401);

  const today = new Date().toISOString().slice(0, 10);
  try {
    const projectId = body.project_id && UUID.test(body.project_id) ? body.project_id : '';
    const [{ data: clients }, { data: projects }, { data: metrics }, { data: progress }] = await Promise.all([
      sb.from('clients').select('id, name'),
      sb.from('projects').select('*').eq('archived', false).limit(200),
      sb.from('project_metrics').select('*').limit(200),
      sb.from('project_progress').select('*').limit(200), // missing before the phase 6 migration: data is null
    ]);
    const clientName = Object.fromEntries((clients || []).map((c: { id: string; name: string }) => [c.id, c.name]));
    const mBy = Object.fromEntries((metrics || []).map((m: { project_id: string }) => [m.project_id, m]));
    const prBy = Object.fromEntries((progress || []).map((m: { project_id: string }) => [m.project_id, m]));

    // People by project (best effort: profiles may not be readable)
    const { data: members } = await sb.from('project_members').select('project_id, user_id, role').limit(2000);
    const ids = [...new Set((members || []).map((m: { user_id: string }) => m.user_id))];
    const { data: profs } = ids.length ? await sb.from('profiles').select('id, email, full_name').in('id', ids) : { data: [] };
    const nameOf = Object.fromEntries((profs || []).map((p: { id: string; email: string; full_name: string }) => [p.id, p.full_name || (p.email || '').split('@')[0]]));
    const peopleBy = (pid: string, role?: string) => (members || []).filter((m: { project_id: string; role: string }) => m.project_id === pid && (!role || m.role === role))
      .map((m: { user_id: string; role: string }) => `${nameOf[m.user_id] || '?'} (${m.role.toUpperCase()})`);

    let context: string;
    const focus = projectId ? (projects || []).find((p: { id: string }) => p.id === projectId) : null;
    if (focus) {
      const q = (t: string, extra?: (b: any) => any) => { const b = sb.from(t).select('*').eq('project_id', projectId).limit(300); return extra ? extra(b) : b; };
      const [d, ms, ac, qu, vo, inc, ts] = await Promise.all([
        q('deliverables', (b) => b.order('sort_order')), q('milestones', (b) => b.order('baseline_finish')),
        q('actions', (b) => b.not('status', 'in', '("Done","Cancelled")').order('due_on')),
        q('ptm_queries', (b) => b.order('number', { ascending: false })), q('variations', (b) => b.order('number', { ascending: false })),
        q('incidents', (b) => b.order('number', { ascending: false })), q('team_status', (b) => b.order('period_start', { ascending: false }).limit(15)),
      ]);
      context = projectContext({
        project: focus, metrics: mBy[projectId], progress: prBy[projectId], client: clientName[focus.client_id] || '',
        people: peopleBy(projectId), deliverables: d.data || [], milestones: ms.data || [], actions: ac.data || [], queries: qu.data || [],
        variations: vo.data || [], incidents: inc.data || [], statuses: ts.data || [],
      }, today);
      // the other projects stay available in short form for comparisons
      context += '\n\n' + portfolioContext((projects || []).filter((p: { id: string }) => p.id !== projectId).slice(0, 80).map((p: any) => ({ ...p, ...mBy[p.id], ...prBy[p.id], client: clientName[p.client_id], dm: peopleBy(p.id, 'dm').join(', '), ptm: peopleBy(p.id, 'ptm').join(', ') })), today).replace('Portfolio', 'Other projects');
    } else {
      context = portfolioContext((projects || []).map((p: any) => ({ ...p, ...mBy[p.id], ...prBy[p.id], client: clientName[p.client_id], dm: peopleBy(p.id, 'dm').join(', '), ptm: peopleBy(p.id, 'ptm').join(', ') })), today);
    }

    const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });
    const res = await client.messages.create({
      model: MODEL, max_tokens: 1500,
      system: `${SYSTEM_PROMPT}\n\n=== WORKSPACE DATA ===\n${context}`,
      messages: [...cleanHistory(body.history), { role: 'user', content: question }],
    });
    const answer = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
    return json(req, { answer: answer || 'I could not produce an answer. Try rephrasing.', scope: focus ? `${focus.code || ''} ${focus.name}`.trim() : 'all your projects' });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return json(req, { error: 'Claude rejected the API key (ANTHROPIC_API_KEY).' }, 502);
    if (err instanceof Anthropic.RateLimitError) return json(req, { error: 'The AI is busy right now. Try again in a minute.' }, 429);
    console.error('ask failed', err);
    return json(req, { error: 'The AI helper hit an error. Try again.' }, 500);
  }
});

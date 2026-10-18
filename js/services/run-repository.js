// PostgreSQL persistence through the Supabase Data API. Access is enforced by RLS, not here.

const RUN_COLUMNS = 'id, owner_id, title, status, last_update, report_date, step, max_step, summary_added, evidence_added, pcu, check_state, map_ok, extract_state, approved_at, approved_by, updated_origin, updated_by, updated_at';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function check({ data, error }) {
  if (error) throw error;
  return data;
}

export async function findRun(sb, runId) {
  if (!UUID_RE.test(runId || '')) return null;
  return check(await sb.from('refresh_runs').select(RUN_COLUMNS).eq('id', runId).maybeSingle());
}

// Latest non-archived run the user owns or was added to (admins can open any run by link).
export async function findLatestRun(sb, userId) {
  const memberships = check(await sb.from('run_members').select('run_id').eq('user_id', userId)) || [];
  const shared = memberships.map((m) => m.run_id).filter((id) => UUID_RE.test(id));
  let q = sb.from('refresh_runs').select(RUN_COLUMNS).neq('status', 'archived');
  q = shared.length ? q.or(`owner_id.eq.${userId},id.in.(${shared.join(',')})`) : q.eq('owner_id', userId);
  const rows = check(await q.order('updated_at', { ascending: false }).limit(1));
  return rows && rows[0] ? rows[0] : null;
}

export async function findMembership(sb, runId, userId) {
  return check(await sb.from('run_members').select('can_edit').eq('run_id', runId).eq('user_id', userId).maybeSingle());
}

export async function createRun(sb, origin) {
  return check(await sb.from('refresh_runs').insert({ updated_origin: origin }).select(RUN_COLUMNS).single());
}

export async function updateRun(sb, runId, columns, origin) {
  const rows = check(await sb.from('refresh_runs').update({ ...columns, updated_origin: origin }).eq('id', runId).select('id'));
  if (!rows || !rows.length) throw new Error('This run is view-only for you.');
}

export async function loadDecisions(sb, runId) {
  return check(await sb.from('run_decisions').select('kind, item_key, value').eq('run_id', runId)) || [];
}

export async function upsertDecisions(sb, runId, decisions, origin) {
  if (!decisions.length) return;
  const rows = decisions.map((d) => ({ run_id: runId, kind: d.kind, item_key: d.item_key, value: d.value, updated_origin: origin }));
  check(await sb.from('run_decisions').upsert(rows, { onConflict: 'run_id,kind,item_key' }));
}

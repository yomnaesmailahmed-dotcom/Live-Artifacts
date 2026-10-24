// Management review (Main.dc.html): one refresh_runs row + its run_decisions, live, over a scope of
// real projects. The project data is read once per open (and on "Reload data"), the review itself syncs live.
import { createLiveTable } from '../lib/live-table.js';
import { createPageStore } from './page-base.js';
import { joinPresence } from '../services/presence.js';
import * as repo from '../services/run-repository.js';
import { errMsg, ORIGIN } from '../lib/store.js';
import { todayIso, displayName } from '../ui/format.js';

const pageInitial = () => ({
  run: null, runId: '', decisions: [], data: null, dataLoading: false, dataErr: '', loaded: false,
  presence: [], previous: [], shareBusy: false, shareMsg: '', shareErr: '', exportBusy: false, exportErr: '', copied: false,
  approveConfirm: false, canEditRun: true,
});

const TABLES = ['projects', 'clients', 'project_members', 'project_metrics', 'deliverables', 'variations', 'incidents', 'milestones', 'actions', 'ptm_queries', 'team_status'];
const DATA_KEYS = { project_members: 'members', project_metrics: 'metrics', ptm_queries: 'queries', team_status: 'statuses' };
const minusDays = (iso, n) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) - n)).toISOString().slice(0, 10);

export function createReviewStore(session) {
  let sb = null, uid = null, T = {}, presence = null;

  const { store, trackStatus } = createPageStore({
    session, pageInitial,
    onReset() { Object.values(T).forEach((t) => t.close()); T = {}; if (presence) presence.leave(); presence = null; },
    async onReady(client, s) {
      sb = client; uid = s.user.id;
      const run = await openRun(s);
      const runId = run.id;
      T.run = createLiveTable({ sb, table: 'refresh_runs', filter: { column: 'id', value: runId }, codecs: { last_update: 'date', report_date: 'date' },
        onChange: (r) => store.set({ run: r[0] || store.get().run }), onStatus: trackStatus('run') });
      T.decisions = createLiveTable({ sb, table: 'run_decisions', filter: { column: 'run_id', value: runId }, keyCols: ['run_id', 'kind', 'item_key'],
        onChange: (r) => store.set({ decisions: r }), onStatus: trackStatus('decisions') });
      const runTable = T.run;
      await Promise.all([T.run.start(), T.decisions.start()]);
      const member = run.owner_id === uid ? null : await repo.findMembership(sb, runId, uid).catch(() => null);
      const mgmt = ['admin', 'management'].includes((s.profile || {}).role);
      store.set({ runId, canEditRun: run.status !== 'archived' && (mgmt || run.owner_id === uid || !!(member && member.can_edit)) });
      setRunParam(runId);
      await Promise.all([loadData(), loadPrevious()]);
      store.set({ loaded: true });
      const me = s.profile || { email: s.user.email };
      joinPresence(sb, `review:${runId}`, { user_id: uid, email: me.email, name: displayName(me), step: run.step, at: Date.now() },
        (people) => store.set({ presence: people })).then((p) => {
        // signed out or switched user while joining: leave straight away instead of leaking the channel
        if (T.run && store.get().user && store.get().user.id === s.user.id && T.run === runTable) presence = p; else p.leave();
      }).catch(() => {});
    },
  });

  function setRunParam(id) {
    try { const u = new URL(window.location.href); u.searchParams.set('run', id); window.history.replaceState(window.history.state, '', u); } catch (_) { /* ignore */ }
  }

  async function openRun(s) {
    const wanted = new URL(window.location.href).searchParams.get('run');
    let row = wanted ? await repo.findRun(sb, wanted).catch(() => null) : null;
    if (wanted && !row) store.set({ notice: 'That review isn’t available to your account — your latest review is open instead.' });
    if (!row) row = await repo.findLatestRun(sb, s.user.id);
    if (!row) row = await createRun();
    return row;
  }

  async function createRun(fromRun = null) {
    const today = todayIso();
    const { data: last } = await sb.from('refresh_runs').select('report_date').eq('status', 'approved').order('report_date', { ascending: false }).limit(1);
    const since = fromRun ? fromRun.report_date : ((last && last[0] && last[0].report_date) || minusDays(today, 30));
    const { data, error } = await sb.from('refresh_runs').insert({
      title: 'Management review', step: 1, max_step: 1, last_update: since < today ? since : minusDays(today, 1), report_date: today,
      scope_kind: fromRun ? fromRun.scope_kind : 'company', scope_client_id: fromRun ? fromRun.scope_client_id : null, scope_dm_id: fromRun ? fromRun.scope_dm_id : null,
      updated_origin: ORIGIN,
    }).select('*').single();
    if (error) throw error;
    return data;
  }

  async function loadData() {
    const run = store.get().run;
    if (!sb || !run) return;
    store.set({ dataLoading: true, dataErr: '' });
    try {
      const reads = TABLES.map((t) => sb.from(t).select('*'));
      reads.push(sb.from('audit_events').select('project_id, table_name, row_id, action, changes, actor, at')
        .gt('at', `${run.last_update}T00:00:00Z`).lte('at', `${run.report_date}T23:59:59Z`).order('at').limit(5000));
      const res = await Promise.all(reads);
      const bad = res.find((r) => r.error);
      if (bad) throw bad.error;
      const data = {};
      TABLES.forEach((t, i) => { data[DATA_KEYS[t] || t] = res[i].data || []; });
      data.audit = res[TABLES.length].data || [];
      const ids = [...new Set(data.members.map((m) => m.user_id))];
      const { data: people } = ids.length ? await sb.from('profiles').select('id, email, full_name').in('id', ids) : { data: [] };
      data.people = Object.fromEntries((people || []).map((p) => [p.id, p]));
      data.settings = store.get().settings || {};
      store.set({ data, dataLoading: false });
    } catch (e) {
      store.set({ dataLoading: false, dataErr: errMsg(e) });
    }
  }

  async function loadPrevious() {
    const { data } = await sb.from('refresh_runs').select('id, report_date, scope_kind, status, updated_at').neq('id', store.get().runId)
      .order('updated_at', { ascending: false }).limit(8);
    store.set({ previous: data || [] });
  }

  // ── run fields ──
  const value = (e) => (e && e.target ? e.target.value : e);
  function setRun(patch) {
    const r = store.get().run;
    if (!r || !store.get().canEditRun) return;
    T.run.update(r.id, patch);
  }
  function goStep(n) {
    const r = store.get().run;
    if (!r) return;
    store.set({ approveConfirm: false });
    if (store.get().canEditRun) setRun({ step: n, max_step: Math.max(r.max_step || 1, n) });
    else store.set({ run: { ...r, step: n } });
    if (presence) presence.update({ step: n });
    try { window.scrollTo({ top: 0 }); } catch (_) { /* ignore */ }
  }
  const setScopeKind = (e) => { const v = value(e); setRun({ scope_kind: v, scope_client_id: v === 'client' ? store.get().run.scope_client_id : null, scope_dm_id: v === 'dm' ? store.get().run.scope_dm_id : null }); };
  const setScopeClient = (e) => setRun({ scope_client_id: value(e) || null });
  const setScopeDm = (e) => setRun({ scope_dm_id: value(e) || null });
  function setPeriod(field) {
    return (e) => {
      const v = value(e);
      if (!v) return;
      const r = store.get().run;
      const patch = { [field]: v };
      if (field === 'last_update' && v >= r.report_date) return;
      if (field === 'report_date' && v <= r.last_update) return;
      setRun(patch);
      setTimeout(loadData, 400); // the audit window changed
    };
  }

  // ── decisions ──
  function decide(kind, key, val, typing = false) {
    if (!store.get().canEditRun) return;
    T.decisions.upsert({ run_id: store.get().runId, kind, item_key: key, value: val }, { typing });
  }
  const toggle = (kind, key) => () => { const cur = decisionValue(kind, key); decide(kind, key, !cur); };
  const decisionValue = (kind, key) => ((store.get().decisions.find((d) => d.kind === kind && d.item_key === key) || {}).value);

  // ── approval / next review ──
  const approve = () => store.set({ approveConfirm: true });
  const cancelApprove = () => store.set({ approveConfirm: false });
  function confirmApprove() { store.set({ approveConfirm: false }); setRun({ status: 'approved' }); }
  async function newReview() {
    try {
      const r = store.get().run;
      const row = await createRun(r);
      window.location.href = `./Main.dc.html?run=${row.id}`;
    } catch (e) { store.set({ exportErr: errMsg(e) }); }
  }

  // ── sharing (management can look people up by email) ──
  async function share(e) {
    if (e && e.preventDefault) e.preventDefault();
    const el = e && (e.currentTarget || e.target);
    const form = el && (el.tagName === 'FORM' ? el : el.form);
    const email = form ? String(form.elements.email.value || '').trim().toLowerCase() : '';
    const canEdit = form ? form.elements.can_edit.value === 'yes' : true;
    store.set({ shareBusy: true, shareErr: '', shareMsg: '' });
    try {
      const { data: p } = await sb.from('profiles').select('id, email').eq('email', email).maybeSingle();
      if (!p) throw new Error('No account with that email yet (they need to sign up first), or you can’t look people up.');
      const { error } = await sb.from('run_members').upsert({ run_id: store.get().runId, user_id: p.id, can_edit: canEdit }, { onConflict: 'run_id,user_id' });
      if (error) throw error;
      store.set({ shareBusy: false, shareMsg: `Shared with ${p.email}${canEdit ? ' (can edit)' : ' (view only)'}. Send them this page’s link.` });
      if (form) form.reset();
    } catch (err) { store.set({ shareBusy: false, shareErr: errMsg(err) }); }
  }

  // ── output ──
  async function exportExcel(sheets, fileName) {
    store.set({ exportBusy: true, exportErr: '' });
    try {
      const XLSX = await import('https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs');
      const wb = XLSX.utils.book_new();
      const add = (rows, name, widths) => { const ws = XLSX.utils.aoa_to_sheet(rows); ws['!cols'] = widths.map((w) => ({ wch: w })); XLSX.utils.book_append_sheet(wb, ws, name); };
      add(sheets.summary, 'Executive summary', [14, 8, 32, 11, 48, 16, 28, 28, 10, 12, 12, 10, 14, 9, 11, 11, 10]);
      add(sheets.changes, 'Changes this review', [11, 32, 16, 70]);
      add(sheets.open, 'Open items', [32, 10, 50, 18, 12, 30]);
      add(sheets.briefing, 'Briefing notes', [120]);
      XLSX.writeFile(wb, fileName);
      decide('next_action', 'dl', true);
      store.set({ exportBusy: false });
    } catch (e) { store.set({ exportBusy: false, exportErr: `Excel export failed: ${errMsg(e)}` }); }
  }
  function copyText(text) {
    try { navigator.clipboard.writeText(text).catch(() => {}); } catch (_) { /* clipboard blocked */ }
    decide('next_action', 'copy', true);
    store.set({ copied: true });
    setTimeout(() => store.set({ copied: false }), 2500);
  }

  session.setBeforeSignOut(async () => { await Promise.all(Object.values(T).map((t) => t.flushAll())); });

  return {
    store,
    actions: {
      ...session.actions,
      goStep, setScopeKind, setScopeClient, setScopeDm, setLastUpdate: setPeriod('last_update'), setReportDate: setPeriod('report_date'),
      reloadData: () => loadData(), decide, toggle, approve, cancelApprove, confirmApprove, newReview, share, exportExcel, copyText,
    },
  };
}

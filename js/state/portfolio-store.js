// Projects page: every project the user may see, with live metrics and the "new project" flow.
import { createLiveTable } from '../lib/live-table.js';
import { createPageStore } from './page-base.js';
import { errMsg, newId } from '../lib/store.js';

const pageInitial = () => ({
  projects: [], clients: [], members: [], people: {}, metrics: {}, myQueries: [], myActions: [],
  loaded: false,
  filter: { client: '', dm: '', status: '', q: '' },
  creating: false, createBusy: false, createErr: '',
});

export function createPortfolioStore(session) {
  let tables = [];
  let sb = null;
  let metricsTimer = null;
  let watch = null;

  const { store, trackStatus } = createPageStore({
    session, pageInitial,
    onReset() {
      tables.forEach((t) => t.close()); tables = [];
      if (watch && sb) sb.removeChannel(watch); watch = null;
      clearTimeout(metricsTimer);
    },
    async onReady(client, s) {
      sb = client;
      const projects = createLiveTable({ sb, table: 'projects', onChange: (rows) => store.set({ projects: rows }), onStatus: trackStatus('projects') });
      const clients = createLiveTable({ sb, table: 'clients', sort: (a, b) => a.name.localeCompare(b.name), onChange: (rows) => store.set({ clients: rows }), onStatus: trackStatus('clients') });
      const members = createLiveTable({ sb, table: 'project_members', onChange: (rows) => { store.set({ members: rows }); loadPeople(rows); }, onStatus: trackStatus('members') });
      // "Waiting on you": queries assigned to me, actions I own (any project I can see)
      const myQueries = createLiveTable({ sb, table: 'ptm_queries', filter: { column: 'assigned_to', value: s.user.id }, onChange: (rows) => store.set({ myQueries: rows }), onStatus: trackStatus('myQueries') });
      const myActions = createLiveTable({ sb, table: 'actions', filter: { column: 'owner_id', value: s.user.id }, onChange: (rows) => store.set({ myActions: rows }), onStatus: trackStatus('myActions') });
      tables = [projects, clients, members, myQueries, myActions];
      api.projects = projects; api.clients = clients;
      await Promise.all(tables.map((t) => t.start()));
      // deliverables/submissions are not loaded here; their changes only refresh the metrics
      watch = sb.channel(`portfolio-metrics:${newId().slice(0, 8)}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'deliverables' }, scheduleMetrics)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'submissions' }, scheduleMetrics)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, scheduleMetrics)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'components' }, scheduleMetrics)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'variations' }, scheduleMetrics)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'incidents' }, scheduleMetrics)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'hours_snapshots' }, scheduleMetrics)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'milestones' }, scheduleMetrics)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'actions' }, scheduleMetrics)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'ptm_queries' }, scheduleMetrics)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'team_status' }, scheduleMetrics)
        .subscribe();
      await loadMetrics();
      store.set({ loaded: true });
    },
  });

  const api = { projects: null, clients: null };

  async function loadMetrics() {
    if (!sb) return;
    const { data, error } = await sb.from('project_metrics').select('*');
    if (error) throw error;
    store.set({ metrics: Object.fromEntries((data || []).map((m) => [m.project_id, m])) });
  }
  function scheduleMetrics() {
    clearTimeout(metricsTimer);
    metricsTimer = setTimeout(() => loadMetrics().catch(() => {}), 700);
  }
  if (typeof window !== 'undefined') window.addEventListener('focus', scheduleMetrics);

  async function loadPeople(rows) {
    const ids = [...new Set(rows.map((r) => r.user_id))].filter((id) => !store.get().people[id]);
    if (!ids.length || !sb) return;
    const { data } = await sb.from('profiles').select('id, email, full_name').in('id', ids);
    if (data) store.set({ people: { ...store.get().people, ...Object.fromEntries(data.map((p) => [p.id, p])) } });
  }

  // ── actions ─────────────────────────────────────────────
  const setFilter = (key) => (e) => store.set({ filter: { ...store.get().filter, [key]: e.target.value } });

  function readCreateForm(e) {
    const el = e && (e.currentTarget || e.target);
    const form = el && (el.tagName === 'FORM' ? el : el.form);
    const v = (n) => (form && form.elements[n] ? String(form.elements[n].value || '').trim() : '');
    return {
      clientId: v('client_id'), newClient: v('new_client'), code: v('code'), name: v('name'), location: v('location'),
      budget: v('budget_hours'), start: v('start_date'), finish: v('baseline_finish'), dm: v('dm_email').toLowerCase(), ptm: v('ptm_email').toLowerCase(),
    };
  }

  async function createProject(e) {
    if (e && e.preventDefault) e.preventDefault();
    const f = readCreateForm(e);
    if (!f.name) { store.set({ createErr: 'Give the project a name.' }); return; }
    if (!f.clientId && !f.newClient) { store.set({ createErr: 'Choose a client or type a new client name.' }); return; }
    const emailOk = (x) => !x || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x);
    if (!emailOk(f.dm) || !emailOk(f.ptm)) { store.set({ createErr: 'Check the DM / PTM email addresses.' }); return; }
    store.set({ createBusy: true, createErr: '' });
    try {
      let clientId = f.clientId;
      if (!clientId) {
        const existing = store.get().clients.find((c) => c.name.toLowerCase() === f.newClient.toLowerCase());
        clientId = existing ? existing.id : await api.clients.insert({ name: f.newClient });
      }
      const id = await api.projects.insert({
        client_id: clientId, code: f.code, name: f.name, location: f.location,
        budget_hours: f.budget === '' ? 0 : Number(f.budget), start_date: f.start || null, baseline_finish: f.finish || null,
      });
      const invites = [[f.dm, 'dm'], [f.ptm, 'ptm']].filter(([email]) => email).map(([email, role]) => ({ project_id: id, email, role }));
      if (invites.length) {
        const { error } = await sb.from('project_invites').insert(invites);
        if (error) throw error;
      }
      store.set({ createBusy: false, creating: false });
      window.location.href = `./Project.dc.html?id=${id}`;
    } catch (err) {
      store.set({ createBusy: false, createErr: errMsg(err) });
    }
  }

  return {
    store,
    actions: {
      ...session.actions,
      setFilter,
      clearFilters: () => store.set({ filter: { client: '', dm: '', status: '', q: '' } }),
      openCreate: () => store.set({ creating: true, createErr: '' }),
      closeCreate: () => store.set({ creating: false, createErr: '' }),
      createProject,
    },
  };
}

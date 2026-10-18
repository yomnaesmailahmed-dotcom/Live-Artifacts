// Admin page: company settings, users + global roles, clients.
import { createLiveTable } from '../lib/live-table.js';
import { createPageStore } from './page-base.js';
import { errMsg } from '../lib/store.js';

const pageInitial = () => ({
  loaded: false, settingsRow: null, profiles: [], clients: [], keywordsDraft: null,
  clientBusy: false, clientErr: '', confirmDelete: '',
});

export function createAdminStore(session) {
  let T = {};
  let sb = null;

  const { store, trackStatus } = createPageStore({
    session, pageInitial,
    onReset() { Object.values(T).forEach((t) => t.close()); T = {}; },
    async onReady(client, s) {
      sb = client;
      if (!s.profile || s.profile.role !== 'admin') { store.set({ loaded: true }); return; }
      T.settings = createLiveTable({ sb, table: 'app_settings', hasOrigin: false, codecs: { at_risk_pct: 'number' }, onChange: (r) => store.set({ settingsRow: r[0] || null }), onStatus: trackStatus('settings') });
      T.profiles = createLiveTable({ sb, table: 'profiles', hasOrigin: false, sort: (a, b) => a.email.localeCompare(b.email), onChange: (r) => store.set({ profiles: r }), onStatus: trackStatus('profiles') });
      T.clients = createLiveTable({ sb, table: 'clients', sort: (a, b) => a.name.localeCompare(b.name), onChange: (r) => store.set({ clients: r }), onStatus: trackStatus('clients') });
      await Promise.all([T.settings.start(), T.profiles.start({ live: false }), T.clients.start()]);
      store.set({ loaded: true });
    },
  });

  const value = (e) => (e && e.target ? e.target.value : e);

  const editSetting = (field) => (e) => {
    const row = store.get().settingsRow;
    if (row) T.settings.update(row.id, { [field]: value(e) }, { typing: true });
  };
  function saveKeywords() {
    const S = store.get();
    if (!S.settingsRow || S.keywordsDraft === null) return;
    const list = [...new Set(S.keywordsDraft.split(/[\n,]+/).map((k) => k.trim().toLowerCase()).filter(Boolean))];
    T.settings.update(S.settingsRow.id, { scan_keywords: list });
    store.set({ keywordsDraft: null });
  }

  const editProfile = (id, field) => (e) => T.profiles.update(id, { [field]: value(e) }, { typing: field === 'full_name' });

  async function addClient(e) {
    if (e && e.preventDefault) e.preventDefault();
    const el = e && (e.currentTarget || e.target);
    const form = el && (el.tagName === 'FORM' ? el : el.form);
    const name = form ? String(form.elements.name.value || '').trim() : '';
    const code = form ? String(form.elements.code.value || '').trim() : '';
    if (!name) { store.set({ clientErr: 'Enter the client’s name.' }); return; }
    store.set({ clientBusy: true, clientErr: '' });
    try {
      await T.clients.insert({ name, code });
      store.set({ clientBusy: false });
      if (form) form.reset();
    } catch (err) {
      store.set({ clientBusy: false, clientErr: /unique|duplicate/i.test(errMsg(err)) ? 'A client with that name already exists.' : errMsg(err) });
    }
  }
  const editClient = (id, field) => (e) => T.clients.update(id, { [field]: value(e) }, { typing: true });
  async function removeClient(id) {
    store.set({ confirmDelete: '' });
    const prev = store.get().clients.length;
    await T.clients.remove(id);
    if (store.get().clients.length === prev) store.set({ clientErr: 'This client still has projects — move or delete them first.' });
  }

  return {
    store,
    actions: {
      ...session.actions,
      editSetting, setKeywordsDraft: (e) => store.set({ keywordsDraft: value(e) }), saveKeywords,
      editProfile, addClient, editClient,
      askDelete: (k) => store.set({ confirmDelete: store.get().confirmDelete === k ? '' : k }),
      removeClient,
    },
  };
}

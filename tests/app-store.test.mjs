// Node test of the sync store against a fake Supabase client: node tests/app-store.test.mjs
import { createAppStore } from '../js/state/app-store.js';

globalThis.window = {
  location: { href: 'http://localhost:5517/Main.dc.html' },
  history: { state: null, replaceState(_s, _t, url) { window.location.href = String(url); } },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const assert = (c, msg) => { console.log(c ? 'ok  ' : 'FAIL', msg); if (!c) failed++; };

const USER = { id: '11111111-1111-4111-8111-111111111111', email: 'admin@example.test' };
const RUN = {
  id: '22222222-2222-4222-8222-222222222222', owner_id: USER.id, status: 'active', step: 2, max_step: 3,
  last_update: '2026-09-20', report_date: '2026-09-26', summary_added: true, evidence_added: false, pcu: 'none',
  check_state: 'idle', map_ok: false, extract_state: 'idle', updated_by: USER.id, updated_origin: 'seed',
};

function fakeClient() {
  const calls = [];
  const handlers = [];
  let statusCb = null;
  const result = (table, op, payload) => {
    if (table === 'profiles') return { data: { id: USER.id, email: USER.email, full_name: '', role: 'admin' }, error: null };
    if (table === 'run_members') return { data: [], error: null };
    if (table === 'refresh_runs' && op === 'select') return { data: [RUN], error: null };
    if (table === 'refresh_runs' && op === 'update') return { data: [{ id: RUN.id }], error: null };
    if (table === 'run_decisions' && op === 'select') return { data: [{ kind: 'pick', item_key: 'c1', value: 'B' }], error: null };
    return { data: null, error: null, payload };
  };
  const builder = (table) => {
    let op = 'select', payload = null;
    const b = {
      select() { return b; }, eq() { return b; }, neq() { return b; }, or() { return b; }, order() { return b; }, limit() { return b; },
      insert(p) { op = 'insert'; payload = p; return b; },
      update(p) { op = 'update'; payload = p; return b; },
      upsert(p, o) { op = 'upsert'; payload = p; calls.push({ table, op, payload, opts: o }); return Promise.resolve({ data: null, error: null }); },
      maybeSingle() { const r = result(table, op, payload); return Promise.resolve({ ...r, data: Array.isArray(r.data) ? r.data[0] : r.data }); },
      single() { return b.maybeSingle(); },
      then(res, rej) { if (op !== 'select') calls.push({ table, op, payload }); return Promise.resolve(result(table, op, payload)).then(res, rej); },
    };
    return b;
  };
  return {
    calls, handlers,
    emit(table, row) { handlers.filter((h) => h.table === table).forEach((h) => h.cb({ new: row })); },
    connect() { statusCb && statusCb('SUBSCRIBED'); },
    auth: {
      onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; },
      getSession: async () => ({ data: { session: { user: USER } } }),
      signOut: async () => ({ error: null }),
    },
    from: builder,
    channel() {
      const ch = { on(_t, f, cb) { handlers.push({ table: f.table, cb }); return ch; }, subscribe(cb) { statusCb = cb; return ch; } };
      return ch;
    },
    removeChannel() {},
  };
}

const sb = fakeClient();
const store = createAppStore({ getClient: async () => sb });
await store.start();
await sleep(20);
let S = store.getState();
assert(S.auth === 'ready' && S.runId === RUN.id, 'signs in and opens the latest run');
assert(S.step === 2 && S.files.summary === true && S.picks.c1 === 'B', 'hydrates run row + decisions');
assert(S.profile.role === 'admin' && S.canEdit === true, 'admin profile, editable');
assert(window.location.href.includes(`run=${RUN.id}`), 'run id written to the URL for sharing');

sb.connect();
assert(store.getState().live === true, 'realtime SUBSCRIBED → live');

// click-type decision → upsert within ~60ms
store.actions.set({ reviewed: { P01: true } });
assert(store.getState().sync === 'saving', 'shows saving');
await sleep(120);
const up = sb.calls.find((c) => c.op === 'upsert');
assert(up && up.payload[0].kind === 'reviewed' && up.payload[0].item_key === 'P01' && up.payload[0].value === true && up.opts.onConflict === 'run_id,kind,item_key', 'review tick upserted');
const origin = up && up.payload[0].updated_origin;
assert(store.getState().sync === 'saved', 'back to saved');

// typing is debounced into one write
sb.calls.length = 0;
store.actions.set({ answers: { '0-0': 'B' } });
store.actions.set({ answers: { '0-0': 'Bu' } });
store.actions.set({ answers: { '0-0': 'Bui' } });
await sleep(300);
assert(!sb.calls.some((c) => c.op === 'upsert'), 'no write while typing');
await sleep(500);
const typed = sb.calls.filter((c) => c.op === 'upsert');
assert(typed.length === 1 && typed[0].payload[0].value === 'Bui', 'one debounced write with final text');

// run fields
sb.calls.length = 0;
store.actions.set({ step: 3, maxStep: 3, checkState: 'running' });
await sleep(350);
const upd = sb.calls.find((c) => c.table === 'refresh_runs' && c.op === 'update');
assert(upd && upd.payload.step === 3 && !('check_state' in upd.payload) && upd.payload.updated_origin === origin, 'run update batched, transient state skipped');

// local-only UI keys never hit the database
sb.calls.length = 0;
store.actions.set({ filter: 'm', pcuConfirm: true });
await sleep(350);
assert(sb.calls.length === 0, 'filter / dialogs stay local');

// realtime: own echo ignored, others applied
sb.emit('run_decisions', { run_id: RUN.id, kind: 'pick', item_key: 'c2', value: 'A', updated_origin: origin });
assert(store.getState().picks.c2 === undefined, 'own echo ignored');
sb.emit('run_decisions', { run_id: RUN.id, kind: 'pick', item_key: 'c2', value: 'A', updated_origin: 'other-tab' });
assert(store.getState().picks.c2 === 'A', 'remote decision applied');

// remote run change from a collaborator: fields apply, step does not
sb.emit('refresh_runs', { ...RUN, step: 7, max_step: 7, map_ok: true, updated_by: 'someone-else', updated_origin: 'other' });
S = store.getState();
assert(S.mapOk === true && S.maxStep === 7 && S.step === 3, 'collaborator change merged, own step kept');
sb.emit('refresh_runs', { ...RUN, step: 6, max_step: 7, map_ok: true, updated_by: USER.id, updated_origin: 'my-other-device' });
assert(store.getState().step === 6, 'my other device moves my step');

// pending local edit wins over a racing remote value
store.actions.set({ answers: { ...store.getState().answers, '0-1': 'mine' } });
sb.emit('run_decisions', { run_id: RUN.id, kind: 'answer', item_key: '0-1', value: 'theirs', updated_origin: 'other' });
assert(store.getState().answers['0-1'] === 'mine', 'pending local edit not clobbered');
await sleep(700);

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);

// node tests/session.test.mjs — sign-in session: a failed profile request must not demote an admin; local-day helpers.
import { createSession } from '../js/state/session-store.js';
import { todayIso } from '../js/ui/format.js';
import { currentMonth } from '../js/domain/registers.js';
import { nextRevision } from '../js/domain/deliverables.js';

let failed = 0;
const assert = (c, msg) => { console.log(c ? 'ok  ' : 'FAIL', msg); if (!c) failed++; };

// Fake Supabase: the profile request fails `failures` times, then returns an admin.
function fakeClient(failures) {
  let calls = 0;
  const query = (table) => ({
    select: () => ({
      eq: () => ({ maybeSingle: async () => {
        calls++;
        return calls <= failures ? { data: null, error: new Error('network') } : { data: { id: 'u1', email: 'a@x.com', role: 'admin' }, error: null };
      } }),
      maybeSingle: async () => ({ data: { company_name: 'X' }, error: null }),
    }),
  });
  let listener = null;
  return {
    from: query,
    auth: {
      onAuthStateChange: (fn) => { listener = fn; return { data: { subscription: { unsubscribe() {} } } }; },
      getSession: async () => ({ data: { session: { user: { id: 'u1', email: 'a@x.com' } } } }),
    },
    calls: () => calls, fire: (s) => listener && listener('SIGNED_IN', s),
  };
}
const settle = (session) => new Promise((resolve) => {
  const off = session.subscribe((s) => { if (s.auth === 'ready') { setTimeout(off, 0); resolve(s); } });
});

for (const failures of [0, 2]) {
  const sb = fakeClient(failures);
  const session = createSession({ getClient: async () => sb });
  const ready = settle(session);
  await session.start();
  const s = await ready;
  assert(s.profile && s.profile.role === 'admin', `admin kept after ${failures} failed profile request(s)`);
}

const sb = fakeClient(99);
const session = createSession({ getClient: async () => sb });
const ready = settle(session);
await session.start();
const s = await ready;
assert(s.profile === null && !!s.authErr && sb.calls() === 3, 'gives up after 3 tries and reports the error');

const d = new Date();
const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
assert(todayIso() === local && currentMonth() === local.slice(0, 7), 'today / month use the local calendar day');
assert(nextRevision([]) === 'Rev 00' && nextRevision([{ revision: 'Rev 03' }]) === 'Rev 04' && nextRevision([{ revision: 'A' }, { revision: 'B' }]) === 'Rev 02', 'revision numbering');

process.exit(failed ? 1 : 0);

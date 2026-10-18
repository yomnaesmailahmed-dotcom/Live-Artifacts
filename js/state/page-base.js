// Glue between the shared session and a page's own data.
// Mirrors the session fields into the page store, (re)loads page data when the signed-in user changes,
// and folds every live table's save status into one header indicator.

import { createStore, errMsg } from '../lib/store.js';

const SESSION_KEYS = ['auth', 'user', 'profile', 'settings', 'authMode', 'authBusy', 'authErr', 'authMsg'];

export function createPageStore({ session, pageInitial, onReady, onReset }) {
  const pick = (s) => Object.fromEntries(SESSION_KEYS.map((k) => [k, s[k]]));
  const store = createStore({ ...pick(session.get()), ...pageInitial(), sync: 'saved', live: false, syncMsg: '', notice: '' });
  const statuses = new Map();
  let uid = null;

  function trackStatus(name) {
    return ({ saving, error }) => {
      statuses.set(name, { saving, error });
      const all = [...statuses.values()];
      const err = all.find((x) => x.error);
      const sync = all.some((x) => x.saving) ? 'saving' : (err ? 'error' : 'saved');
      store.set({ sync, syncMsg: err ? err.error : '' });
    };
  }

  session.subscribe((s) => {
    store.set(pick(s));
    const id = s.auth === 'ready' && s.user ? s.user.id : null;
    if (id === uid) return;
    uid = id;
    statuses.clear();
    onReset();
    store.set({ ...pageInitial(), sync: 'saved', live: false, syncMsg: '', notice: '' });
    if (id) {
      Promise.resolve(onReady(session.client(), s)).then(
        () => store.set({ live: true }),
        (e) => store.set({ sync: 'error', syncMsg: errMsg(e) }),
      );
    }
  });

  return { store, trackStatus };
}

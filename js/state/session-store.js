// Shared sign-in session for the workspace pages: auth state, profile (global role) and company settings.
// Auth calls reuse js/services/auth.js; form values are read from the DOM, never kept in state.

import { getSupabase } from '../lib/supabase-client.js';
import * as auth from '../services/auth.js';
import { createStore, errMsg } from '../lib/store.js';

export function initialSessionFields() {
  return {
    auth: 'connecting', user: null, profile: null, settings: null,
    authMode: 'signin', authBusy: false, authErr: '', authMsg: '',
  };
}

export function createSession({ getClient = getSupabase } = {}) {
  const store = createStore(initialSessionFields());
  let sb = null;
  let uid = null;
  let seq = 0;
  let beforeSignOut = async () => {};

  async function onSession(session) {
    const next = (session && session.user && session.user.id) || null;
    if (next === uid && store.get().auth !== 'connecting') return;
    uid = next;
    const mine = ++seq;
    if (!uid) {
      store.set({ ...initialSessionFields(), auth: 'signedOut', authMode: store.get().authMode });
      return;
    }
    store.set({ auth: 'loading', user: { id: uid, email: session.user.email }, authBusy: false, authErr: '', authMsg: '' });
    try {
      const [profile, settings] = await Promise.all([
        auth.fetchProfile(sb, uid),
        sb.from('app_settings').select('company_name, at_risk_pct, scan_keywords').maybeSingle().then(({ data, error }) => { if (error) throw error; return data; }),
      ]);
      if (mine !== seq) return;
      store.set({ auth: 'ready', profile, settings });
    } catch (e) {
      if (mine !== seq) return;
      store.set({ auth: 'ready', profile: null, settings: null, authErr: errMsg(e) });
    }
  }

  function readForm(e) {
    const el = e && (e.currentTarget || e.target);
    const form = el && (el.tagName === 'FORM' ? el : el.form);
    const field = (name) => (form && form.elements[name] ? String(form.elements[name].value || '') : '');
    return { email: field('email').trim(), password: field('password') };
  }

  async function submitAuth(e) {
    if (e && e.preventDefault) e.preventDefault();
    const { email, password } = readForm(e);
    if (!sb) { store.set({ authErr: 'Can’t reach Supabase right now. Check your connection and reload.' }); return; }
    if (!email || !password) { store.set({ authErr: 'Enter your email and password.', authMsg: '' }); return; }
    const signup = store.get().authMode === 'signup';
    store.set({ authBusy: true, authErr: '', authMsg: '' });
    try {
      const { data, error } = signup ? await auth.signUp(sb, email, password) : await auth.signInWithPassword(sb, email, password);
      if (error) { store.set({ authBusy: false, authErr: auth.friendlyAuthError(error) }); return; }
      if (signup && !data.session) { store.set({ authBusy: false, authMode: 'signin', authMsg: `Check ${email} for a confirmation link, then sign in.` }); return; }
      store.set({ authBusy: false });
    } catch (err) {
      store.set({ authBusy: false, authErr: auth.friendlyAuthError(err) });
    }
  }

  async function sendMagicLink(e) {
    const { email } = readForm(e);
    if (!sb) { store.set({ authErr: 'Can’t reach Supabase right now. Check your connection and reload.' }); return; }
    if (!email) { store.set({ authErr: 'Enter your email first.', authMsg: '' }); return; }
    store.set({ authBusy: true, authErr: '', authMsg: '' });
    try {
      const { error } = await auth.sendMagicLink(sb, email);
      store.set(error ? { authBusy: false, authErr: auth.friendlyAuthError(error) }
        : { authBusy: false, authMsg: `Sign-in link sent to ${email}. Open it to continue.` });
    } catch (err) {
      store.set({ authBusy: false, authErr: auth.friendlyAuthError(err) });
    }
  }

  const toggleAuthMode = () => store.set({ authMode: store.get().authMode === 'signup' ? 'signin' : 'signup', authErr: '', authMsg: '' });

  async function signOut() {
    if (!sb) return;
    try { await beforeSignOut(); } catch (_) { /* best effort */ }
    await auth.signOut(sb);
  }

  async function start() {
    try {
      sb = await getClient();
    } catch (e) {
      store.set({ auth: 'offline', authErr: 'Supabase could not be loaded — check your connection and reload.' });
      return;
    }
    try {
      await auth.watchSession(sb, (s) => { onSession(s).catch((e) => store.set({ authErr: errMsg(e) })); });
    } catch (e) {
      store.set({ auth: 'signedOut', authErr: `Couldn’t check your session: ${errMsg(e)}` });
    }
  }

  return {
    ...store,
    start,
    client: () => sb,
    setBeforeSignOut: (fn) => { beforeSignOut = fn; },
    actions: { submitAuth, sendMagicLink, toggleAuthMode, signOut },
  };
}

// Convenience role checks used by the page view models.
export const globalRole = (S) => (S.profile && S.profile.role) || 'member';
export const isAdmin = (S) => globalRole(S) === 'admin';
export const isManagement = (S) => ['admin', 'management'].includes(globalRole(S));

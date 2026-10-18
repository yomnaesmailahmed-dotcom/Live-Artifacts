// Single source of truth for the page. The DC component mirrors this store's snapshot;
// user actions go through `actions.set`, which updates the UI at once and queues the
// matching writes to Supabase. Realtime changes from other tabs/devices/collaborators
// are merged back in, except for fields this tab is still saving.

import { getSupabase } from '../lib/supabase-client.js';
import * as auth from '../services/auth.js';
import * as repo from '../services/run-repository.js';
import { subscribeToRun } from '../services/realtime.js';
import { initialRunState, initialUiState, initialSessionState } from './initial-state.js';
import {
  RUN_FIELD_COLUMNS, runRowToState, runPatchToColumns, decisionRowsToState, decisionRowToPatch,
  decisionId, diffDecisions, isDebouncedKind,
} from './persistence-map.js';

// Identifies writes from this tab so their realtime echoes are ignored.
const ORIGIN = (globalThis.crypto && crypto.randomUUID) ? crypto.randomUUID() : `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const RUN_FLUSH_MS = 250;
const CLICK_FLUSH_MS = 60;
const TYPING_FLUSH_MS = 600;
const RETRY_MS = 4000;
const MAX_RETRIES = 3;

const errMsg = (e) => (e && e.message) || String(e || 'Unknown error');

export function createAppStore({ getClient = getSupabase } = {}) {
  let state = { ...initialRunState(), ...initialUiState(), ...initialSessionState() };
  const listeners = new Set();

  let sb = null;
  let uid = null;
  let run = null;
  let membership = null;
  let stopRealtime = null;
  let subscribedOnce = false;
  let sessionSeq = 0;
  let timers = [];

  let runQueue = {}, runInflight = {}, runTimer = null;
  const decisionQueue = new Map(), decisionInflight = new Map();
  let decisionTimer = null, decisionDue = 0;
  let retries = 0, lastWriteFailed = false;

  // ── store basics ────────────────────────────────────────────
  function emit() { listeners.forEach((fn) => fn(state)); }
  function patch(p) { state = { ...state, ...p }; emit(); }
  function subscribe(fn) { listeners.add(fn); fn(state); return () => listeners.delete(fn); }

  const persisting = () => !!(sb && run && state.auth === 'ready' && state.canEdit);

  function set(p) {
    const prev = state;
    patch(p);
    if (!persisting()) return;
    const cols = runPatchToColumns(p);
    if (Object.keys(cols).length) queueRun(cols);
    diffDecisions(prev, state, p).forEach(queueDecision);
  }

  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }

  // ── write path ──────────────────────────────────────────────
  const hasPending = () => Object.keys(runQueue).length || Object.keys(runInflight).length || decisionQueue.size || decisionInflight.size;

  function markSaving() { if (state.sync !== 'saving') patch({ sync: 'saving', syncMsg: '' }); }

  function settle() {
    if (hasPending() || lastWriteFailed) return;
    if (state.sync === 'saving' || state.sync === 'error') patch({ sync: 'saved', syncMsg: '' });
  }

  function writeFailed(e, runId, requeue, flush) {
    if (!run || run.id !== runId) return;
    lastWriteFailed = true;
    patch({ sync: 'error', syncMsg: errMsg(e) });
    if (retries < MAX_RETRIES) {
      retries += 1;
      requeue();
      setTimeout(flush, RETRY_MS);
    }
  }

  function writeSucceeded() { retries = 0; lastWriteFailed = false; }

  function queueRun(cols) {
    Object.assign(runQueue, cols);
    markSaving();
    clearTimeout(runTimer);
    runTimer = setTimeout(flushRun, RUN_FLUSH_MS);
  }

  async function flushRun() {
    runTimer = null;
    if (!run || !Object.keys(runQueue).length) return;
    if (Object.keys(runInflight).length) { runTimer = setTimeout(flushRun, RUN_FLUSH_MS); return; }
    const cols = runQueue, runId = run.id;
    runQueue = {};
    runInflight = cols;
    try {
      await repo.updateRun(sb, runId, cols, ORIGIN);
      writeSucceeded();
    } catch (e) {
      writeFailed(e, runId, () => { runQueue = { ...cols, ...runQueue }; }, flushRun);
    } finally {
      runInflight = {};
      settle();
    }
  }

  function queueDecision(d) {
    decisionQueue.set(decisionId(d.kind, d.item_key), d);
    markSaving();
    const typing = isDebouncedKind(d.kind);
    const delay = typing ? TYPING_FLUSH_MS : CLICK_FLUSH_MS;
    const due = Date.now() + delay;
    if (decisionTimer && !typing && decisionDue <= due) return;
    clearTimeout(decisionTimer);
    decisionDue = due;
    decisionTimer = setTimeout(flushDecisions, delay);
  }

  async function flushDecisions() {
    decisionTimer = null;
    if (!run || !decisionQueue.size) return;
    if (decisionInflight.size) { decisionDue = Date.now() + RUN_FLUSH_MS; decisionTimer = setTimeout(flushDecisions, RUN_FLUSH_MS); return; }
    const rows = [...decisionQueue.values()], runId = run.id;
    decisionQueue.clear();
    rows.forEach((r) => decisionInflight.set(decisionId(r.kind, r.item_key), r));
    try {
      await repo.upsertDecisions(sb, runId, rows, ORIGIN);
      writeSucceeded();
    } catch (e) {
      writeFailed(e, runId, () => rows.forEach((r) => {
        const id = decisionId(r.kind, r.item_key);
        if (!decisionQueue.has(id)) decisionQueue.set(id, r);
      }), flushDecisions);
    } finally {
      decisionInflight.clear();
      settle();
    }
  }

  async function flushNow() {
    clearTimeout(runTimer); clearTimeout(decisionTimer);
    runTimer = decisionTimer = null;
    await Promise.all([flushRun(), flushDecisions()]);
  }

  // ── realtime merge ──────────────────────────────────────────
  const runColumnPending = (col) => col in runQueue || col in runInflight;
  const decisionPending = (row) => {
    const id = decisionId(row.kind, row.item_key);
    return decisionQueue.has(id) || decisionInflight.has(id);
  };

  function computeCanEdit(row, profile) {
    if (!row || row.status === 'archived') return false;
    return (profile && profile.role === 'admin') || row.owner_id === uid || !!(membership && membership.can_edit);
  }

  function onRemoteRun(row) {
    if (!row || !run || row.id !== run.id) return;
    run = { ...run, ...row };
    if (row.updated_origin === ORIGIN) return;
    const next = runRowToState(row), p = {};
    Object.keys(next).forEach((key) => {
      if (!RUN_FIELD_COLUMNS[key].some(runColumnPending)) p[key] = next[key];
    });
    if (row.updated_by !== uid) delete p.step; // collaborators keep their own place in the flow
    if (state.checkState === 'running' && p.checkState === 'idle') delete p.checkState;
    if (state.extractState === 'running' && p.extractState === 'idle') delete p.extractState;
    const canEdit = computeCanEdit(run, state.profile);
    p.canEdit = canEdit;
    if (!canEdit) p.sync = 'readonly';
    patch(p);
  }

  function applyDecisionRows(rows) {
    let draft = state;
    rows.forEach((row) => {
      if (row.updated_origin === ORIGIN || decisionPending(row)) return;
      draft = { ...draft, ...decisionRowToPatch(draft, row) };
    });
    if (draft !== state) { state = draft; emit(); }
  }

  function onRemoteDecision(row) {
    if (!row || !run || row.run_id !== run.id) return;
    applyDecisionRows([row]);
  }

  async function resync() {
    if (!run) return;
    const runId = run.id;
    const [row, rows] = await Promise.all([repo.findRun(sb, runId), repo.loadDecisions(sb, runId)]);
    if (!run || run.id !== runId) return;
    if (row) onRemoteRun({ ...row, updated_origin: null });
    applyDecisionRows(rows.map((r) => ({ ...r, run_id: runId, updated_origin: null })));
  }

  function onChannelStatus(status) {
    if (status === 'SUBSCRIBED') {
      const reconnect = subscribedOnce;
      subscribedOnce = true;
      patch({ live: true });
      if (reconnect) resync().catch(() => {});
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      patch({ live: false });
    }
  }

  // ── run lifecycle ───────────────────────────────────────────
  function setRunParam(id) {
    try {
      const url = new URL(window.location.href);
      if (id) url.searchParams.set('run', id); else url.searchParams.delete('run');
      if (url.toString() !== window.location.href) window.history.replaceState(window.history.state, '', url);
    } catch (_) { /* non-browser */ }
  }

  function closeRun() {
    if (stopRealtime) { stopRealtime(); stopRealtime = null; }
    clearTimeout(runTimer); clearTimeout(decisionTimer);
    runTimer = decisionTimer = null;
    runQueue = {};
    decisionQueue.clear();
    run = null;
    membership = null;
    subscribedOnce = false;
    clearTimers();
  }

  async function openRun(seq, profile, givenRow) {
    let notice = '';
    let row = givenRow || null;
    if (!row) {
      const wanted = new URL(window.location.href).searchParams.get('run');
      if (wanted) {
        row = await repo.findRun(sb, wanted).catch(() => null);
        if (!row) notice = 'That shared run isn’t available to your account — your latest run is open instead.';
      }
      if (!row) row = await repo.findLatestRun(sb, uid);
      if (!row) row = await repo.createRun(sb, ORIGIN);
    }
    const member = row.owner_id === uid ? null : await repo.findMembership(sb, row.id, uid);
    const rows = await repo.loadDecisions(sb, row.id);
    if (seq !== sessionSeq) return;

    run = row;
    membership = member;
    const canEdit = computeCanEdit(row, profile);
    clearTimers();
    patch({
      ...initialRunState(), ...initialUiState(), ...runRowToState(row), ...decisionRowsToState(rows),
      auth: 'ready', profile, runId: row.id, canEdit, live: false,
      sync: canEdit ? 'saved' : 'readonly', syncMsg: '', notice,
    });
    setRunParam(row.id);
    stopRealtime = subscribeToRun(sb, row.id, { onRun: onRemoteRun, onDecision: onRemoteDecision, onStatus: onChannelStatus });
  }

  async function onSession(session) {
    const nextUid = (session && session.user && session.user.id) || null;
    if (nextUid === uid && state.auth !== 'connecting') return; // token refresh etc.
    uid = nextUid;
    const seq = ++sessionSeq;
    closeRun();

    if (!uid) {
      patch({ ...initialRunState(), ...initialUiState(), auth: 'signedOut', user: null, profile: null, runId: null,
        canEdit: true, live: false, sync: 'local', syncMsg: '', notice: '', authBusy: false });
      setRunParam(null);
      return;
    }

    patch({ auth: 'loading', user: { id: uid, email: session.user.email }, authBusy: false, authErr: '', authMsg: '' });
    let profile = null;
    try {
      profile = await auth.fetchProfile(sb, uid);
      if (seq !== sessionSeq) return;
      await openRun(seq, profile);
    } catch (e) {
      if (seq !== sessionSeq) return;
      // Keep the app usable locally; nothing is saved until the problem is fixed.
      patch({ auth: 'ready', profile, canEdit: false, sync: 'error', syncMsg: `Couldn’t load your refresh: ${errMsg(e)}` });
    }
  }

  async function restart() {
    clearTimers();
    if (!sb || !run || state.auth !== 'ready') { patch({ ...initialRunState(), ...initialUiState() }); return; }
    const seq = sessionSeq;
    markSaving();
    try {
      await flushNow();
      if (run.status === 'active' && state.canEdit) await repo.updateRun(sb, run.id, { status: 'archived' }, ORIGIN);
      const row = await repo.createRun(sb, ORIGIN);
      if (seq !== sessionSeq) return;
      closeRun();
      await openRun(seq, state.profile, row);
    } catch (e) {
      patch({ sync: 'error', syncMsg: `Couldn’t start a new refresh: ${errMsg(e)}` });
    }
  }

  // ── auth actions (form values are read from the DOM, never kept in state) ──
  function readForm(e) {
    const el = e && (e.currentTarget || e.target);
    const form = el && (el.tagName === 'FORM' ? el : el.form);
    const field = (name) => (form && form.elements[name] ? String(form.elements[name].value || '') : '');
    return { email: field('email').trim(), password: field('password') };
  }

  async function submitAuth(e) {
    if (e && e.preventDefault) e.preventDefault();
    const { email, password } = readForm(e);
    if (!sb) { patch({ authErr: 'Can’t reach Supabase right now. Check your connection and reload.' }); return; }
    if (!email || !password) { patch({ authErr: 'Enter your email and password.', authMsg: '' }); return; }
    const signup = state.authMode === 'signup';
    patch({ authBusy: true, authErr: '', authMsg: '' });
    try {
      const { data, error } = signup ? await auth.signUp(sb, email, password) : await auth.signInWithPassword(sb, email, password);
      if (error) { patch({ authBusy: false, authErr: auth.friendlyAuthError(error) }); return; }
      if (signup && !data.session) {
        patch({ authBusy: false, authMode: 'signin', authMsg: `Check ${email} for a confirmation link, then sign in.` });
        return;
      }
      patch({ authBusy: false });
    } catch (err) {
      patch({ authBusy: false, authErr: auth.friendlyAuthError(err) });
    }
  }

  async function sendMagicLink(e) {
    const { email } = readForm(e);
    if (!sb) { patch({ authErr: 'Can’t reach Supabase right now. Check your connection and reload.' }); return; }
    if (!email) { patch({ authErr: 'Enter your email first.', authMsg: '' }); return; }
    patch({ authBusy: true, authErr: '', authMsg: '' });
    try {
      const { error } = await auth.sendMagicLink(sb, email);
      patch(error ? { authBusy: false, authErr: auth.friendlyAuthError(error) }
        : { authBusy: false, authMsg: `Sign-in link sent to ${email}. Open it to continue.` });
    } catch (err) {
      patch({ authBusy: false, authErr: auth.friendlyAuthError(err) });
    }
  }

  function toggleAuthMode() {
    patch({ authMode: state.authMode === 'signup' ? 'signin' : 'signup', authErr: '', authMsg: '' });
  }

  async function signOut() {
    if (!sb) return;
    try { if (persisting()) await flushNow(); } catch (_) { /* best effort */ }
    await auth.signOut(sb);
  }

  // ── boot ────────────────────────────────────────────────────
  async function start() {
    try {
      sb = await getClient();
    } catch (e) {
      patch({ auth: 'offline', sync: 'offline', syncMsg: 'Supabase could not be loaded — working locally; nothing is saved.' });
      return;
    }
    try {
      await auth.watchSession(sb, (session) => { onSession(session).catch((e) => patch({ sync: 'error', syncMsg: errMsg(e) })); });
    } catch (e) {
      patch({ auth: 'signedOut', authErr: `Couldn’t check your session: ${errMsg(e)}` });
    }
  }

  return {
    getState: () => state,
    subscribe,
    start,
    actions: { set, later, clearTimers, restart, submitAuth, sendMagicLink, toggleAuthMode, signOut },
  };
}

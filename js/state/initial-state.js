// Persisted run state (mirrors public.refresh_runs + public.run_decisions).
export function initialRunState() {
  return {
    step: 1, maxStep: 1,
    lastUpdate: '2026-09-20', reportDate: '2026-09-26',
    checkState: 'idle', files: { summary: false, evidence: false }, pcu: 'none',
    mapOk: false, extractState: 'idle',
    reviewed: {}, answers: {}, picks: {}, approved: {}, resp: {}, done: {}, scope: {}, wording: {},
    ok: false, nextDone: {},
  };
}

// Per-viewer UI state — never saved.
export function initialUiState() {
  return { checkErr: '', pcuConfirm: false, approveConfirm: false, filter: 'all' };
}

// Session state.
//   auth: connecting | signedOut | loading | ready | offline
//   sync: local | saving | saved | error | readonly | offline
export function initialSessionState() {
  return {
    auth: 'connecting', user: null, profile: null, runId: null, canEdit: true, live: false,
    sync: 'local', syncMsg: '', notice: '',
    authMode: 'signin', authBusy: false, authErr: '', authMsg: '',
  };
}

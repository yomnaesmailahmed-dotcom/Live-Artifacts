// Sign-in gate and the header's account / sync indicator.
import { SYNC_DOT } from '../ui/tokens.js';

function syncIndicator(S) {
  if (S.auth === 'offline') return { label: 'OFFLINE · NOT SAVED', dot: SYNC_DOT.idle };
  if (S.auth !== 'ready') return { label: 'CONNECTING…', dot: SYNC_DOT.idle };
  switch (S.sync) {
    case 'saving': return { label: 'SAVING…', dot: SYNC_DOT.saving };
    case 'error': return { label: 'NOT SAVED', dot: SYNC_DOT.error };
    case 'readonly': return { label: 'VIEW ONLY · NOT SAVED', dot: SYNC_DOT.idle };
    default: return S.live ? { label: 'SAVED · LIVE', dot: SYNC_DOT.live } : { label: 'SAVED', dot: SYNC_DOT.idle };
  }
}

export function buildAccount(S, act) {
  const signup = S.authMode === 'signup';
  const gate = S.auth === 'connecting' || S.auth === 'signedOut' || S.auth === 'loading';
  const form = S.auth === 'signedOut';
  const sync = syncIndicator(S);
  const email = (S.profile && S.profile.email) || (S.user && S.user.email) || '';
  const role = (S.profile && S.profile.role) || 'member';
  const isAdmin = role === 'admin' || role === 'management';
  const notice = S.syncMsg || S.notice;

  return {
    authGate: gate,
    authLoading: !form,
    authForm: form,
    authTitle: form ? (signup ? 'Create your account' : 'Sign in to continue') : (S.auth === 'loading' ? 'Opening your refresh…' : 'Connecting…'),
    authLede: form
      ? (signup ? 'Use your work email and a password of at least 8 characters. You may need to confirm the email from your inbox.' : 'Your decisions are saved to your account and stay in sync across your devices and anyone you share a run with.')
      : 'One moment.',
    authSubmitLabel: S.authBusy ? 'Working…' : (signup ? 'Create account' : 'Sign in'),
    authToggleLabel: signup ? 'Already have an account? Sign in' : 'New here? Create an account',
    authPwAuto: signup ? 'new-password' : 'current-password',
    authBusy: S.authBusy,
    authHasErr: !!S.authErr, authErr: S.authErr,
    authHasMsg: !!S.authMsg, authMsg: S.authMsg,
    authSubmit: (e) => act.submitAuth(e),
    sendMagicLink: (e) => act.sendMagicLink(e),
    toggleAuthMode: () => act.toggleAuthMode(),

    signedIn: S.auth === 'ready' && !!S.user,
    acctEmail: email,
    acctRole: role.toUpperCase(),
    acctRoleClass: isAdmin ? 'chip-you' : 'chip',
    syncLabel: sync.label, syncDot: sync.dot,
    hasNotice: !!notice, noticeMsg: notice,
    signOut: () => act.signOut(),
  };
}

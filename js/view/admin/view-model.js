// Admin page bindings.
import { buildShell } from '../shell.js';
import { isAdmin } from '../../state/session-store.js';
import { GLOBAL_ROLES } from '../../domain/roles.js';
import { fmtLocalTime } from '../../ui/format.js';

const when = (iso) => fmtLocalTime(iso) || '—';
const yes = (ok) => (ok ? '✓ set' : '✗ missing');

export function buildViewModel(S, act) {
  const shell = buildShell(S, act, 'admin');
  const admin = isAdmin(S);
  const st = S.settingsRow || {};
  const me = S.user && S.user.id;
  const roleCount = (r) => S.profiles.filter((p) => p.role === r).length;
  return {
    ...shell,
    loading: !S.loaded && S.auth === 'ready',
    denied: S.loaded && !admin, allowed: S.loaded && admin,
    companyName2: st.company_name || '', atRisk: st.at_risk_pct == null ? '' : String(st.at_risk_pct),
    setCompany: act.editSetting('company_name'), setAtRisk: act.editSetting('at_risk_pct'),
    keywords: S.keywordsDraft !== null ? S.keywordsDraft : (st.scan_keywords || []).join(', '),
    setKeywords: act.setKeywordsDraft, saveKeywords: act.saveKeywords, keywordsDirty: S.keywordsDraft !== null, keywordsClean: S.keywordsDraft === null,
    usersLine: `${S.profiles.length} people · ${roleCount('admin')} admin · ${roleCount('management')} management · ${roleCount('member')} members`,
    roleOptions: GLOBAL_ROLES.map(([value, label]) => ({ value, label })),
    users: S.profiles.map((p) => ({
      email: p.email, name: p.full_name || '', role: p.role, isMe: p.id === me, meLabel: p.id === me ? 'YOU' : '',
      setName: act.editProfile(p.id, 'full_name'), setRole: act.editProfile(p.id, 'role'),
    })),
    clients: S.clients.map((c) => ({
      name: c.name, code: c.code,
      setName: act.editClient(c.id, 'name'), setCode: act.editClient(c.id, 'code'),
      confirming: S.confirmDelete === c.id, notConfirming: S.confirmDelete !== c.id,
      askDelete: () => act.askDelete(c.id), confirmDelete: () => act.removeClient(c.id),
    })),
    noClients: S.clients.length === 0,

    // Outlook scan
    ...mailBlock(S, act),
    addClient: act.addClient, clientBusy: S.clientBusy, clientErr: S.clientErr, hasClientErr: !!S.clientErr,
  };
}

function mailBlock(S, act) {
  const st = S.settingsRow || {};
  const ms = S.mailStatus;
  const people = Object.fromEntries(S.profiles.map((p) => [p.id, p.full_name || p.email]));
  const conns = S.mailConns.map((c) => ({
    mailbox: c.mailbox || '(unknown)', person: people[c.user_id] || '', status: c.status, statusStyle: c.status === 'active' ? '' : 'color: #A00000;',
    folders: String(S.mailFolderCount[c.id] || 0), lastScan: when(c.last_scan_at), lastError: c.last_error || '',
    confirming: S.confirmDelete === `mc:${c.id}`, notConfirming: S.confirmDelete !== `mc:${c.id}`,
    askDelete: () => act.askDelete(`mc:${c.id}`), confirmDelete: () => act.disconnectMail(c.id),
  }));
  const mailboxOf = Object.fromEntries(S.mailConns.map((c) => [c.id, c.mailbox]));
  return {
    scanOn: st.scan_enabled !== false, scanToggleLabel: st.scan_enabled === false ? 'Switch the scan on' : 'Pause the scan for everyone',
    scanStateLine: st.scan_enabled === false ? 'Paused — no mailbox is scanned until you switch it back on.' : 'On — every connected mailbox is scanned every 30 minutes.',
    toggleScan: act.toggleScan, lookback: st.scan_lookback_days == null ? '14' : String(st.scan_lookback_days), setLookback: act.editSetting('scan_lookback_days'),
    msSecrets: ms && !ms.unavailable ? yes(ms.microsoft) : '…', claudeSecret: ms && !ms.unavailable ? yes(ms.claude) : '…',
    mailModel: (ms && ms.model) || 'claude-opus-5-5',
    mailUnavailable: !!(ms && ms.unavailable), mailUnavailableMsg: ms && ms.unavailable ? ms.error : '',
    mailConns: conns, hasMailConns: conns.length > 0, noMailConns: S.loaded && conns.length === 0,
    mailRuns: S.mailRuns.map((r) => ({
      at: when(r.started_at), mailbox: mailboxOf[r.connection_id] || '—', trigger: r.trigger === 'manual' ? 'Scan now' : 'Scheduled',
      counts: `${r.folders} folders · ${r.messages} emails · ${r.keyword_hits} keyword hits · ${r.analysed} read by Claude · ${r.candidates} candidates`,
      error: r.error || '', running: !r.finished_at ? 'RUNNING' : '',
    })),
    hasMailRuns: S.mailRuns.length > 0, refreshMail: act.refreshMail,
  };
}

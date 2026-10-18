// Admin page bindings.
import { buildShell } from '../shell.js';
import { isAdmin } from '../../state/session-store.js';
import { GLOBAL_ROLES } from '../../domain/roles.js';

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
    addClient: act.addClient, clientBusy: S.clientBusy, clientErr: S.clientErr, hasClientErr: !!S.clientErr,
  };
}

// Project page → Variations tab: the Outlook scan panel (connection + folders) and the candidate inbox.
import { candidateView } from '../../domain/mail.js';
import { regNo } from '../../domain/registers.js';
import { fmtLocalTime } from '../../ui/format.js';

const CONF_CHIP = {
  high: 'background: #F2F5FF; border-color: #2F5BFF; color: #1E3FBF;',
  medium: 'border-style: dashed; color: #1E3FBF; border-color: #2F5BFF;',
  low: 'border-style: dashed; color: #5B6068; border-color: #8A8F96;',
};
const when = fmtLocalTime;

export function buildMail(S, act, perm) {
  const st = S.mailStatus;
  const conn = st && st.connection;
  const ready = !!(st && st.microsoft && st.claude);
  const delTitle = Object.fromEntries(S.deliverables.map((d) => [d.id, d.title || '(untitled)']));
  const voNo = Object.fromEntries(S.variations.map((v) => [v.id, regNo('VO', v.number)]));

  const fresh = S.candidates.filter((c) => c.status === 'new');
  const decided = S.candidates.filter((c) => c.status !== 'new');
  const card = (c) => {
    const v = candidateView(c);
    return {
      summary: c.summary || c.subject || '(no summary)', from: v.from, subject: c.subject, received: when(c.received_at),
      quote: c.quote, hasQuote: !!c.quote, reason: c.reason, hasReason: !!c.reason,
      confidence: v.confidenceLabel, confStyle: CONF_CHIP[c.confidence] || CONF_CHIP.medium,
      impact: v.impact, hasImpact: !!v.impact, keywords: v.keywords, hasKeywords: !!v.keywords,
      deliverable: c.deliverable_id ? delTitle[c.deliverable_id] || '' : '', hasDeliverable: !!c.deliverable_id,
      link: /^https:\/\//i.test(c.web_link || '') ? c.web_link : '', hasLink: /^https:\/\//i.test(c.web_link || ''),
      isNew: c.status === 'new', isDismissed: c.status === 'dismissed',
      outcome: c.status === 'accepted' ? `ACCEPTED → ${voNo[c.variation_id] || 'VO'}` : c.status === 'dismissed' ? 'DISMISSED' : '',
      accept: () => act.acceptCandidate(c.id), dismiss: () => act.dismissCandidate(c.id), restore: () => act.restoreCandidate(c.id),
    };
  };

  const mine = conn ? S.mailFolders.filter((f) => f.connection_id === conn.id) : [];
  const folders = S.mailFolders.map((f) => {
    const own = !!conn && f.connection_id === conn.id;
    return {
      name: f.folder_name || '(folder)', enabled: f.enabled, owner: own ? 'Your mailbox' : 'A colleague’s mailbox',
      state: f.enabled ? (f.last_scan_at ? `Last scanned ${when(f.last_scan_at)} · ${f.messages_seen || 0} emails read` : 'Waiting for the first scan') : 'Switched off',
      canToggle: own, toggleLabel: f.enabled ? 'Pause' : 'Resume', toggle: () => act.toggleFolder(f.id),
      canRemove: own || perm.canManage, remove: () => act.removeFolder(f.id),
    };
  });
  const taken = new Set(S.mailFolders.map((f) => f.folder_id));
  const pickList = (S.folderList || []).filter((f) => !taken.has(f.id));

  let setupLine = '';
  if (!st) setupLine = 'Checking the Outlook scan…';
  else if (st.unavailable) setupLine = `The Outlook scan isn’t available yet: ${st.error}`;
  else if (!st.microsoft) setupLine = 'The Outlook scan isn’t set up yet — an admin needs to add the Microsoft app secrets.';
  else if (!st.claude) setupLine = 'Outlook can be connected, but the Claude API key isn’t set yet, so nothing is analysed.';

  const msg = S.mailMsg;
  return {
    mailSetupLine: setupLine, hasMailSetupLine: !!setupLine,
    mailCanConnect: !!(st && st.microsoft) && !conn && perm.canEdit,
    mailConnected: !!conn, mailMailbox: conn ? conn.mailbox : '', mailConnStatus: conn && conn.status !== 'active' ? `(${conn.status})` : '',
    mailReconnect: !!conn && conn.status === 'error',
    mailCanMap: !!conn && perm.canEdit && !S.folderList, mailCanScan: !!conn && ready && mine.length > 0,
    connectOutlook: act.connectOutlook, openFolderPicker: act.openFolderPicker, scanNow: act.scanNow,
    connectLabel: S.mailBusy === 'connect' ? 'Opening Microsoft sign-in…' : 'Connect my Outlook',
    pickLabel: S.mailBusy === 'folders' ? 'Loading folders…' : 'Add a folder to scan…',
    scanLabel: S.mailBusy === 'scan' ? 'Scanning…' : 'Scan now', mailBusy: !!S.mailBusy,
    folderPickerOpen: !!S.folderList, folderOptions: [{ value: '', label: pickList.length ? 'Choose a folder' : 'No more folders to add' }, ...pickList.map((f) => ({ value: f.id, label: `${f.path} (${f.total})` }))],
    folderPick: S.folderPick, setFolderPick: act.setFolderPick, mapFolder: act.mapFolder, closeFolderPicker: act.closeFolderPicker,
    mapDisabled: !S.folderPick || S.mailBusy === 'map',
    mailFolders: folders, hasMailFolders: folders.length > 0,
    mailErr: S.mailErr, hasMailErr: !!S.mailErr,
    mailMsg: msg ? msg.msg : '', hasMailMsg: !!msg, mailMsgStyle: msg && !msg.ok ? 'border-color: #C00000; background: #FDECEC;' : '',
    clearMailMsg: act.clearMailMsg,
    candidates: fresh.map(card), hasCandidates: fresh.length > 0,
    candidateLine: fresh.length ? `${fresh.length} email${fresh.length === 1 ? '' : 's'} may change the scope — accept to raise a draft VO, or dismiss.` : '',
    decidedCandidates: decided.map(card), hasDecided: decided.length > 0, showDecided: S.showDecided && decided.length > 0,
    decidedLabel: `${S.showDecided ? 'Hide' : 'Show'} ${decided.length} decided`, toggleDecided: act.toggleDecided,
    candidateCount: fresh.length,
  };
}

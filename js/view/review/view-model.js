// Management review bindings (Main.dc.html) — the 8-step flow over the real project data.
import { buildShell } from '../shell.js';
import { isManagement } from '../../state/session-store.js';
import { indexData, scopeProjects, dataChecks, changesSince, dmQuestions, conflicts, briefing, checklist, workbookSheets, dmOf, SCOPES } from '../../domain/review.js';
import { fmtDate, fmtHours, displayName, initials } from '../../ui/format.js';
import { STATUS_CHIP, TOGGLE_ON, TOGGLE_OFF, OPTION_SELECTED, OPTION_IDLE, CHIP_DONE, CHIP_OPEN, DOT, NUM_CURRENT, NUM_PAST, NUM_FUTURE } from '../../ui/tokens.js';

const STEPS = [
  ['Scope & period', 'You', 'you'], ['Data check', 'System + you', 'both'], ['Changes', 'System', 'claude'], ['Project cards', 'Your review', 'you'],
  ['DM questions', 'You', 'you'], ['Conflicts', 'Your decision', 'you'], ['Status & delays', 'Your decision', 'you'], ['Output', 'Your approval', 'you'],
];
const INFO = [
  { title: 'Scope & period', badge: 'YOU', badgeClass: 'chip-you', lede: 'Choose what this review covers — the whole company, one client or one DM — and the period since the last review.', provide: 'Scope and the review period.', ai: 'Finds every project in scope you can see.', produces: 'The project list for this review.', decide: 'What the review covers.' },
  { title: 'Data check', badge: 'SYSTEM + YOU', badgeClass: 'chip', lede: 'Before anything is summarised, check each project’s data is current. Gaps don’t block you — they stay visible as open items.', provide: 'Nothing new — fix gaps in the project if you can.', ai: 'Checks DM, budget, PCU hours, team status, dates, milestones and overdue queries.', produces: 'A warning list per project.', decide: 'Which gaps you accept for this review.' },
  { title: 'Changes since the last review', badge: 'SYSTEM', badgeClass: 'chip-ai', lede: 'Everything that changed in the registers during the period, from the audit trail — submissions, status moves, VOs, incidents, forecasts and hours.', provide: 'Nothing new.', ai: 'Reads the audit trail for the period and writes each change as a sentence.', produces: 'A dated change list per project (sheet 2 of the Excel).', decide: 'Mark each project’s changes as read.' },
  { title: 'Project cards', badge: 'YOUR REVIEW', badgeClass: 'chip-you', lede: 'One card per project: status and why, delivery, schedule, hours and open items — all calculated from the registers.', provide: 'Nothing new.', ai: 'Builds each card from the project metrics.', produces: 'One card per project.', decide: 'Review every card.' },
  { title: 'Questions for the DMs', badge: 'YOU', badgeClass: 'chip-you', lede: 'Questions drafted from the gaps only — slipping milestones, late deliverables, unsent VOs, unclear responsibility, stale hours. Note each DM’s answer here.', provide: 'The DMs’ answers.', ai: 'Drafts questions from the gaps, grouped by DM.', produces: 'A question list per DM.', decide: 'What each DM confirms.' },
  { title: 'Conflicts', badge: 'YOUR DECISION', badgeClass: 'chip-you', lede: 'Where two sources disagree, both are shown. Pick the one the review should report.', provide: 'Your choice for each conflict.', ai: 'Compares team status with the data, milestone dates with the project finish, and named responsibility with its basis.', produces: 'A conflict list — the system never picks.', decide: 'Which value is right.' },
  { title: 'Status & delays', badge: 'YOUR DECISION', badgeClass: 'chip-you', lede: 'Approve each project’s status (or override it), set delay responsibility, and edit the commentary that goes to management.', provide: 'Responsibility and commentary.', ai: 'Proposes a status with its reason.', produces: 'Approved statuses and commentary.', decide: 'Final status, responsibility and wording.' },
  { title: 'Review & output', badge: 'YOUR APPROVAL', badgeClass: 'chip-you', lede: 'Check the summary and briefing notes, download the Excel, then approve. Nothing is sent from here.', provide: 'Your approval.', ai: 'Builds the summary, the briefing notes and a 4-sheet Excel.', produces: 'Executive summary Excel and briefing notes.', decide: 'Approve, then brief management yourself.' },
];
const STATUSES = ['On Track', 'At Risk', 'Delayed', 'On Hold', 'Completed', 'Not Started'];
const RESP = ['', 'Client', 'Our company', 'Shared', 'To Be Confirmed'];

export function buildViewModel(S, act) {
  const shell = buildShell(S, act, 'review');
  const run = S.run || {};
  const step = run.step || 1;
  const ro = !S.canEditRun || run.status === 'archived';
  const approvedRun = run.status === 'approved';
  const since = run.last_update || '', until = run.report_date || '';
  const D = S.data ? indexData({ ...S.data, settings: S.settings || {} }) : null;
  const cur = (S.settings && S.settings.currency) || 'SAR';

  // decisions → maps
  const dec = { reviewed: {}, answer: {}, pick: {}, status_approved: {}, responsibility: {}, wording: {}, next_action: {} };
  S.decisions.forEach((d) => { if (dec[d.kind]) dec[d.kind][d.item_key] = d.value; });
  const override = {}, wording = {};
  Object.keys(dec.wording).forEach((k) => { if (k.startsWith('override:')) { if (dec.wording[k]) override[k.slice(9)] = dec.wording[k]; } else if (k !== 'briefing') wording[k] = dec.wording[k]; });
  const decisions = { override, wording, resp: dec.responsibility };

  const scope = { kind: run.scope_kind || 'company', clientId: run.scope_client_id, dmId: run.scope_dm_id };
  const projects = D ? scopeProjects(D, scope) : [];
  const M = (p) => (D && D.metricsBy[p.id]) || {};
  const people = (D && D.people) || {};
  const nameOf = (id) => displayName(people[id]) || '…';
  const statusOf = (p) => override[p.id] || M(p).status || 'Not Started';

  // per-step content
  const checks = D ? projects.map((p) => ({ p, list: dataChecks(D, p, until) })) : [];
  const warnings = checks.filter((c) => c.list.length && !dec.reviewed[`chk:${c.p.id}`]).reduce((n, c) => n + c.list.length, 0);
  const changes = D ? projects.map((p) => ({ p, list: changesSince(D, p.id, since, until) })) : [];
  const questions = D ? projects.flatMap((p) => dmQuestions(D, p, until).map((q) => ({ ...q, p, dm: dmOf(D, p.id) }))) : [];
  const conflictList = D ? projects.flatMap((p) => conflicts(D, p, until).map((c) => ({ ...c, p }))) : [];
  const answered = questions.filter((q) => String(dec.answer[q.key] || '').trim()).length;
  const resolved = conflictList.filter((c) => dec.pick[c.key]).length;
  const reviewedCards = projects.filter((p) => dec.reviewed[`card:${p.id}`]).length;
  const approvedStatuses = projects.filter((p) => dec.status_approved[p.id]).length;
  const delayed = projects.filter((p) => ['Delayed', 'At Risk'].includes(statusOf(p)));
  const respSet = delayed.filter((p) => dec.responsibility[p.id]).length;
  const ck = checklist({ projects: projects.length, reviewedCards, questionsTotal: questions.length, answered, conflictsTotal: conflictList.length, resolved, approvedStatuses, delayedCount: delayed.length, respSet, warnings });
  const ckDone = ck.filter((c) => c.good).length;
  const openItems = ck.filter((c) => !c.good).map((c) => c.t);
  const briefingLines = D ? briefing(D, projects, decisions, until, cur) : [];
  const briefingText = typeof dec.wording.briefing === 'string' ? dec.wording.briefing : briefingLines.map((l) => `• ${l}`).join('\n');

  // steps nav
  const steps = STEPS.map(([label, who, dot], i) => {
    const n = i + 1, curStep = n === step, past = n < step, locked = n > (run.max_step || 1) + (ro ? 7 : 0) && n > step;
    return {
      label, who, dot: DOT[dot], mark: past ? '✓' : String(n), current: curStep ? 'step' : 'false', locked,
      style: (curStep ? 'border-bottom: 3px solid #2A3042; color: #2A3042;' : `border-bottom: 3px solid transparent; color: ${locked ? '#8D92A0' : '#2A3042'};`) + (locked ? ' cursor: not-allowed;' : ' cursor: pointer;'),
      numStyle: curStep ? NUM_CURRENT : (past ? NUM_PAST : NUM_FUTURE), go: () => act.goStep(n),
    };
  });

  const toggleBtn = (on, labelOn, labelOff, fn) => ({ label: on ? labelOn : labelOff, style: on ? TOGGLE_ON : TOGGLE_OFF, toggle: fn });
  const scopeLabel = scope.kind === 'client' ? `Client: ${(D && D.clientName[scope.clientId]) || 'choose a client'}` : (scope.kind === 'dm' ? `DM: ${scope.dmId ? nameOf(scope.dmId) : 'choose a DM'}` : 'Whole company');
  const dmIds = D ? [...new Set((D.members || []).filter((m) => m.role === 'dm').map((m) => m.user_id))] : [];

  // project card content
  const card = (p) => {
    const m = M(p);
    const flags = [
      m.deliverables_overdue ? `${m.deliverables_overdue} LATE DELIVERABLE${m.deliverables_overdue === 1 ? '' : 'S'}` : '',
      m.milestones_late ? `${m.milestones_late} MILESTONE${m.milestones_late === 1 ? '' : 'S'} SLIPPING` : '',
      m.actions_late ? `${m.actions_late} LATE ACTION${m.actions_late === 1 ? '' : 'S'}` : '',
      m.vo_unsent ? `${m.vo_unsent} VO DRAFT` : '', m.incidents_open ? `${m.incidents_open} OPEN INCIDENT${m.incidents_open === 1 ? '' : 'S'}` : '',
      m.queries_overdue ? `${m.queries_overdue} QUERY OVERDUE` : '', Number(m.hours_variance) < 0 ? 'OVER BUDGET FORECAST' : '',
    ].filter(Boolean);
    return {
      id: p.id, name: p.name, code: p.code || '—', client: (D && D.clientName[p.client_id]) || '', dm: dmOf(D, p.id) ? nameOf(dmOf(D, p.id)) : '[no DM]',
      status: M(p).status || 'Not Started', statusStyle: STATUS_CHIP[M(p).status || 'Not Started'] || '', basis: m.status_basis || '',
      href: `./Project.dc.html?id=${p.id}`, flags,
      rows: [
        ['Delivery', `${m.deliverables_submitted || 0} of ${m.deliverables_total || 0} submitted · ${m.deliverables_approved || 0} approved · ${m.awaiting_client || 0} with client`],
        ['Last / next', `${m.last_submission_on ? `${fmtDate(m.last_submission_on)} ${m.last_submission_title || ''}` : '—'}  →  ${m.next_due_on ? `${fmtDate(m.next_due_on)} ${m.next_due_title || ''}` : '—'}`],
        ['Schedule', `${m.milestones_done || 0}/${m.milestones_total || 0} milestones done${m.next_milestone_on ? ` · next ${m.next_milestone_title || ''} ${fmtDate(m.next_milestone_on)}` : ''} · contract finish ${m.adjusted_finish ? fmtDate(m.adjusted_finish) : '—'}`],
        ['Hours', `${fmtHours(m.consumed_hours || 0)} of ${fmtHours(m.budget_total ?? p.budget_hours)} (${m.consumed_pct ?? '—'}%) · at completion ${fmtHours(m.eac || 0)}${m.consumed_as_of ? ` · PCU ${fmtDate(m.consumed_as_of).slice(3)}` : ' · no PCU'}`],
        ['Open', `${m.vo_open || 0} VOs (${fmtHours(m.vo_pending_hours || 0)} h pending) · ${m.incidents_open || 0} incidents · ${m.actions_open || 0} actions · ${m.queries_open || 0} queries`],
        ['Team', m.status_flag ? `${m.status_flag}${m.status_progress != null ? ` · ${m.status_progress}%` : ''} (week of ${fmtDate(m.status_reported_on)})` : 'No team status'],
      ].map(([f, v]) => ({ f, v })),
      rev: toggleBtn(!!dec.reviewed[`card:${p.id}`], '✓ REVIEWED', 'MARK REVIEWED', act.toggle('reviewed', `card:${p.id}`)),
    };
  };

  // DM question groups
  const groups = {};
  questions.forEach((q) => { const k = q.dm || 'none'; (groups[k] = groups[k] || []).push(q); });
  const dmLists = Object.entries(groups).map(([dm, qs]) => ({
    dm: dm === 'none' ? 'No DM assigned' : nameOf(dm), count: `${qs.length} QUESTION${qs.length === 1 ? '' : 'S'}`,
    qs: qs.map((q, i) => ({ n: i + 1, project: q.p.name, t: q.text, val: dec.answer[q.key] || '', style: String(dec.answer[q.key] || '').trim() ? '' : 'background: #F5ECD3;', set: (e) => act.decide('answer', q.key, e.target.value, true) })),
  }));

  const sheets = D ? workbookSheets(D, projects, decisions, since, until) : null;
  const fileName = `Management_review_${until}_${scope.kind}.xlsx`;
  const kAll = (s) => projects.filter((p) => statusOf(p) === s).length;
  const budget = projects.reduce((n, p) => n + Number(M(p).budget_total ?? p.budget_hours ?? 0), 0);
  const consumed = projects.reduce((n, p) => n + Number(M(p).consumed_hours || 0), 0);
  const eac = projects.reduce((n, p) => n + Number(M(p).eac || 0), 0);

  const nextLabels = ['Check the data', 'See the changes', 'Review project cards', 'DM questions', 'Conflicts', 'Status & delays', 'Build output', ''];
  const msgs = [
    `${projects.length} project${projects.length === 1 ? '' : 's'} in scope · ${scopeLabel} · ${fmtDate(since)} → ${fmtDate(until)}`,
    warnings ? `${warnings} data warning${warnings === 1 ? '' : 's'} not yet accepted — fix them in the project or mark them checked.` : 'Data checks done.',
    `${changes.reduce((n, c) => n + c.list.length, 0)} changes in the period · ${projects.filter((p) => dec.reviewed[`chg:${p.id}`]).length} of ${projects.length} projects read.`,
    `${reviewedCards} of ${projects.length} project cards reviewed.`,
    `${answered} of ${questions.length} answers recorded — unanswered questions stay as gaps.`,
    conflictList.length ? `${resolved} of ${conflictList.length} conflicts resolved.` : 'No conflicts between sources.',
    `${approvedStatuses} of ${projects.length} statuses approved · ${respSet} of ${delayed.length} responsibilities set.`,
    approvedRun ? 'Approved — download the Excel and brief management.' : (resolved < conflictList.length ? 'Resolve all conflicts before approving.' : `${ckDone} of ${ck.length} checks done${openItems.length ? ` — ${openItems.length} open item${openItems.length === 1 ? '' : 's'} will be listed` : ''}.`),
  ];
  const nextActions = [['dl', 'Download the Excel', fileName], ['copy', 'Copy the briefing notes', 'For the verbal brief'], ['save', 'Save the Excel to the shared drive', 'You do this yourself'], ['brief', 'Brief management', 'You or the AM, from the notes']]
    .map(([k, t, sub]) => ({ t, sub, mark: dec.next_action[k] ? '✓' : '', numStyle: dec.next_action[k] ? NUM_CURRENT : 'border: 1px solid #CBCED8;', btn: dec.next_action[k] ? '✓ Done' : 'Mark done', btnStyle: dec.next_action[k] ? TOGGLE_ON : TOGGLE_OFF, act: () => act.decide('next_action', k, !dec.next_action[k]) }));

  return {
    ...shell,
    step, steps, info: INFO[step - 1], ro, notRo: !ro,
    s1: step === 1, s2: step === 2, s3: step === 3, s4: step === 4, s5: step === 5, s6: step === 6, s7: step === 7, s8: step === 8,
    runLine: `${approvedRun ? 'APPROVED' : (run.status === 'archived' ? 'ARCHIVED' : 'IN PROGRESS')} · ${scopeLabel.toUpperCase()} · ${projects.length} PROJECT${projects.length === 1 ? '' : 'S'}`,
    loading: !S.loaded && S.auth === 'ready', dataLoading: S.dataLoading, dataErr: S.dataErr, hasDataErr: !!S.dataErr, reloadData: act.reloadData,
    ready: S.loaded && !!D, noProjects: S.loaded && !!D && projects.length === 0,
    here: S.presence.filter((p) => p.user_id !== (S.user && S.user.id)).map((p) => ({ initials: initials(p.name || p.email), title: `${p.name || p.email} — step ${p.step}` })),
    // step 1
    scopeButtons: SCOPES.map(([k, label]) => ({ label, style: scope.kind === k ? TOGGLE_ON : 'background: #FFFFFF; color: #2A3042; border: 1px solid #DCD8D0;', pick: () => act.setScopeKind(k) })),
    scopeClient: scope.kind === 'client', scopeDm: scope.kind === 'dm',
    clientOptions: [{ value: '', label: 'Choose a client…' }, ...((D && D.clients) || []).map((c) => ({ value: c.id, label: c.name }))], clientVal: scope.clientId || '',
    dmOptions: [{ value: '', label: 'Choose a DM…' }, ...dmIds.map((id) => ({ value: id, label: nameOf(id) }))], dmVal: scope.dmId || '',
    setScopeClient: act.setScopeClient, setScopeDm: act.setScopeDm,
    since, until, setSince: act.setLastUpdate, setUntil: act.setReportDate,
    scopeList: projects.map((p) => ({ name: p.name, code: p.code || '—', client: (D && D.clientName[p.client_id]) || '', status: M(p).status || 'Not Started', statusStyle: STATUS_CHIP[M(p).status || 'Not Started'] || '' })),
    previous: S.previous.map((r) => ({ href: `./Main.dc.html?run=${r.id}`, label: `${fmtDate(r.report_date)} · ${r.scope_kind}`, status: r.status.toUpperCase() })), hasPrevious: S.previous.length > 0,
    canShare: isManagement(S) && !ro, share: act.share, shareBusy: S.shareBusy, shareMsg: S.shareMsg, hasShareMsg: !!S.shareMsg, shareErr: S.shareErr, hasShareErr: !!S.shareErr,
    // step 2
    checks: checks.map(({ p, list }) => ({ name: p.name, code: p.code || '—', items: list.map((c) => c.text), ok: list.length === 0, okLabel: list.length ? `${list.length} WARNING${list.length === 1 ? '' : 'S'}` : 'OK',
      okStyle: list.length ? CHIP_OPEN : CHIP_DONE, href: `./Project.dc.html?id=${p.id}`, hasItems: list.length > 0,
      ack: toggleBtn(!!dec.reviewed[`chk:${p.id}`], '✓ ACCEPTED', 'ACCEPT FOR THIS REVIEW', act.toggle('reviewed', `chk:${p.id}`)) })),
    // step 3
    changeGroups: changes.map(({ p, list }) => ({ name: p.name, count: `${list.length} CHANGE${list.length === 1 ? '' : 'S'}`, items: list.map((c) => ({ d: fmtDate(c.at), t: c.text, s: c.table.replace('_', ' ') })), none: list.length === 0,
      read: toggleBtn(!!dec.reviewed[`chg:${p.id}`], '✓ READ', 'MARK READ', act.toggle('reviewed', `chg:${p.id}`)) })),
    periodLine: `${fmtDate(since)} → ${fmtDate(until)}`,
    // step 4
    cards: projects.map(card), allCardsReviewed: projects.length > 0 && reviewedCards === projects.length,
    // step 5
    dmLists, noQuestions: S.loaded && questions.length === 0, ansMsg: questions.length ? `${answered} of ${questions.length} answers recorded.` : 'No gaps — nothing to ask the DMs.',
    ansStyle: answered === questions.length ? 'background: #2A3042; color: #F1EFEA;' : 'background: #F5ECD3; color: #6B5622;',
    // step 6
    conflicts: conflictList.map((c) => {
      const p = dec.pick[c.key];
      return { project: c.p.name, field: c.field, a: c.a, b: c.b, srcA: c.srcA, srcB: c.srcB, styleA: p === 'A' ? OPTION_SELECTED : OPTION_IDLE, styleB: p === 'B' ? OPTION_SELECTED : OPTION_IDLE,
        markA: p === 'A' ? '✓ SELECTED' : '', markB: p === 'B' ? '✓ SELECTED' : '', isA: p === 'A', isB: p === 'B', pickA: () => act.decide('pick', c.key, 'A'), pickB: () => act.decide('pick', c.key, 'B'),
        status: p ? `RESOLVED · ${p}` : 'OPEN', statusStyle: p ? CHIP_DONE : CHIP_OPEN };
    }),
    noConflicts: S.loaded && conflictList.length === 0, allResolved: conflictList.length > 0 && resolved === conflictList.length,
    // step 7
    statusCards: projects.map((p) => {
      const m = M(p), st = statusOf(p), needR = ['Delayed', 'At Risk'].includes(st);
      return {
        name: p.name, proposed: m.status || 'Not Started', basis: m.status_basis || '', final: st, finalStyle: STATUS_CHIP[st] || '',
        overrideVal: override[p.id] || '', setOverride: (e) => act.decide('wording', `override:${p.id}`, e.target.value),
        approve: toggleBtn(!!dec.status_approved[p.id], '✓ STATUS APPROVED', 'APPROVE STATUS', act.toggle('status_approved', p.id)),
        respVal: dec.responsibility[p.id] || '', setResp: (e) => act.decide('responsibility', p.id, e.target.value), noResp: !needR,
        respPlaceholder: needR ? 'Select…' : 'Not needed', wordingVal: typeof wording[p.id] === 'string' ? wording[p.id] : (m.status_basis || ''),
        setWording: (e) => act.decide('wording', p.id, e.target.value, true),
        done: `${(dec.status_approved[p.id] ? 1 : 0) + (needR && dec.responsibility[p.id] ? 1 : 0)} OF ${needR ? 2 : 1} DONE`,
        doneStyle: (dec.status_approved[p.id] && (!needR || dec.responsibility[p.id])) ? CHIP_DONE : CHIP_OPEN,
      };
    }),
    overrideOptions: [{ value: '', label: 'Keep proposed status' }, ...STATUSES.map((s) => ({ value: s, label: s }))], respOptions: RESP.map((r) => ({ value: r, label: r || 'Select…' })),
    // step 8
    checklist: ck.map((c) => ({ tag: c.good ? 'DONE' : 'OPEN', style: c.good ? CHIP_DONE : CHIP_OPEN, t: c.t })), ckDone, ckTotal: ck.length,
    openItems: openItems.length ? openItems : ['None — every check is done.'],
    openTitle: openItems.length ? `${openItems.length} open item${openItems.length === 1 ? '' : 's'} will be listed` : 'No open items',
    openBoxStyle: openItems.length ? 'background: #F5ECD3; border: 1px solid #9A7F3A;' : 'background: #F2F2F2; border: 1px solid #DCD8D0;',
    kTotal: projects.length, kOn: kAll('On Track'), kDel: kAll('Delayed'), kRisk: kAll('At Risk'), kHold: kAll('On Hold'),
    kHours: `${fmtHours(consumed)} / ${fmtHours(budget)}`, kPct: budget ? `${Math.round((consumed / budget) * 1000) / 10}%` : '—', kEac: fmtHours(eac),
    xl: projects.map((p) => {
      const m = M(p), st = statusOf(p);
      return { code: p.code || '—', name: p.name, client: (D && D.clientName[p.client_id]) || '', st, stS: dec.status_approved[p.id] ? (STATUS_CHIP[st] || '') : 'background: #F5ECD3;',
        why: wording[p.id] || m.status_basis || '', r: ['Delayed', 'At Risk'].includes(st) ? (dec.responsibility[p.id] || '[your decision]') : '—', rS: ['Delayed', 'At Risk'].includes(st) && !dec.responsibility[p.id] ? 'background: #F5ECD3;' : '',
        last: m.last_submission_on ? fmtDate(m.last_submission_on) : '—', next: m.next_due_on ? fmtDate(m.next_due_on) : '—', late: m.deliverables_overdue || 0,
        hrs: `${fmtHours(m.consumed_hours || 0)} / ${fmtHours(m.budget_total ?? p.budget_hours)}`, pct: m.consumed_pct == null ? '—' : `${m.consumed_pct}%`, eac: fmtHours(m.eac || 0) };
    }),
    briefingText, setBriefing: (e) => act.decide('wording', 'briefing', e.target.value, true), briefingEdited: typeof dec.wording.briefing === 'string',
    resetBriefing: () => act.decide('wording', 'briefing', false), // false = use the generated notes (value can't be SQL null) copyBriefing: () => act.copyText(briefingText), copyLabel: S.copied ? '✓ Copied' : 'Copy briefing notes',
    downloadExcel: () => sheets && act.exportExcel({ ...sheets, briefing: [['Briefing notes — ' + scopeLabel + ', ' + fmtDate(until)], ...briefingText.split('\n').map((l) => [l])] }, fileName),
    exportLabel: S.exportBusy ? 'Building…' : 'Download Excel (4 sheets)', exportBusy: S.exportBusy, exportErr: S.exportErr, hasExportErr: !!S.exportErr, fileName,
    done: approvedRun, notDone: !approvedRun, nextActions, nextDoneCount: nextActions.filter((a) => a.mark).length,
    approveConfirm: S.approveConfirm, approve: act.approve, cancelApprove: act.cancelApprove, confirmApprove: act.confirmApprove,
    approveBlocked: ro || approvedRun || resolved < conflictList.length || !projects.length, approveLabel: approvedRun ? '✓ Approved' : 'Approve review…',
    newReview: act.newReview,
    // footer
    showBack: step > 1, showNext: step < 8, nextBlocked: !S.loaded, nextLabel: `${nextLabels[step - 1]} →`,
    barMsg: msgs[step - 1], barDot: S.dataLoading ? 'background: #5A63A8;' : 'background: #C2A25A;',
    back: () => act.goStep(step - 1), next: () => act.goStep(step + 1),
  };
}

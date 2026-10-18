// Step 8: the COO Summary sheet preview, final checklist, approval and next actions.
import { BRIEFING_NOTES, NEXT_ACTIONS, CONFLICT_COUNT, PROJECT_COUNT, RESPONSIBILITY_COUNT } from '../data/reference-data.js';
import { TOGGLE_ON, TOGGLE_OFF, CELL_CHANGED as CH, CELL_NEEDED as ND, TEXT_OVERDUE as RED, CHIP_DONE, CHIP_OPEN } from '../ui/tokens.js';

const fmt = (n) => n.toLocaleString('en-US');

export function buildOutput(S, act, { pick, resolved, respN, approvedN, stagesN, sadStatus }) {
  const statusOf = (id, prop) => (S.approved[id] ? { v: prop, s: '' } : { v: 'Proposed: ' + prop, s: ND });
  const rowX = (id, name, prop, stg, stgS, last, nx, nxS, bud, con) => {
    const st = statusOf(id, prop), r = S.resp[id] || '', needR = prop !== 'On Track';
    return {
      id, name, st: st.v, stS: st.s, stg, stgS, last, nx, nxS, bud: fmt(bud), con: fmt(con),
      pct: (Math.round(con / bud * 1000) / 10) + '%', r: needR ? (r || '[your decision]') : '—', rS: needR && !r ? ND : '',
    };
  };

  const c1 = pick('c1'), c2 = pick('c2'), c3 = pick('c3'), c4 = pick('c4'), c5 = pick('c5'), c7 = pick('c7');
  const xl = [
    rowX('P01', 'Ubayya (Heights & Elite)', 'Delayed', 'IFT', '', '16 Sep 2026 · Rev 07', 'IFT Elite P3 30 Sep 2026; IFC 5 working days after client approval', CH, 71432, 74403),
    rowX('P02', 'Taraf-Khuzam 03 Zone 06', 'Delayed', 'Multiple Stages', '', '15 Sep 2026 · Rev 00', c2 ? 'Villas: ' + c2 : '[conflict — your choice]', c2 ? CH : ND, 28583, 22512),
    rowX('P03', 'Rehab Al-Dar', 'On Track', c1 || '[conflict — your choice]', c1 ? CH : ND, '08 Sep 2026', 'After client confirms concept', CH, 9609, 1911),
    rowX('P08', 'Commercial Group 03', 'Delayed', 'Multiple Stages', '', '10 Sep 2026 · 5 of 7 plots', c3 ? 'Tender: ' + c3 + ' (overdue unless submitted)' : '[conflict — your choice]', c3 ? CH + RED : ND, 5891, 4855),
    rowX('P09', 'Al Azaziyah Sales Center', 'Delayed', c4 || '[conflict — your choice]', c4 ? CH : ND, '11 Sep 2026', c5 ? 'IFT building: ' + c5 : '[conflict — your choice]', c5 ? CH : ND, 9190, 2542),
    rowX('P10', 'Sadayem Central Park', sadStatus, 'Pre-Concept', '', '31 Aug 2026 · Rev 04', '[needed from Ahmed]', ND, 8346, 813),
    rowX('P11', 'Lazurd Mosques', 'Delayed', 'Multiple Stages', '', '15 Sep 2026 · M21', c7 ? 'Validation M03 & M19: ' + c7 : '[conflict — your choice]', c7 ? (c7.indexOf('17 Sep') === 0 ? CH + RED : CH) : ND, 2820, 845),
  ];

  const statuses = ['Delayed', 'Delayed', 'On Track', 'Delayed', 'Delayed', sadStatus, 'Delayed'];
  const count = (s) => statuses.filter((x) => x === s).length;

  const ck = (good, t) => ({ tag: good ? 'DONE' : 'OPEN', style: good ? CHIP_DONE : CHIP_OPEN, t, good });
  const checklist = [
    ck(true, 'All required inputs received, or missing ones listed (PCU export missing).'),
    ck(false, 'PCU total matches the sheet total — not run, no PCU export.'),
    ck(true, 'Every changed cell has a source in Notes & Source.'),
    ck(true, 'No protected field filled without a source.'),
    ck(resolved === CONFLICT_COUNT, 'Conflicts resolved by you — ' + resolved + ' of 8.'),
    ck(respN >= RESPONSIBILITY_COUNT, 'Responsibility set by you — ' + respN + ' of 6 delayed or on-hold projects.'),
    ck(approvedN === PROJECT_COUNT, 'Status approved by you — ' + approvedN + ' of 7.'),
    ck(stagesN === PROJECT_COUNT, 'Stages in scope confirmed for Progress — ' + stagesN + ' of 7.'),
    ck(true, '“Changes this update” complete — 21 rows.'),
    ck(true, 'Formulas intact.'),
    ck(true, 'Nothing saved or sent without your approval.'),
  ];
  const ckDone = checklist.filter((k) => k.good).length;
  const openItems = checklist.filter((k) => !k.good).map((k) => k.t);

  const mark = (k) => () => act.set({ nextDone: { ...S.nextDone, [k]: true } });
  const copyNotes = () => {
    try { if (navigator.clipboard) navigator.clipboard.writeText(BRIEFING_NOTES.join('\n')).catch(() => {}); } catch (e) { /* clipboard blocked */ }
    mark('copy')();
  };
  const nextActions = NEXT_ACTIONS.map((a) => {
    const d = !!S.nextDone[a.k];
    return {
      t: a.t, sub: a.sub, mark: d ? '✓' : '',
      numStyle: d ? 'background: #16191D; color: #FFFFFF; border: 1px solid #16191D;' : 'border: 1px solid #C9CDD6;',
      btn: d ? '✓ ' + a.done : a.todo, act: a.k === 'copy' ? copyNotes : mark(a.k), btnStyle: d ? TOGGLE_ON : TOGGLE_OFF,
    };
  });
  const nextDoneCount = NEXT_ACTIONS.filter((a) => S.nextDone[a.k]).length;

  return {
    xl, kOn: count('On Track'), kDel: count('Delayed'), kHold: count('On Hold'),
    checklist, ckDone, openItems, done: S.ok,
    nextActions, nextDoneCount,
    approveConfirm: S.approveConfirm,
    openTitle: openItems.length ? openItems.length + ' open item' + (openItems.length === 1 ? '' : 's') + ' will stay yellow' : 'No open items',
    openBoxStyle: openItems.length ? 'background: #FFF2CC; border: 1px solid #8A6A00;' : 'background: #F2F2F2; border: 1px solid #D9D6CE;',
    approve: () => act.set({ approveConfirm: true }),
    cancelApprove: () => act.set({ approveConfirm: false }),
    confirmApprove: () => act.set({ approveConfirm: false, ok: true }),
    approveBlocked: resolved < CONFLICT_COUNT || S.ok, approveLabel: S.ok ? '✓ Approved' : 'Approve output…',
    restart: () => act.restart(),
  };
}

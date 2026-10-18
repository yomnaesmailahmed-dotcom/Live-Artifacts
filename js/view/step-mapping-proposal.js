// Steps 3–4: project mapping and Claude's change proposal cards.
import { MAPPING, PROPOSALS, PROPOSAL_FILTERS, PROJECT_COUNT } from '../data/reference-data.js';
import { TOGGLE_ON, TOGGLE_OFF, FILTER_OFF, CELL_CHANGED, CELL_NEEDED } from '../ui/tokens.js';

export function buildMappingProposal(S, act) {
  const mapping = MAPPING.map((m) => ({ ...m, style: m.note === 'Same ID' ? '' : 'background: #FCE4D6;' }));

  let nRows = 0, nConf = 0, nChg = 0, nNeed = 0, reviewedCount = 0;
  PROPOSALS.forEach((p) => {
    if (S.reviewed[p.id]) reviewedCount++;
    p.rows.forEach((r) => { nRows++; if (r.k === 'c') nChg++; else if (r.k === 'n') nNeed++; else nConf++; });
  });

  const proposals = PROPOSALS.filter((p) => S.filter === 'all' || S.filter === p.dmk).map((p) => {
    const on = !!S.reviewed[p.id];
    return {
      ...p,
      rows: p.rows.map((r) => ({ ...r, style: r.k === 'c' ? CELL_CHANGED : (r.k === 'n' ? CELL_NEEDED : '') })),
      revLabel: on ? '✓ REVIEWED' : 'MARK REVIEWED', revStyle: on ? TOGGLE_ON : TOGGLE_OFF,
      toggle: () => act.set({ reviewed: { ...S.reviewed, [p.id]: !S.reviewed[p.id] } }),
    };
  });

  const filters = PROPOSAL_FILTERS.map(([key, label]) => ({
    label, style: S.filter === key ? TOGGLE_ON : FILTER_OFF, pick: () => act.set({ filter: key }),
  }));

  const extracting = S.extractState === 'running';
  return {
    mapping, mapOk: S.mapOk, mapLabel: S.mapOk ? '✓ Mapping confirmed' : 'Confirm mapping',
    confirmMap: () => act.set({ mapOk: true }),
    extracting, extracted: S.extractState === 'done',
    nRows, nConf, nChg, nNeed, proposals, filters, reviewedCount,
    allReviewed: reviewedCount === PROJECT_COUNT,
  };
}

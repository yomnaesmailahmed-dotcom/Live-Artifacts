// Maps component state <-> database rows.

// State key -> refresh_runs columns it is stored in.
export const RUN_FIELD_COLUMNS = {
  step: ['step'],
  maxStep: ['max_step'],
  lastUpdate: ['last_update'],
  reportDate: ['report_date'],
  files: ['summary_added', 'evidence_added'],
  pcu: ['pcu'],
  checkState: ['check_state'],
  mapOk: ['map_ok'],
  extractState: ['extract_state'],
  ok: ['status'],
};

// State map key -> run_decisions.kind
export const DECISION_KINDS = {
  reviewed: 'reviewed',
  answers: 'answer',
  picks: 'pick',
  approved: 'status_approved',
  resp: 'responsibility',
  done: 'stages_done',
  scope: 'stages_scope',
  wording: 'wording',
  nextDone: 'next_action',
};

const KIND_TO_MAP = Object.fromEntries(Object.entries(DECISION_KINDS).map(([k, v]) => [v, k]));

// Typed text is saved after a short pause; clicks are saved at once.
const DEBOUNCED_KINDS = new Set(['answer', 'wording', 'stages_done', 'stages_scope']);
export const isDebouncedKind = (kind) => DEBOUNCED_KINDS.has(kind);

export function runRowToState(row) {
  return {
    step: row.step,
    maxStep: row.max_step,
    lastUpdate: row.last_update,
    reportDate: row.report_date,
    files: { summary: !!row.summary_added, evidence: !!row.evidence_added },
    pcu: row.pcu,
    checkState: row.check_state,
    mapOk: !!row.map_ok,
    extractState: row.extract_state,
    ok: row.status === 'approved',
  };
}

// Only the keys present in `patch` are converted. Transient "running" states stay local.
export function runPatchToColumns(patch) {
  const c = {};
  if ('step' in patch) c.step = patch.step;
  if ('maxStep' in patch) c.max_step = patch.maxStep;
  if ('lastUpdate' in patch && patch.lastUpdate) c.last_update = patch.lastUpdate;
  if ('reportDate' in patch && patch.reportDate) c.report_date = patch.reportDate;
  if ('files' in patch) { c.summary_added = !!patch.files.summary; c.evidence_added = !!patch.files.evidence; }
  if ('pcu' in patch) c.pcu = patch.pcu;
  if ('checkState' in patch && patch.checkState !== 'running') c.check_state = patch.checkState;
  if ('mapOk' in patch) c.map_ok = !!patch.mapOk;
  if ('extractState' in patch && patch.extractState !== 'running') c.extract_state = patch.extractState;
  if ('ok' in patch) c.status = patch.ok ? 'approved' : 'active';
  return c;
}

export function decisionRowsToState(rows) {
  const s = {};
  Object.keys(DECISION_KINDS).forEach((k) => { s[k] = {}; });
  rows.forEach((r) => {
    const mapKey = KIND_TO_MAP[r.kind];
    if (mapKey) s[mapKey][r.item_key] = r.value;
  });
  return s;
}

export function decisionRowToPatch(state, row) {
  const mapKey = KIND_TO_MAP[row.kind];
  if (!mapKey) return {};
  return { [mapKey]: { ...state[mapKey], [row.item_key]: row.value } };
}

export const decisionId = (kind, itemKey) => `${kind}|${itemKey}`;

// Rows to upsert for every decision-map entry that changed between prev and next.
export function diffDecisions(prev, next, patch) {
  const out = [];
  Object.keys(patch).forEach((mapKey) => {
    const kind = DECISION_KINDS[mapKey];
    if (!kind) return;
    const a = prev[mapKey] || {}, b = next[mapKey] || {};
    new Set([...Object.keys(a), ...Object.keys(b)]).forEach((itemKey) => {
      if (a[itemKey] !== b[itemKey]) out.push({ kind, item_key: itemKey, value: b[itemKey] === undefined ? null : b[itemKey] });
    });
  });
  return out;
}

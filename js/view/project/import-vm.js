// Project page: Import tab bindings (Excel / CSV → deliverables, milestones, actions, hours).
import { TARGETS, TARGET_OPTIONS, buildRows, splitDuplicates } from '../../domain/import-map.js';

const LABEL = {
  title: 'Name', phase: 'Phase', source: 'Source', source_ref: 'Source ref', baseline_date: 'Baseline', forecast_date: 'Forecast', actual_date: 'Actual',
  planned_hours: 'Plan h', status: 'Status', kind: 'Kind', baseline_start: 'Baseline start', baseline_finish: 'Baseline finish', forecast_finish: 'Forecast finish',
  actual_finish: 'Actual finish', owner_name: 'Owner', start_on: 'Start', due_on: 'Due', actual_hours: 'Actual h', notes: 'Notes',
  period: 'Month', component: 'Component', component_id: 'Component', cumulative_hours: 'Hours', progress_pct: 'Progress %',
};
const EXISTING = { deliverables: 'deliverables', milestones: 'milestones', actions: 'actions', hours: 'hours' };

export function buildImport(S, act, perm) {
  const imp = S.imp;
  const sheet = imp.sheets[imp.sheet];
  const hasFile = !!sheet;
  const compCode = Object.fromEntries(S.components.map((c) => [c.id, c.code]));
  let res = null, split = { fresh: [], duplicates: [], updates: false };
  if (hasFile && imp.target) {
    res = buildRows(imp.target, sheet.rows, { components: S.components });
    split = splitDuplicates(imp.target, res.rows, S[EXISTING[imp.target]] || []);
  }
  const fields = res && res.ready ? res.mapping.map((m) => m.field) : [];
  const cols = imp.target === 'hours' ? fields.map((f) => (f === 'component' ? 'component_id' : f)) : fields;
  const show = (r, f) => {
    if (f === 'component_id') return r.component_id ? compCode[r.component_id] || '' : '(project total)';
    const v = r[f];
    return v === null || v === undefined ? '' : String(v);
  };
  const unmapped = hasFile && res && res.ready ? (sheet.rows[res.headerRow] || []).filter((h, i) => h && !res.mapping.some((m) => m.col === i)) : [];
  const toSave = split.fresh.length + (split.updates ? split.duplicates.length : 0);
  const counts = !res || !res.ready ? '' : [
    `${split.fresh.length} new`,
    split.duplicates.length ? (split.updates ? `${split.duplicates.length} to update` : `${split.duplicates.length} already in the project (skipped)`) : '',
    res.errors.length ? `${res.errors.length} row${res.errors.length === 1 ? '' : 's'} with problems (skipped)` : '',
  ].filter(Boolean).join(' · ');

  return {
    impHasFile: hasFile, impNoFile: !hasFile, impName: imp.name, impBusy: imp.busy, impErr: imp.err, impHasErr: !!imp.err, impMsg: imp.msg, impHasMsg: !!imp.msg,
    impSheets: imp.sheets.map((s, i) => ({ value: String(i), label: `${s.name} (${s.rows.length} rows)` })), impSheet: String(imp.sheet), impManySheets: imp.sheets.length > 1,
    impTargets: [{ value: '', label: '— choose what this is —' }, ...TARGET_OPTIONS], impTarget: imp.target || '',
    impUnknown: hasFile && !imp.target, impNotReady: !!res && !res.ready,
    impNotReadyText: res && !res.ready ? `This sheet doesn’t have a ${LABEL[TARGETS[imp.target].required]} column that I can match. Expected headers like: ${Object.values(TARGETS[imp.target].fields).map((n) => n[0]).join(', ')}.` : '',
    impReady: !!res && res.ready,
    impMapping: res && res.ready ? res.mapping.map((m) => ({ text: `${m.header} → ${LABEL[m.field] || m.field}` })) : [],
    impUnmapped: unmapped.length ? `Ignored columns: ${unmapped.join(', ')}` : '', impHasUnmapped: unmapped.length > 0,
    impHead: cols.map((f) => ({ label: LABEL[f] || f })),
    impRows: (res ? res.rows : []).slice(0, 8).map((r) => ({ cells: cols.map((f) => ({ v: show(r, f) })) })),
    impMore: res && res.rows.length > 8 ? `…and ${res.rows.length - 8} more` : '', impHasMore: !!res && res.rows.length > 8,
    impCounts: counts, impErrors: res ? res.errors.slice(0, 8).map((e) => ({ e })) : [], impHasErrors: !!res && res.errors.length > 0,
    impMoreErrors: res && res.errors.length > 8 ? `…and ${res.errors.length - 8} more` : '',
    impCanRun: perm.canEdit && toSave > 0 && !imp.busy,
    impRunLabel: imp.busy ? 'Importing…' : (toSave ? `Import ${toSave} row${toSave === 1 ? '' : 's'}` : 'Nothing to import'),
    impCanEdit: perm.canEdit,
    impPickFile: act.pickImportFile, impSetSheet: act.setImportSheet, impSetTarget: act.setImportTarget, impRun: act.runImport, impClear: act.clearImport,
  };
}

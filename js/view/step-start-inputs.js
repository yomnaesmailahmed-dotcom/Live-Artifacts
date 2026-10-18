// Steps 1–2: dates, input files, PCU decision and Claude's input check.
import { INPUT_SLOTS } from '../data/reference-data.js';
import { CHIP_EMPTY, CHIP_OPEN } from '../ui/tokens.js';

export function buildStartInputs(S, act) {
  const F = S.files;
  const setFile = (k, v) => act.set({ files: { ...S.files, [k]: v }, checkState: 'idle', checkErr: '' });

  const slots = INPUT_SLOTS.map((s) => {
    const on = !!F[s.k];
    return {
      title: s.title, req: 'REQUIRED', detail: on ? s.file : s.emptyDetail,
      chip: on ? 'ADDED' : 'EMPTY', chipStyle: on ? '' : CHIP_EMPTY,
      rowStyle: on ? '' : 'background: #FBFAF7;', action: on ? 'Remove' : 'Add file',
      toggle: () => setFile(s.k, !on),
    };
  });

  const runCheck = () => {
    if (!F.summary) { act.set({ checkErr: 'The current summary Excel is missing. Add it — Claude compares everything against it.' }); return; }
    if (S.pcu === 'none') { act.set({ checkErr: 'Decide on the PCU hours export first: add it, or choose to continue without it.' }); return; }
    act.set({ checkErr: '', checkState: 'running' });
    act.later(() => act.set({ checkState: 'done' }), 1200);
  };

  const pcuSkipped = S.pcu === 'skipped';
  return {
    yes: true,
    lastUpdate: S.lastUpdate, reportDate: S.reportDate,
    setLastUpdate: (e) => act.set({ lastUpdate: e.target.value }),
    setReportDate: (e) => act.set({ reportDate: e.target.value }),
    checkIdle: S.checkState === 'idle', checking: S.checkState === 'running', checked: S.checkState === 'done', runCheck,
    checkErr: !!S.checkErr, checkErrMsg: S.checkErr, noFiles: !F.summary && !F.evidence, slots,
    hasEvidence: !!F.evidence, noEvidence: !F.evidence,
    pcuUndecided: S.pcu === 'none' && !S.pcuConfirm, pcuSkipped, pcuConfirm: S.pcuConfirm,
    pcuChip: pcuSkipped ? 'SKIPPED' : 'EMPTY', pcuChipStyle: pcuSkipped ? CHIP_OPEN : CHIP_EMPTY,
    pcuDetail: pcuSkipped ? 'Continuing without it — consumed hours stay unconfirmed' : 'Not in this run’s reference data',
    pcuRow: pcuSkipped ? 'background: #FFF2CC;' : 'background: #FBFAF7;',
    askSkipPcu: () => act.set({ pcuConfirm: true }),
    cancelSkipPcu: () => act.set({ pcuConfirm: false }),
    confirmSkipPcu: () => act.set({ pcu: 'skipped', pcuConfirm: false, checkErr: '', checkState: 'idle' }),
    undoSkipPcu: () => act.set({ pcu: 'none', checkState: 'idle' }),
  };
}

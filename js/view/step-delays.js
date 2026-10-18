// Step 7: delay chronologies, status approval, responsibility and progress.
import { DELAYS } from '../data/reference-data.js';
import { TOGGLE_ON, TOGGLE_OFF, CHIP_DONE, CHIP_OPEN } from '../ui/tokens.js';

export function buildDelays(S, act, pick) {
  const sadStatus = pick('c6') || 'Delayed';
  let approvedN = 0, respN = 0, stagesN = 0;

  const delays = DELAYS.map((def) => {
    const d = def.statusFromConflict ? { ...def, status: pick(def.statusFromConflict) || def.status } : def;
    const ap = !!S.approved[d.id], rv = S.resp[d.id] || '', dn = S.done[d.id], sc = S.scope[d.id];
    const needResp = d.status !== 'On Track';
    if (ap) approvedN++;
    if (rv) respN++;
    const filled = sc && Number(sc) > 0 && dn !== undefined && dn !== null && dn !== '';
    const stageErr = !!(filled && Number(dn) > Number(sc));
    const hasProg = filled && !stageErr;
    if (hasProg) stagesN++;
    const total = needResp ? 3 : 2, got = (ap ? 1 : 0) + (needResp && rv ? 1 : 0) + (hasProg ? 1 : 0);
    const upd = (key) => (e) => act.set({ [key]: { ...S[key], [d.id]: e.target.value } });
    const wordingVal = typeof S.wording[d.id] === 'string' ? S.wording[d.id] : d.wording;
    return {
      ...d,
      chron: d.chron.map((e) => ({ d: e[0], t: e[1], s: e[2] })),
      apLabel: ap ? '✓ STATUS APPROVED' : 'APPROVE STATUS', apStyle: ap ? TOGGLE_ON : TOGGLE_OFF,
      approve: () => act.set({ approved: { ...S.approved, [d.id]: !S.approved[d.id] } }),
      respVal: rv, setResp: upd('resp'), noResp: !needResp, respPlaceholder: needResp ? 'Select…' : 'Not needed — On Track',
      doneVal: dn == null ? '' : dn, scopeVal: sc == null ? '' : sc,
      setDone: upd('done'), setScope: upd('scope'),
      wordingVal, setWording: upd('wording'),
      progress: hasProg ? (Math.round(Number(dn) / Number(sc) * 1000) / 10) + '%' : (stageErr ? 'Check numbers' : 'Enter stages'), stageErr,
      progStyle: hasProg ? 'background: #F2F2F2; border: 1px solid #D9D6CE;' : (stageErr ? 'background: #FDECEC; border: 1px solid #C00000; color: #A00000;' : 'background: #FFFFFF; border: 1px dashed #C9A227; color: #5C4300;'),
      doneLabel: got + ' OF ' + total + ' DONE', doneStyle: got === total ? CHIP_DONE : CHIP_OPEN,
    };
  });

  return { delays, approvedN, respN, stagesN, sadStatus };
}

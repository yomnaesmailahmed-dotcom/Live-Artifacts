// Steps 5–6: DM question lists and source conflicts.
import { DM_QUESTIONS, CONFLICTS, QUESTION_COUNT, CONFLICT_COUNT } from '../data/reference-data.js';
import { OPTION_SELECTED, OPTION_IDLE, CHIP_DONE, CHIP_OPEN } from '../ui/tokens.js';

export function buildQuestions(S, act) {
  const dmLists = DM_QUESTIONS.map((d, di) => ({
    ...d,
    qs: d.qs.map((t, i) => {
      const key = di + '-' + i, val = S.answers[key] || '', has = !!val.trim();
      return {
        n: i + 1, t, val, style: has ? '' : 'background: #FFF2CC;',
        set: (e) => act.set({ answers: { ...S.answers, [key]: e.target.value } }),
      };
    }),
  }));
  const answered = Object.keys(S.answers).filter((k) => S.answers[k] && String(S.answers[k]).trim()).length;
  return {
    dmLists, answered,
    ansMsg: answered === 0 ? 'No answers recorded yet. You can continue — unanswered questions stay as yellow gaps.' : answered + ' of 11 answers recorded.' + (answered < QUESTION_COUNT ? ' The rest stay as yellow gaps.' : ''),
    ansStyle: answered === QUESTION_COUNT ? 'background: #16191D; color: #F6F5F1;' : 'background: #FFF2CC; color: #5C4300;',
  };
}

export function buildConflicts(S, act) {
  let resolved = 0;
  const conflicts = CONFLICTS.map((c) => {
    const p = S.picks[c.k];
    if (p) resolved++;
    const choose = (v) => () => act.set({ picks: { ...S.picks, [c.k]: v } });
    return {
      ...c, styleA: p === 'A' ? OPTION_SELECTED : OPTION_IDLE, styleB: p === 'B' ? OPTION_SELECTED : OPTION_IDLE,
      pickA: choose('A'), pickB: choose('B'), isA: p === 'A', isB: p === 'B',
      markA: p === 'A' ? '✓ SELECTED' : '', markB: p === 'B' ? '✓ SELECTED' : '',
      status: p ? 'RESOLVED · ' + p : 'OPEN', statusStyle: p ? CHIP_DONE : CHIP_OPEN,
    };
  });
  // The chosen value for a conflict, or null while it is open.
  const pick = (k) => {
    const c = CONFLICTS.find((x) => x.k === k), p = S.picks[k];
    return p ? (p === 'A' ? c.a : c.b) : null;
  };
  return { conflicts, resolved, allResolved: resolved === CONFLICT_COUNT, pick };
}

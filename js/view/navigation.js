import { STEP_DEFS, STEP_INFOS } from '../data/reference-data.js';
import { DOT, NUM_CURRENT, NUM_PAST, NUM_FUTURE } from '../ui/tokens.js';

// Moving to step 4 the first time starts Claude's (simulated) extraction.
export function goTo(S, act, n) {
  return function () {
    const ch = { step: n, maxStep: Math.max(S.maxStep, n) };
    if (n === 4 && S.extractState === 'idle') {
      ch.extractState = 'running';
      act.later(() => act.set({ extractState: 'done' }), 1400);
    }
    act.set(ch);
  };
}

export function buildNavigation(S, act) {
  const step = S.step;
  const steps = STEP_DEFS.map(([label, who, dot], i) => {
    const n = i + 1, cur = n === step, past = n < step, locked = n > S.maxStep;
    return {
      label, who, dot: DOT[dot], mark: past ? '✓' : String(n), current: cur ? 'step' : 'false', locked,
      style: (cur ? 'border-bottom: 3px solid #16191D; color: #16191D;' : 'border-bottom: 3px solid transparent; color: ' + (locked ? '#8A8F96' : '#16191D') + ';') + (locked ? ' cursor: not-allowed;' : ' cursor: pointer;'),
      numStyle: cur ? NUM_CURRENT : (past ? NUM_PAST : NUM_FUTURE),
      go: goTo(S, act, n),
    };
  });
  return {
    step, steps, info: STEP_INFOS[step - 1],
    s1: step === 1, s2: step === 2, s3: step === 3, s4: step === 4, s5: step === 5, s6: step === 6, s7: step === 7, s8: step === 8,
    back: goTo(S, act, step - 1), next: goTo(S, act, step + 1),
  };
}

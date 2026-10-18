// Sticky bottom bar: status message and Back / Next.
import { NEXT_LABELS, CONFLICT_COUNT } from '../data/reference-data.js';

export function buildFooter(S, m) {
  const { step, extracting, reviewedCount, answered, resolved, approvedN, respN, stagesN, nextDoneCount, openItems, ckDone } = m;
  const F = S.files;
  const left = 4 - nextDoneCount;
  const msgs = [
    'Set the dates and scope, then start.',
    S.checkState === 'done' ? (F.evidence ? 'Input check complete — 2 warnings to note.' : 'No evidence to extract — add it and run the check again.') : (S.checkState === 'running' ? 'Claude is checking your inputs…' : (!F.summary || !F.evidence ? 'Add the required inputs, then run Claude’s check.' : (S.pcu === 'none' ? 'Add the PCU export or choose to continue without it.' : 'Run Claude’s input check to continue.'))),
    S.mapOk ? 'Mapping confirmed — Claude can extract.' : 'Confirm the mapping to let Claude extract.',
    extracting ? 'Claude is extracting…' : reviewedCount + ' of 7 project cards reviewed.',
    answered + ' of 11 answers recorded — unanswered questions stay as gaps.',
    resolved === CONFLICT_COUNT ? 'All 8 conflicts resolved.' : resolved + ' of 8 conflicts resolved — pick a value for each.',
    approvedN + ' of 7 statuses approved · ' + respN + ' of 6 responsibilities set · ' + stagesN + ' of 7 progress values.',
    S.ok ? (nextDoneCount === 4 ? 'Refresh complete.' : 'Approved — ' + left + ' next action' + (left === 1 ? '' : 's') + ' left.') : (resolved < CONFLICT_COUNT ? 'Resolve all conflicts before approving.' : (openItems.length ? ckDone + ' of 11 checks done — ' + openItems.length + ' open item' + (openItems.length === 1 ? '' : 's') + ' will stay yellow.' : 'All checks done — review the output, then approve.')),
  ];
  const nextBlocked = (step === 2 && (S.checkState !== 'done' || !F.evidence)) || (step === 3 && !S.mapOk) || (step === 4 && extracting) || (step === 6 && resolved < CONFLICT_COUNT);
  const claudeBusy = S.checkState === 'running' || extracting;
  return {
    showBack: step > 1, showNext: step < 8, nextBlocked, nextLabel: NEXT_LABELS[step - 1] + ' →',
    barMsg: msgs[step - 1], barDot: claudeBusy ? 'background: #2F5BFF;' : 'background: #C9A227;',
  };
}

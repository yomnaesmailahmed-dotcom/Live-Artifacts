// Builds every {{ binding }} the Main.dc.html template reads, from the store snapshot `S`.
import { buildNavigation } from './navigation.js';
import { buildStartInputs } from './step-start-inputs.js';
import { buildMappingProposal } from './step-mapping-proposal.js';
import { buildQuestions, buildConflicts } from './step-questions-conflicts.js';
import { buildDelays } from './step-delays.js';
import { buildOutput } from './step-output.js';
import { buildFooter } from './footer.js';
import { buildAccount } from './account.js';

export function buildViewModel(S, act) {
  const nav = buildNavigation(S, act);
  const inputs = buildStartInputs(S, act);
  const proposal = buildMappingProposal(S, act);
  const questions = buildQuestions(S, act);
  const conflicts = buildConflicts(S, act);
  const delays = buildDelays(S, act, conflicts.pick);
  const output = buildOutput(S, act, { ...conflicts, ...delays });
  const footer = buildFooter(S, { ...nav, ...proposal, ...questions, ...conflicts, ...delays, ...output });
  const account = buildAccount(S, act);

  return {
    ...nav, ...inputs, ...proposal, ...questions,
    conflicts: conflicts.conflicts, resolved: conflicts.resolved, allResolved: conflicts.allResolved,
    delays: delays.delays,
    ...output,
    openItems: output.openItems.length ? output.openItems : ['None — every check is done.'],
    ...footer, ...account,
  };
}

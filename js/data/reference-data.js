// Static reference content for the 26 Sep 2026 refresh (PMO dashboard 20 Sep, submissions schedule 19 Sep).
// Nothing here is user data — user decisions live in Supabase (public.run_decisions).

export const PROJECT_COUNT = 7;
export const CONFLICT_COUNT = 8;
export const QUESTION_COUNT = 11;
export const CHECKLIST_COUNT = 11;
export const RESPONSIBILITY_COUNT = 6;

// [label, who, dot token key]
export const STEP_DEFS = [
  ['Start', 'You', 'you'],
  ['Inputs', 'You + Claude', 'both'],
  ['Mapping', 'Your review', 'you'],
  ['Proposal', 'Claude', 'claude'],
  ['DM questions', 'You', 'you'],
  ['Conflicts', 'Your decision', 'you'],
  ['Delays & status', 'Your decision', 'you'],
  ['Output', 'Your approval', 'you'],
];

export const STEP_INFOS = [
  { title: 'Start a refresh', badge: 'YOU', badgeClass: 'chip-you', lede: 'Set the comparison dates and choose which projects this run covers.', provide: 'Last update date, report date and scope.', ai: 'Nothing yet.', produces: '—', decide: 'Which projects this run covers.' },
  { title: 'Upload inputs', badge: 'YOU + CLAUDE', badgeClass: 'chip', lede: 'Add the files Claude reads from. Claude checks them before anything is extracted.', provide: 'Current summary Excel, PCU hours export, NHC emails exported from the project folders.', ai: 'Checks every input, lists what is missing and warns when evidence is older than the summary.', produces: 'An input check with warnings.', decide: 'Whether to continue with missing inputs.' },
  { title: 'Confirm mapping', badge: 'YOUR REVIEW', badgeClass: 'chip-you', lede: 'Check how Claude matched the evidence to your projects before it extracts anything.', provide: 'Nothing new.', ai: 'Matches evidence to projects by name and reads the PCU column layout.', produces: 'A project mapping and the PCU column reading.', decide: 'Confirm or correct the mapping.' },
  { title: 'Change proposal', badge: 'CLAUDE', badgeClass: 'chip-ai', lede: 'Claude proposes what changed since the last update. Every value shows its source; gaps stay open.', provide: 'Nothing new.', ai: 'Extracts submissions, client responses, client promises and change requests, and proposes changes with a source for each.', produces: 'One card per project: current vs proposed value, source, flags and open gaps.', decide: 'Review every project card.' },
  { title: 'DM questions', badge: 'YOU', badgeClass: 'chip-you', lede: 'Take these questions to your face-to-face DM conversations and note the answers here as your record. Conflicts are settled on the next step.', provide: 'Answers from your DM conversations.', ai: 'Drafts a short question list per DM from the gaps and conflicts only.', produces: 'Question lists for Mohamed Hussein and Ahmed Nasr.', decide: 'What each DM confirms.' },
  { title: 'Resolve conflicts', badge: 'YOUR DECISION', badgeClass: 'chip-you', lede: 'Where sources disagree, Claude shows both values. Pick the right one for each.', provide: 'Your choice for each conflict.', ai: 'Lists every disagreement between sources with both values side by side.', produces: 'A conflict list. Claude never picks a value.', decide: 'Which value is right — for every conflict.' },
  { title: 'Delays & status', badge: 'YOUR DECISION', badgeClass: 'chip-you', lede: 'Approve each status, set responsibility and confirm stages in scope. Claude has drafted the rest.', provide: 'Responsibility, stages in scope and the final wording.', ai: 'Builds dated delay chronologies, drafts delay wording and proposes a status with a reason.', produces: 'Chronologies, draft wording, proposed statuses and calculated progress.', decide: 'Delay responsibility, final status and wording.' },
  { title: 'Review & output', badge: 'YOUR APPROVAL', badgeClass: 'chip-you', lede: 'Check the final Excel and briefing notes. Nothing leaves this tool until you approve.', provide: 'Your final approval.', ai: 'Builds the Excel and the briefing notes and runs the final checklist.', produces: 'COO Summary Excel (2 sheets) and briefing notes for the verbal brief.', decide: 'Approve, then save to OneDrive and brief the COO yourself.' },
];

export const NEXT_LABELS = ['Start refresh', 'Continue to mapping', 'Run Claude extraction', 'Continue to DM questions', 'Continue to conflicts', 'Continue to delays & status', 'Build output', ''];

export const INPUT_SLOTS = [
  { k: 'summary', title: 'Current summary Excel', file: 'NHC_PMO_Dashboard_v3.xlsx · 20 Sep 2026', emptyDetail: 'The summary you last updated' },
  { k: 'evidence', title: 'Project evidence', file: 'NHC_Master_schedule_Sep_2026 · Submission Log · 19 Sep 2026', emptyDetail: 'Exported NHC emails or the submission log' },
];

export const MAPPING = [
  { a: 'P01', name: 'Ubayya (Heights & Elite)', b: 'P01', note: 'Same ID' },
  { a: 'P02', name: 'Taraf-Khuzam 03 Zone 06', b: 'P02', note: 'Same ID' },
  { a: 'P03', name: 'Rehab Al-Dar', b: 'P03', note: 'Same ID' },
  { a: 'P08', name: 'Commercial Group 03', b: 'P10', note: 'Matched by name' },
  { a: 'P09', name: 'Al Azaziyah Sales Center', b: 'P11', note: 'Matched by name' },
  { a: 'P10', name: 'Sadayem Central Park', b: 'P12', note: 'Matched by name' },
  { a: 'P11', name: 'Lazurd Mosques', b: 'P13', note: 'Matched by name' },
];

// k: '' confirmed · 'c' changed · 'n' needs input
export const PROPOSALS = [
  { id: 'P01', dmk: 'm', name: 'Ubayya (Heights & Elite)', dm: 'Mohamed Hussein', ptm: 'Mahitab Mohamed', flags: ['104% OF BUDGET', '7/12 PENDING CLIENT'], rows: [
    { f: 'Last submission', cur: '16 Sep 2026 · Rev 07', prop: 'Confirmed — Elite Plot 2 Landscape, 2 private-garden options', src: 'Submission Log · S0008', k: '' },
    { f: 'Next submission', cur: '—', prop: 'IFT Elite Plot 3: 30 Sep 2026 · IFC Heights P1 & P6: 5 working days after client approval', src: 'Schedule · Tracker', k: 'c' },
    { f: 'Consumed hours', cur: '74,403 of 71,432', prop: '[needed from PCU]', src: 'No PCU export', k: 'n' }] },
  { id: 'P02', dmk: 'm', name: 'Taraf-Khuzam 03 Zone 06', dm: 'Mohamed Hussein', ptm: 'Mahitab Mohamed', flags: ['3 ON HOLD', 'CONFLICT'], rows: [
    { f: 'Last submission', cur: '15 Sep 2026 · Rev 00', prop: 'Confirmed — Villas, 3 options; client to choose from column study', src: 'Submission Log · S0035', k: '' },
    { f: 'Next submission', cur: '—', prop: 'Villas: 28 Sep 2026 vs 3 working days after DM NTP', src: 'Schedule · Tracker', k: 'n' },
    { f: 'On hold', cur: '—', prop: 'Mosque, Masterplan Validation, Clubhouse — reason needed', src: 'Dashboard · Components', k: 'n' }] },
  { id: 'P03', dmk: 'm', name: 'Rehab Al-Dar', dm: 'Mohamed Hussein', ptm: 'Mohamed Hashem', flags: ['CONFLICT'], rows: [
    { f: 'Current stage', cur: 'Pre-Concept', prop: 'Buildings: Etmam Package Rev 01 · Landscape: Schematic', src: 'Schedule · Tracker', k: 'n' },
    { f: 'Next submission', cur: '—', prop: 'Etmam Rev 02 & Landscape SD Rev 00 after client confirms concept', src: 'Schedule · Tracker', k: 'c' }] },
  { id: 'P08', dmk: 'a', name: 'Commercial Group 03', dm: 'Ahmed Nasr', ptm: 'Ahmed Saudi', flags: ['POSSIBLY OVERDUE', 'CONFLICT'], rows: [
    { f: 'Last submission', cur: '10 Sep 2026', prop: 'Confirmed — 5 of 7 plots', src: 'Submission Log', k: '' },
    { f: 'Next submission', cur: '—', prop: 'Tender (LOD 200): 24 Sep vs 23 Sep 2026 — overdue unless submitted', src: 'Dashboard · Schedule', k: 'n' }] },
  { id: 'P09', dmk: 'a', name: 'Al Azaziyah Sales Center', dm: 'Ahmed Nasr', ptm: 'Mohamed Abdelhalim', flags: ['LANDSCAPE ON HOLD', 'CONFLICT'], rows: [
    { f: 'Current stage', cur: 'Pre-Concept', prop: 'Concept Design (building)', src: 'Schedule · Tracker', k: 'n' },
    { f: 'Next submission', cur: '—', prop: 'IFT building: 27 Sep–4 Oct 2026 vs after DM NTP', src: 'Schedule · Tracker', k: 'n' },
    { f: 'Landscape', cur: '—', prop: 'On hold since 22 Jul 2026 — reason needed', src: 'Delay log · D005', k: 'n' }] },
  { id: 'P10', dmk: 'a', name: 'Sadayem Central Park', dm: 'Ahmed Nasr', ptm: '[needed]', flags: ['NO SUBMISSION 26 DAYS'], rows: [
    { f: 'Last submission', cur: '31 Aug 2026 · Rev 04', prop: 'Confirmed — studies & sketches', src: 'Submission Log', k: '' },
    { f: 'Next submission', cur: '—', prop: '[needed from Ahmed]', src: 'Not in either file', k: 'n' }] },
  { id: 'P11', dmk: 'a', name: 'Lazurd Mosques', dm: 'Ahmed Nasr', ptm: 'Mohamed Abdelhalim', flags: ['POSSIBLY OVERDUE', 'CONFLICT'], rows: [
    { f: 'Last submission', cur: '15 Sep 2026', prop: 'Confirmed — M21 IFT Validation', src: 'Submission Log', k: '' },
    { f: 'Next submission', cur: '—', prop: 'MOIA reports after validation approval · M03 & M19 validation planned 17 Sep 2026', src: 'Dashboard · Tracker', k: 'c' },
    { f: 'Open items', cur: '—', prop: 'Allocation (30 Jul), elevations & MOIA 8 plots (13 Aug), landscape (20 Aug) — reason needed', src: 'Submission Log · planned', k: 'n' }] },
];

export const PROPOSAL_FILTERS = [['all', 'ALL · 7'], ['m', 'MOHAMED HUSSEIN · 3'], ['a', 'AHMED NASR · 4']];

export const DM_QUESTIONS = [
  { dm: 'Mohamed Hussein', count: '5 QUESTIONS', qs: [
    'Rehab Al-Dar: what is the current stage of Buildings and of Landscape?',
    'Taraf Villas: is the next submission 28 Sep, or 3 working days after NTP? Has NTP been given?',
    'Taraf Mosque IFT: 22 Oct, or 22 working days after client approval?',
    'Taraf: why are the Mosque, Masterplan Validation and Clubhouse on hold?',
    'Ubayya: are Elite Plot 3 (30 Sep), Heights Plot 5 (6–7 Oct) and Elite Plot 4 (8 Oct) still valid?'] },
  { dm: 'Ahmed Nasr', count: '6 QUESTIONS', qs: [
    'Commercial Group 03: was the tender submitted on 23 or 24 Sep? 7 plots plus Qumrah, or 9?',
    'Sales Center: what is the building’s current stage? Has NTP been given for IFT?',
    'Sales Center: why is Landscape on hold? Does the mosque now sit only under Lazurd?',
    'Sadayem Central Park: what is the next submission, and is it on hold or delayed?',
    'Lazurd: were M03 and M19 validation submitted on 17 Sep? 7 or 8 mosques in scope?',
    'Lazurd: status of the Jul–Aug items — allocation, elevations, MOIA report for 8 plots, landscape?'] },
];

export const CONFLICTS = [
  { k: 'c1', project: 'Rehab Al-Dar', field: 'Current stage', a: 'Pre-Concept', srcA: 'Dashboard v3', b: 'Buildings: Etmam Rev 01 · Landscape: Schematic', srcB: 'Schedule · Tracker' },
  { k: 'c2', project: 'Taraf', field: 'Villas next submission', a: '28 Sep 2026', srcA: 'Tracker · expected finish', b: '3 working days after DM NTP', srcB: 'Tracker · note' },
  { k: 'c3', project: 'Commercial Group 03', field: 'Tender date', a: '24 Sep 2026', srcA: 'Dashboard v3 · planned', b: '23 Sep 2026', srcB: 'Tracker · expected finish' },
  { k: 'c4', project: 'Sales Center', field: 'Building stage', a: 'Pre-Concept', srcA: 'Dashboard v3', b: 'Concept Design', srcB: 'Schedule · Tracker' },
  { k: 'c5', project: 'Sales Center', field: 'IFT building', a: '27 Sep–4 Oct 2026', srcA: 'Tracker · dates', b: 'After DM NTP', srcB: 'Tracker · note' },
  { k: 'c6', project: 'Sadayem Central Park', field: 'Status', a: 'Delayed', srcA: 'Dashboard v3', b: 'On Hold', srcB: 'Your interview notes' },
  { k: 'c7', project: 'Lazurd Mosques', field: 'M03 & M19 validation', a: '17 Sep 2026 (planned)', srcA: 'Dashboard v3 · planned', b: 'After client approval of concept', srcB: 'Tracker · note' },
  { k: 'c8', project: 'Lazurd Mosques', field: 'Mosques in scope', a: '8 (5 local + 3 Jami)', srcA: 'Dashboard v3 · scope', b: '7', srcB: 'Dashboard v3 · components' },
];

// statusFromConflict: the proposed status follows the user's pick on that conflict (Sadayem: Delayed vs On Hold).
export const DELAYS = [
  { id: 'P01', name: 'Ubayya (Heights & Elite)', status: 'Delayed', reason: 'consumed hours at 104% of budget; IFC depends on client approval.',
    chron: [['26 Aug 2026', 'Buildings Rev 07 / Rev 06 submitted (Heights Plots 1, 5, 6)', 'S0003–S0005'], ['02 Sep 2026', 'Elite Plot 2 Buildings IFT Rev 06 submitted', 'S0006'], ['11 Sep 2026', 'Heights Plot 1 Landscape Rev 08 submitted', 'S0007'], ['16 Sep 2026', 'Elite Plot 2 Landscape: 2 private-garden options submitted', 'S0008']],
    wording: 'IFC for Heights Plots 1 & 6 and Elite Plot 2 is pending client approval; Elite Plot 2 waits on the private-garden decision (2 options submitted 16 Sep 2026).' },
  { id: 'P02', name: 'Taraf-Khuzam 03 Zone 06', status: 'Delayed', reason: 'baseline finish 31 Aug 2025 has passed.',
    chron: [['13 Nov 2025', 'Mosque & Club House Rev 00 submitted', 'S0010'], ['15 Sep 2026', 'Villas Rev 00 submitted with 3 options', 'S0035'], ['Open', 'DM asked the PTM to hold pending client response', 'Delay log · D004']],
    wording: 'Villas Rev 00 submitted 15 Sep 2026 with 3 options; waiting for the client to choose from the column study. Mosque, Masterplan Validation and Clubhouse on hold.' },
  { id: 'P08', name: 'Commercial Group 03', status: 'Delayed', reason: 'baseline finish 13 Aug 2026 has passed; tender date passed.',
    chron: [['10 Sep 2026', 'Submission covering 5 of 7 plots', 'Submission Log'], ['23 Sep 2026', 'Tender expected finish', 'Tracker'], ['24 Sep 2026', 'Tender planned', 'Dashboard v3']],
    wording: 'The 10 Sep 2026 submission covered 5 of 7 plots; the tender submission planned for 23–24 Sep 2026 is not recorded as submitted.' },
  { id: 'P09', name: 'Al Azaziyah Sales Center', status: 'Delayed', reason: 'landscape on hold since 22 Jul 2026; building IFT waits for NTP.',
    chron: [['22 Jul 2026', 'Landscape concept report 100% submitted', 'D005'], ['10 Aug 2026', 'DM reminder sent', 'D005'], ['11 Sep 2026', 'New pre-concept submitted (building & gate)', 'Submission Log']],
    wording: 'Landscape concept submitted 22 Jul 2026; DM reminder sent 10 Aug 2026; no client response recorded. Building IFT follows DM NTP.' },
  { id: 'P10', name: 'Sadayem Central Park', status: 'Delayed', statusFromConflict: 'c6', reason: 'baseline finish 30 Jun 2026 has passed; no submission since 31 Aug 2026.',
    chron: [['30 Jun 2026', 'Baseline finish', 'Dashboard v3'], ['31 Aug 2026', 'Studies & sketches Rev 04 submitted', 'Submission Log']],
    wording: 'Studies and sketches Rev 04 submitted 31 Aug 2026; no later submission and no next date recorded.' },
  { id: 'P11', name: 'Lazurd Mosques', status: 'Delayed', reason: 'items planned Jul–Sep 2026 are still open.',
    chron: [['30 Jul 2026', 'Mosques allocation planned', 'Submission Log · planned'], ['13 Aug 2026', 'Elevations and MOIA report for 8 plots planned', 'Submission Log · planned'], ['15 Sep 2026', 'M21 IFT validation submitted', 'Submission Log'], ['17 Sep 2026', 'M03 & M19 validation planned', 'Dashboard v3']],
    wording: 'M21 IFT validation submitted 15 Sep 2026; M03 and M19 validation planned 17 Sep 2026; allocation, elevations, MOIA report and landscape items planned Jul–Aug remain open.' },
  { id: 'P03', name: 'Rehab Al-Dar', status: 'On Track', reason: 'baseline finish 15 Oct 2026; last submission 8 Sep 2026.',
    chron: [['08 Sep 2026', 'Buildings submitted', 'Submission Log'], ['15 Oct 2026', 'Baseline finish', 'Dashboard v3']],
    wording: 'No delay recorded. Next submissions follow client confirmation of the concept.' },
];

export const BRIEFING_NOTES = [
  'Portfolio: 7 projects in scope; 107,881 of 135,871 budget hours consumed (79.4%), unconfirmed until the PCU export.',
  'Budget pressure: Ubayya / El Furan has consumed 104% of its budget with IFC still to come.',
  'Possibly overdue: Commercial Group 03 tender (23–24 Sep); Lazurd M03 and M19 validation (17 Sep).',
  'Waiting on NHC: Ubayya IFC packages, Rehab Al-Dar concept confirmation, Lazurd MOIA reports.',
  'On hold — reason needed: Taraf Mosque, Masterplan Validation and Clubhouse; Sales Center Landscape (since 22 Jul).',
  'Decisions needed: delay responsibility on every delayed project.',
];

export const NEXT_ACTIONS = [
  { k: 'dl', t: 'Download the Excel', sub: 'NHC_COO_Executive_Summary_26-Sep-2026.xlsx · 2 sheets', todo: 'Download', done: 'Downloaded' },
  { k: 'copy', t: 'Copy the briefing notes', sub: 'For your or the AM’s verbal brief', todo: 'Copy notes', done: 'Copied' },
  { k: 'od', t: 'Save to OneDrive', sub: 'You do this yourself — nothing uploads from here', todo: 'Mark done', done: 'Saved' },
  { k: 'coo', t: 'Brief the COO', sub: 'You or the AM, from the notes', todo: 'Mark done', done: 'Briefed' },
];

// node tests/mail.test.mjs — Phase 5 Outlook scan rules (keyword filter, thread split, Claude answer → candidate).
import { matchKeywords, splitThread, htmlToText, bodyText, parseAnalysis, candidateRow, buildUserPrompt, safeReturnTo, ANALYSIS_SCHEMA } from '../supabase/functions/mail-scan/rules.ts';
import { candidateToVo, candidateView } from '../js/domain/mail.js';

let failed = 0;
const assert = (c, msg) => { console.log(c ? 'ok  ' : 'FAIL', msg); if (!c) failed++; };

const KW = ['revise', 'additional', 'change', 'add', 'new requirement', 'instead of', 'تعديل'];
assert(matchKeywords('Please CHANGES the façade', KW).join() === 'change', 'case-insensitive, word-start match');
assert(matchKeywords('We need an additional option', KW).join() === 'additional,add', 'prefix keywords both match');
assert(matchKeywords('the exchange rate', KW).length === 0, 'no match inside a word');
assert(matchKeywords('a new   requirement from the authority', KW).join() === 'new requirement', 'multi-word keyword across spaces');
assert(matchKeywords('نرجو التعديل على المخطط', ['تعديل']).length === 0 && matchKeywords('نرجو تعديل المخطط', ['تعديل']).join() === 'تعديل', 'Arabic keyword at a word start');
assert(matchKeywords('Use stone instead of GRC', ['instead of', '', '  ']).join() === 'instead of', 'blank keywords ignored');

const thread = 'Dear team,\nPlease add a third option for Plot 4.\nRegards\n\nFrom: Ahmed <a@client.sa>\nSent: Sunday\nTo: PM\nSubject: RE: options\n\nOld text that says change everything';
const t = splitThread(thread);
assert(/third option/.test(t.latest) && !/Old text/.test(t.latest) && /Old text/.test(t.earlier), 'reply history split from the latest message');
assert(splitThread('On Mon, 5 Oct 2026 at 10:00, Sara wrote:\nquoted').earlier === '', 'a header at the very start is not a cut');
assert(splitThread('Agreed.\n\nOn Mon, 5 Oct 2026 at 10:00, Sara wrote:\nquoted').latest === 'Agreed.', '"On … wrote:" separator');
assert(splitThread('Hi\n-----Original Message-----\nold').earlier.includes('old'), 'Original Message separator');
assert(htmlToText('<p>Hello&nbsp;<b>there</b></p><style>x{}</style><div>Add a room</div>') === 'Hello there\nAdd a room', 'HTML stripped to text');
assert(bodyText({ body: { contentType: 'html', content: '<p>A</p>' } }) === 'A' && bodyText({ bodyPreview: ' prev ' }) === 'prev', 'body text from HTML or preview');

const dels = [{ id: 'd-1', title: 'Concept report', phase: 'Concept' }, { id: 'd-2', title: 'Massing options' }];
const prompt = buildUserPrompt({ id: 'p', code: 'P01', name: 'Ubayya', scope_summary: 'Masterplan' }, dels, { id: 'm', subject: 'Options', from: { emailAddress: { name: 'Ahmed', address: 'a@client.sa' } } }, 'Add a third option', '', ['add']);
assert(/D2 {2}Massing options/.test(prompt) && /<latest_message>\nAdd a third option/.test(prompt) && !/earlier_in_thread/.test(prompt), 'prompt lists deliverables by reference and the latest message');
assert(ANALYSIS_SCHEMA.additionalProperties === false && ANALYSIS_SCHEMA.required.length === Object.keys(ANALYSIS_SCHEMA.properties).length, 'schema: every property required, no extras');

const a = parseAnalysis(JSON.stringify({ is_change: true, confidence: 'weird', summary: ' Third option for Plot 4 ', quote: 'Please add a third option', deliverable_ref: 'd2', time_impact_days: 6.6, hours_impact: -3, reason: 'New scope' }));
assert(a && a.confidence === 'medium' && a.summary === 'Third option for Plot 4' && a.time_impact_days === 7 && a.hours_impact === null, 'analysis normalised (confidence, rounding, negative hours)');
assert(parseAnalysis('not json') === null && parseAnalysis('{"summary":"x"}') === null, 'invalid answers rejected');

const m = { id: 'AAMk1', internetMessageId: '<abc@client.sa>', subject: 'RE: options', receivedDateTime: '2026-10-15T08:00:00Z', webLink: 'https://outlook.office365.com/owa/?ItemID=1', from: { emailAddress: { name: 'Ahmed', address: 'a@client.sa' } } };
const row = candidateRow({ projectId: 'p', folderRowId: 'f', connectionId: 'c', m, analysis: a, deliverables: dels, keywords: ['add'], model: 'claude-opus-5-5' });
assert(row.deliverable_id === 'd-2' && row.dedupe_key === '<abc@client.sa>' && row.status === 'new' && row.from_address === 'a@client.sa', 'candidate row links D2 and dedupes on internetMessageId');
assert(candidateRow({ projectId: 'p', folderRowId: 'f', connectionId: 'c', m: { ...m, webLink: 'javascript:alert(1)', internetMessageId: '' }, analysis: { ...a, deliverable_ref: 'D9' }, deliverables: dels, keywords: [], model: '' }).web_link === '', 'unsafe link dropped, unknown deliverable ref → none');

assert(safeReturnTo('https://yomnaesmailahmed-dotcom.github.io/summary-refresh/Project.dc.html?id=1#variations').endsWith('#variations'), 'return to the app');
assert(safeReturnTo('https://evil.example/x').startsWith('https://yomnaesmailahmed-dotcom.github.io/summary-refresh/') && safeReturnTo('https://yomnaesmailahmed-dotcom.github.io/other/').includes('/summary-refresh/'), 'foreign return URLs refused');
assert(safeReturnTo('http://localhost:5517/Project.dc.html').startsWith('http://localhost:5517/'), 'localhost allowed for testing');
assert(safeReturnTo('https://yomnaesmailahmed-dotcom.github.io/Live-Artifacts/Project.dc.html?id=1').includes('/Live-Artifacts/Project.dc.html'), 'second copy of the site (Live-Artifacts) allowed');

// client side: candidate → draft VO
const cand = { id: 'k1', project_id: 'p', summary: 'Third option for Plot 4', quote: 'Please add a third option', reason: 'New scope', from_name: 'Ahmed', from_address: 'a@client.sa', subject: 'RE: options', received_at: '2026-10-15T08:00:00Z', web_link: 'https://outlook.office365.com/x', deliverable_id: 'd-2', time_impact_days: 7, hours_impact: 40, confidence: 'high', matched_keywords: ['add'], status: 'new' };
const vo = candidateToVo(cand);
assert(vo.status === 'draft' && vo.trigger_source === 'email_scan' && vo.direction === 'external' && vo.email_received_on === '2026-10-15' && vo.email_from === 'Ahmed <a@client.sa>' && vo.hours_impact === 40 && vo.deliverable_id === 'd-2', 'accepted candidate becomes a draft external VO with the email evidence');
const cv = candidateView(cand);
assert(cv.from === 'Ahmed <a@client.sa>' && /high/i.test(cv.confidenceLabel) && cv.impact === '+7 days · 40 h', 'candidate card text');

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);

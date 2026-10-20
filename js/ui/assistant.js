// "Ask" assistant: a floating panel on every page. Questions go to the `ask` Edge Function, which answers only from
// data the signed-in user can already see. Built with plain DOM so it works the same on every page.
import { getSupabase } from '../lib/supabase-client.js';

const PROJECT_ID = () => {
  if (!/Project\.dc\.html$/i.test(window.location.pathname)) return '';
  const id = new URLSearchParams(window.location.search).get('id') || '';
  return /^[0-9a-f-]{36}$/i.test(id) ? id : '';
};

const SUGGEST_ALL = ['Which projects are delayed and why?', 'What is due in the next 14 days?', 'Which projects have burned more hours than they have delivered?', 'Which clients owe us approvals?'];
const SUGGEST_ONE = ['Summarise this project in five lines.', 'What is late or at risk?', 'What is waiting on the client?', 'How are fee, invoicing and cost tracking?'];

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

async function askServer(sb, body) {
  const { data, error } = await sb.functions.invoke('ask', { body });
  if (error) {
    let msg = error.message || 'The helper could not be reached.';
    try { const b = await error.context.json(); if (b && b.error) msg = b.error; } catch (_) { /* not JSON */ }
    if (/Failed to send a request|FunctionsFetchError/i.test(msg)) msg = 'The AI helper is not reachable yet (not deployed?).';
    throw new Error(msg);
  }
  return data || {};
}

export function mountAssistant() {
  if (document.getElementById('ai-root') || typeof document === 'undefined') return;
  const root = el('div', 'ai-root'); root.id = 'ai-root'; root.hidden = true;
  const fab = el('button', 'ai-fab', 'Ask AI'); fab.type = 'button'; fab.setAttribute('aria-expanded', 'false');
  const panel = el('section', 'ai-panel'); panel.hidden = true; panel.setAttribute('aria-label', 'AI helper');
  const head = el('div', 'ai-head');
  const title = el('div', 'ai-title', 'Ask about your projects');
  const scope = el('div', 'ai-scope', '');
  const close = el('button', 'ai-x', '×'); close.type = 'button'; close.setAttribute('aria-label', 'Close');
  const clear = el('button', 'ai-clear', 'New chat'); clear.type = 'button';
  const titles = el('div'); titles.append(title, scope);
  const tools = el('div', 'ai-tools'); tools.append(clear, close);
  head.append(titles, tools);
  const log = el('div', 'ai-log'); log.setAttribute('role', 'log'); log.setAttribute('aria-live', 'polite');
  const sug = el('div', 'ai-sug');
  const form = el('form', 'ai-form');
  const input = el('textarea', 'ai-input'); input.rows = 2; input.placeholder = 'e.g. Which projects are at risk this month?'; input.maxLength = 2000;
  const send = el('button', 'ai-send', 'Send'); send.type = 'submit';
  form.append(input, send);
  const note = el('div', 'ai-note', 'Answers use only the projects you can see. Check important figures in the workspace.');
  panel.append(head, log, sug, form, note);
  root.append(fab, panel);
  document.body.appendChild(root);

  let history = [];
  let busy = false;
  let sb = null;

  const bubble = (role, text) => { const b = el('div', `ai-msg ai-${role}`, text); log.appendChild(b); log.scrollTop = log.scrollHeight; return b; };
  function suggestions() {
    sug.replaceChildren();
    if (history.length) return;
    (PROJECT_ID() ? SUGGEST_ONE : SUGGEST_ALL).forEach((q) => {
      const b = el('button', 'ai-chip', q); b.type = 'button';
      b.addEventListener('click', () => ask(q));
      sug.appendChild(b);
    });
  }
  function reset() {
    history = []; log.replaceChildren();
    bubble('bot', PROJECT_ID() ? 'Ask me about this project — deliverables, hours, fees, what is late, what the client still owes.' : 'Ask me about your projects — status, deadlines, hours, fees, client approvals.');
    scope.textContent = PROJECT_ID() ? 'This project, with the others for comparison' : 'All projects you can see';
    suggestions();
  }

  async function ask(question) {
    const q = String(question || '').trim();
    if (!q || busy || !sb) return;
    busy = true; send.disabled = true; input.value = '';
    bubble('me', q);
    const wait = bubble('bot', 'Thinking…'); wait.classList.add('ai-wait');
    sug.replaceChildren();
    try {
      const r = await askServer(sb, { question: q, project_id: PROJECT_ID() || undefined, history });
      wait.textContent = r.answer; wait.classList.remove('ai-wait');
      history.push({ role: 'user', content: q }, { role: 'assistant', content: r.answer });
    } catch (e) {
      wait.textContent = e.message; wait.classList.remove('ai-wait'); wait.classList.add('ai-err');
    }
    busy = false; send.disabled = false; log.scrollTop = log.scrollHeight; input.focus();
  }

  const toggle = (open) => {
    panel.hidden = !open; fab.setAttribute('aria-expanded', String(open)); fab.hidden = open;
    if (open) { if (!log.childElementCount) reset(); input.focus(); }
  };
  fab.addEventListener('click', () => toggle(true));
  close.addEventListener('click', () => toggle(false));
  clear.addEventListener('click', reset);
  form.addEventListener('submit', (e) => { e.preventDefault(); ask(input.value); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input.value); } });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) toggle(false); });

  // Only for signed-in people.
  getSupabase().then((client) => {
    sb = client;
    const show = (session) => { root.hidden = !session; if (!session) { toggle(false); history = []; log.replaceChildren(); } };
    client.auth.getSession().then(({ data }) => show(data.session));
    client.auth.onAuthStateChange((_e, session) => show(session));
  }).catch(() => { /* offline: no assistant */ });
}

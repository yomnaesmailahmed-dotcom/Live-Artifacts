// Calls to the mail-scan Edge Function (Outlook connect, folders, scan now). supabase-js sends the user's JWT.
import { errMsg } from '../lib/store.js';
import { returnUrl } from '../domain/mail.js';

async function call(sb, action, extra = {}) {
  const { data, error } = await sb.functions.invoke('mail-scan', { body: { action, ...extra } });
  if (error) {
    let msg = errMsg(error);
    try { const body = await error.context.json(); if (body && body.error) msg = body.error; } catch (_) { /* not JSON */ }
    if (/Failed to send a request|FunctionsFetchError/i.test(msg)) msg = 'The mail-scan function isn’t reachable yet (not deployed?).';
    throw new Error(msg);
  }
  return data || {};
}

export const mailStatus = (sb) => call(sb, 'status');
export const mailFolders = (sb) => call(sb, 'folders');
export const scanNow = (sb, projectId) => call(sb, 'scan', projectId ? { project_id: projectId } : {});

export async function connectOutlook(sb) {
  const { url } = await call(sb, 'connect', { return_to: returnUrl(window.location.href) });
  if (!url) throw new Error('No sign-in address came back from the mail-scan function.');
  window.location.href = url;
}

// After Microsoft sends the person back: read ?outlook=connected|error and tidy the address bar.
export function takeOutlookReturn() {
  const u = new URL(window.location.href);
  const result = u.searchParams.get('outlook');
  if (!result) return null;
  const reason = u.searchParams.get('reason') || '';
  try { window.history.replaceState(window.history.state, '', returnUrl(u.toString())); } catch (_) { /* ignore */ }
  return result === 'connected' ? { ok: true, msg: 'Outlook connected. Pick the folders to scan for this project.' } : { ok: false, msg: `Outlook wasn’t connected: ${reason || 'unknown error'}` };
}

export function scanSummary(r) {
  if (r.skipped) return r.skipped;
  const base = `Scanned ${r.folders || 0} folder${r.folders === 1 ? '' : 's'}: ${r.messages || 0} new email${r.messages === 1 ? '' : 's'}, ${r.keyword_hits || 0} with keywords, ${r.candidates || 0} new candidate${r.candidates === 1 ? '' : 's'}.`;
  return r.error ? `${base} ${r.error}` : base;
}

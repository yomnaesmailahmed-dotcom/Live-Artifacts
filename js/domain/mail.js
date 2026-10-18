// Outlook scan (phase 5): candidates found by the mail-scan Edge Function → draft VOs, and their card text.

const CONFIDENCE = { high: 'High confidence', medium: 'Medium confidence', low: 'Low confidence — check the email' };

export const fromLine = (c) => (c.from_name && c.from_address ? `${c.from_name} <${c.from_address}>` : c.from_name || c.from_address || '');

// An accepted candidate becomes a draft external VO carrying the email evidence.
export function candidateToVo(c) {
  return {
    project_id: c.project_id, direction: 'external', trigger_source: 'email_scan', status: 'draft',
    deliverable_id: c.deliverable_id || null,
    title: (c.summary || c.subject || 'Client change (email)').slice(0, 240),
    description: c.reason ? `Outlook scan: ${c.reason}` : '',
    email_from: fromLine(c), email_subject: c.subject || '',
    email_received_on: c.received_at ? String(c.received_at).slice(0, 10) : null,
    email_link: c.web_link || '', email_quote: (c.quote || '').slice(0, 4000),
    time_impact_days: c.time_impact_days ?? null, hours_impact: c.hours_impact ?? null,
  };
}

export function candidateView(c) {
  const parts = [];
  if (c.time_impact_days) parts.push(`${c.time_impact_days > 0 ? '+' : ''}${c.time_impact_days} days`);
  if (c.hours_impact) parts.push(`${c.hours_impact} h`);
  return {
    from: fromLine(c), confidenceLabel: CONFIDENCE[c.confidence] || CONFIDENCE.medium,
    impact: parts.join(' · '), keywords: (c.matched_keywords || []).join(', '),
  };
}

// Where to send Microsoft's sign-in back to: this page, without our own ?outlook=… markers.
export function returnUrl(href) {
  const u = new URL(href);
  u.searchParams.delete('outlook'); u.searchParams.delete('reason');
  return u.toString();
}

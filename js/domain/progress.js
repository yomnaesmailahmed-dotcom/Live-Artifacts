// Budget (money) and completion rules. Mirrors the project_progress view in SQL; client rollups are computed here.

const num = (v) => Number(v) || 0;
const r1 = (n) => Math.round(n * 10) / 10;

export function fmtMoney(n, currency = '') {
  if (n === null || n === undefined || n === '' || Number.isNaN(Number(n))) return '—';
  const s = Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
  return currency ? `${s} ${currency}` : s;
}

export const fmtPct = (n) => (n === null || n === undefined || Number.isNaN(Number(n)) ? '—' : `${r1(Number(n))}%`);

// Money figures for one project from its progress row (project_progress) and metrics row (project_metrics).
export function moneyFigures(pr, m) {
  pr = pr || {}; m = m || {};
  const fee = num(pr.fee_total);
  const completion = pr.completion_pct == null ? null : num(pr.completion_pct);
  const approved = pr.approved_pct == null ? null : num(pr.approved_pct);
  const hoursPct = m.consumed_pct == null ? null : num(m.consumed_pct);
  return {
    fee, invoiced: num(pr.invoiced_to_date), cost: num(pr.cost_to_date),
    remaining: fee - num(pr.invoiced_to_date),
    earned: completion == null ? null : fee * completion / 100,           // value of the work delivered so far
    billedPct: fee > 0 ? r1(num(pr.invoiced_to_date) * 100 / fee) : null,
    costPct: fee > 0 ? r1(num(pr.cost_to_date) * 100 / fee) : null,
    margin: fee > 0 ? fee - num(pr.cost_to_date) : null,
    completion, approved,
    // delivered but not yet approved by the client (points) and burn vs. delivery (points; > 0 = hours ahead of delivery)
    awaitingGap: completion == null || approved == null ? null : r1(completion - approved),
    burnGap: completion == null || hoursPct == null ? null : r1(hoursPct - completion),
    // invoiced ahead of (+) or behind (−) the value delivered
    billingGap: pr.completion_pct == null || fee <= 0 ? null : r1(num(pr.invoiced_to_date) * 100 / fee - completion),
  };
}

// Group projects by client. Money only adds up within one currency; otherwise the client shows "mixed".
// Completion / approved % are weighted by fee when fees exist, else by budget hours, else equally.
export function clientRollup(projects, clients, progressByProject, metricsByProject) {
  const name = Object.fromEntries(clients.map((c) => [c.id, c.name]));
  const groups = new Map();
  for (const p of projects) {
    if (p.archived) continue;
    const key = p.client_id || '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  const rows = [];
  for (const [key, list] of groups) {
    const items = list.map((p) => ({ p, pr: progressByProject[p.id] || {}, m: metricsByProject[p.id] || {} }));
    const currencies = [...new Set(items.map((x) => x.pr.currency || 'SAR'))];
    const currency = currencies.length === 1 ? currencies[0] : '';
    const weight = (x) => num(x.pr.fee_total) || num(x.m.budget_total ?? x.p.budget_hours) || 1;
    const avg = (field) => {
      const have = items.filter((x) => x.pr[field] != null);
      const w = have.reduce((n, x) => n + weight(x), 0);
      return w > 0 ? r1(have.reduce((n, x) => n + num(x.pr[field]) * weight(x), 0) / w) : null;
    };
    const sum = (f) => items.reduce((n, x) => n + num(f(x)), 0);
    const fee = sum((x) => x.pr.fee_total), invoiced = sum((x) => x.pr.invoiced_to_date), cost = sum((x) => x.pr.cost_to_date);
    const budgetH = sum((x) => x.m.budget_total ?? x.p.budget_hours), consumedH = sum((x) => x.m.consumed_hours);
    const completion = avg('completion_pct'), approved = avg('approved_pct');
    rows.push({
      clientId: key, client: name[key] || '— no client —', projects: items.length,
      delayed: items.filter((x) => x.m.status === 'Delayed').length, atRisk: items.filter((x) => x.m.status === 'At Risk').length,
      currency, mixed: currencies.length > 1,
      fee, invoiced, cost, billedPct: fee > 0 && !currencies[1] ? r1(invoiced * 100 / fee) : null,
      budgetH, consumedH, hoursPct: budgetH > 0 ? r1(consumedH * 100 / budgetH) : null,
      completion, approved, awaitingGap: completion == null || approved == null ? null : r1(completion - approved),
    });
  }
  return rows.sort((a, b) => a.client.localeCompare(b.client));
}

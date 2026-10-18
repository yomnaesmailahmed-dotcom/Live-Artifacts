// Display + parsing helpers shared by the workspace view models.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function fmtDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '—';
  return `${String(d).padStart(2, '0')} ${MONTHS[m - 1]} ${y}`;
}

export function fmtHours(n) {
  if (n === null || n === undefined || n === '' || Number.isNaN(Number(n))) return '—';
  return Number(n).toLocaleString('en-US', { maximumFractionDigits: 1 });
}

export const todayIso = () => new Date().toISOString().slice(0, 10);

// Accepts 2026-09-20, 20/09/2026, 20-09-2026, 20 Sep 2026, 20-Sep-26. Returns ISO or null.
export function parseDateLoose(text) {
  const s = String(text || '').trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) return iso(year(+m[3]), +m[2], +m[1]); // day/month/year
  m = s.match(/^(\d{1,2})[\s-]([A-Za-z]{3})[A-Za-z]*[\s-](\d{2,4})$/);
  if (m) {
    const mon = MONTHS.findIndex((x) => x.toLowerCase() === m[2].toLowerCase());
    if (mon >= 0) return iso(year(+m[3]), mon + 1, +m[1]);
  }
  return null;
}

function year(y) { return y < 100 ? 2000 + y : y; }
function iso(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

export function displayName(profile) {
  if (!profile) return '';
  return profile.full_name || (profile.email || '').split('@')[0];
}

export function initials(nameOrEmail) {
  const s = String(nameOrEmail || '?').replace(/@.*/, '').replace(/[._-]+/g, ' ').trim();
  const parts = s.split(/\s+/).filter(Boolean);
  return ((parts[0] || '?')[0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
}

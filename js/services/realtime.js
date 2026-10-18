// Realtime Postgres Changes for one run. The server only delivers rows the user may SELECT (RLS).

export function subscribeToRun(sb, runId, { onRun, onDecision, onStatus }) {
  const channel = sb
    .channel(`run:${runId}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'refresh_runs', filter: `id=eq.${runId}` },
      (payload) => onRun(payload.new))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'run_decisions', filter: `run_id=eq.${runId}` },
      (payload) => onDecision(payload.new))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'run_decisions', filter: `run_id=eq.${runId}` },
      (payload) => onDecision(payload.new))
    .subscribe((status) => onStatus(status));
  return () => { sb.removeChannel(channel); };
}

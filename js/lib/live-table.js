// A Postgres table (or a filtered slice of it) kept in sync both ways:
// loads rows, applies Realtime Postgres Changes, and writes optimistically with
// per-row batching (typing is debounced), pending-edit protection and rollback on error.
// Generalises the sync logic first written in js/state/app-store.js.

import { ORIGIN, newId, errMsg } from './store.js';

const CLICK_MS = 60;
const TYPING_MS = 600;

const encoders = {
  number: (v) => (v === '' || v === null || v === undefined ? null : Number(v)),
  date: (v) => (v ? v : null),
  text: (v) => (v === null || v === undefined ? '' : String(v)),
};

export function createLiveTable({
  sb, table, filter = null, sort = null, codecs = {}, keyCols = null, hasOrigin = true,
  onChange = () => {}, onStatus = () => {},
}) {
  const rows = new Map();       // key -> row
  const queue = new Map();      // key -> patch waiting to be sent
  const inflight = new Map();   // key -> patch being sent
  const timers = new Map();     // key -> timeout
  let busy = 0;
  let channel = null;
  let subscribedOnce = false;
  let lastError = '';
  let closed = false;

  // Rows are keyed by `id`, or by a composite primary key (e.g. project_id|user_id).
  const keyOf = (r) => (keyCols ? keyCols.map((c) => r[c]).join('|') : r.id);
  const whereKey = (q, key, row) => (keyCols ? keyCols.reduce((acc, c) => acc.eq(c, row[c]), q) : q.eq('id', key));
  const stamp = (obj) => (hasOrigin ? { ...obj, updated_origin: ORIGIN } : obj);
  const encode = (obj) => {
    const out = {};
    Object.keys(obj).forEach((k) => { out[k] = codecs[k] ? encoders[codecs[k]](obj[k]) : obj[k]; });
    return out;
  };
  const pendingCols = (key) => new Set([...Object.keys(queue.get(key) || {}), ...Object.keys(inflight.get(key) || {})]);

  function list() {
    const all = [...rows.values()];
    return sort ? all.sort(sort) : all;
  }
  function emit() { if (!closed) onChange(list()); }
  function status() {
    if (closed) return;
    onStatus({ saving: queue.size + inflight.size + busy > 0, error: lastError });
  }
  function fail(e) { lastError = errMsg(e); status(); }

  // Merge a server row, keeping local values for columns this tab is still saving.
  function mergeRemote(row) {
    const key = keyOf(row);
    const local = rows.get(key);
    if (!local) { rows.set(key, row); return; }
    const merged = { ...row };
    pendingCols(key).forEach((k) => { merged[k] = local[k]; });
    rows.set(key, merged);
  }

  async function load() {
    let q = sb.from(table).select('*');
    if (filter) q = q.eq(filter.column, filter.value);
    const { data, error } = await q;
    if (error) throw error;
    const seen = new Set();
    (data || []).forEach((r) => { seen.add(keyOf(r)); mergeRemote(r); });
    [...rows.keys()].forEach((k) => { if (!seen.has(k) && !pendingCols(k).size) rows.delete(k); });
    emit();
  }

  function subscribe() {
    const f = filter ? { filter: `${filter.column}=eq.${filter.value}` } : {};
    const name = `lt:${table}:${filter ? filter.value : 'all'}:${newId().slice(0, 8)}`;
    channel = sb.channel(name)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table, ...f }, (p) => { mergeRemote(p.new); emit(); })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table, ...f }, (p) => { mergeRemote(p.new); emit(); })
      // DELETE events cannot be filtered and only carry the primary key under RLS.
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table }, (p) => {
        const key = p.old && keyOf(p.old);
        if (key && rows.has(key)) { rows.delete(key); emit(); }
      })
      .subscribe((s) => {
        if (s === 'SUBSCRIBED') {
          if (subscribedOnce) load().catch(fail); // catch up after a reconnect
          subscribedOnce = true;
        }
      });
  }

  async function insertMany(values) {
    const prepared = values.map((v) => (keyCols ? { ...v } : { ...v, id: v.id || newId() }));
    prepared.forEach((r) => rows.set(keyOf(r), r));
    emit();
    busy += 1; status();
    try {
      const { error } = await sb.from(table).insert(prepared.map((r) => stamp(encode(r))));
      if (error) throw error;
      lastError = '';
      return prepared.map(keyOf);
    } catch (e) {
      prepared.forEach((r) => rows.delete(keyOf(r))); emit(); fail(e);
      throw e;
    } finally {
      busy -= 1; status();
    }
  }

  async function insert(value) {
    const [key] = await insertMany([value]);
    return key;
  }

  function update(key, patch, { typing = false } = {}) {
    const row = rows.get(key);
    if (!row) return;
    rows.set(key, { ...row, ...patch });
    emit();
    queue.set(key, { ...(queue.get(key) || {}), ...patch });
    status();
    clearTimeout(timers.get(key));
    timers.set(key, setTimeout(() => flush(key), typing ? TYPING_MS : CLICK_MS));
  }

  async function flush(key) {
    timers.delete(key);
    const patch = queue.get(key);
    if (!patch) return;
    if (inflight.has(key)) { timers.set(key, setTimeout(() => flush(key), CLICK_MS * 3)); return; }
    const row = rows.get(key) || {};
    queue.delete(key);
    inflight.set(key, patch);
    status();
    try {
      const { data, error } = await whereKey(sb.from(table).update(stamp(encode(patch))), key, row).select();
      if (error) throw error;
      if (!data || !data.length) throw new Error('You can’t edit this item.');
      lastError = '';
    } catch (e) {
      fail(e);
      inflight.delete(key);
      // Re-read the row so the screen shows what is really stored.
      const { data } = await whereKey(sb.from(table).select('*'), key, row).maybeSingle();
      if (data) { rows.set(key, data); emit(); }
    } finally {
      inflight.delete(key);
      status();
    }
  }

  async function remove(key) {
    const prev = rows.get(key);
    if (!prev) return;
    rows.delete(key);
    emit();
    busy += 1; status();
    try {
      const { error } = await whereKey(sb.from(table).delete(), key, prev);
      if (error) throw error;
      lastError = '';
    } catch (e) {
      rows.set(key, prev); emit(); fail(e);
    } finally {
      busy -= 1; status();
    }
  }

  async function flushAll() {
    const keys = [...queue.keys()];
    keys.forEach((k) => clearTimeout(timers.get(k)));
    await Promise.all(keys.map(flush));
  }

  function close() {
    closed = true;
    timers.forEach(clearTimeout);
    if (channel) sb.removeChannel(channel);
  }

  async function start({ live = true } = {}) {
    if (live) subscribe();
    await load();
  }

  return { start, load, list, get: (key) => rows.get(key), keyOf, insert, insertMany, update, remove, flushAll, close };
}

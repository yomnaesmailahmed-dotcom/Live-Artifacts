// Minimal observable store shared by the page modules.
export function createStore(initial) {
  let state = initial;
  const listeners = new Set();
  return {
    get: () => state,
    set(patch) { state = { ...state, ...patch }; listeners.forEach((fn) => fn(state)); },
    subscribe(fn) { listeners.add(fn); fn(state); return () => listeners.delete(fn); },
  };
}

// Identifies writes from this tab (stored in updated_origin) so realtime echoes can be recognised.
export const ORIGIN = (globalThis.crypto && crypto.randomUUID)
  ? crypto.randomUUID()
  : `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const newId = () => ((globalThis.crypto && crypto.randomUUID)
  ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16)));

export const errMsg = (e) => (e && e.message) || String(e || 'Unknown error');

import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_JS_URL } from '../config.js';

let clientPromise = null;

// One session per browser tab. The default (localStorage + a BroadcastChannel named after the
// storage key) shares a sign-in with every tab of the same browser, so signing in as a user in
// one tab turned an admin tab into that user. sessionStorage is per tab; a per-tab key also
// gives each tab its own BroadcastChannel.
function tabAuthOptions() {
  try {
    let key = sessionStorage.getItem('pc-auth-key');
    if (!key) {
      key = 'sb-pc-' + Math.random().toString(36).slice(2, 10);
      sessionStorage.setItem('pc-auth-key', key);
    }
    return { storage: sessionStorage, storageKey: key };
  } catch {
    return {}; // storage blocked: fall back to the library default
  }
}

// Loaded lazily with a dynamic import so a CDN outage leaves the prototype usable offline.
export function getSupabase() {
  if (!clientPromise) {
    clientPromise = import(SUPABASE_JS_URL).then(({ createClient }) =>
      createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, ...tabAuthOptions() },
      })
    );
    clientPromise.catch(() => { clientPromise = null; });
  }
  return clientPromise;
}

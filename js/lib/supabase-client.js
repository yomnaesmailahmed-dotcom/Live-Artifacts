import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_JS_URL } from '../config.js';

let clientPromise = null;

// Loaded lazily with a dynamic import so a CDN outage leaves the prototype usable offline.
export function getSupabase() {
  if (!clientPromise) {
    clientPromise = import(SUPABASE_JS_URL).then(({ createClient }) =>
      createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      })
    );
    clientPromise.catch(() => { clientPromise = null; });
  }
  return clientPromise;
}

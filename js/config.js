// Public client configuration. The publishable key is safe to ship in a static site:
// every table is protected by Row Level Security. Never put a secret / service_role key here.

export const SUPABASE_URL = 'https://tsghvdwpcasnfevynebe.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_oLikbWX2qhH9enPoLprMZA_b8RjKBXE';

// Pinned ESM build of supabase-js from the CDN (no bundler needed).
export const SUPABASE_JS_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm';

// Supabase Auth: email + password and email magic links.
// Roles are never read from user_metadata — they come from public.profiles (set by a database trigger).

function redirectUrl() {
  const url = new URL(window.location.href);
  url.hash = '';
  url.searchParams.delete('run');
  return url.toString();
}

// Calls `listener(session)` now and on every auth change. Supabase warns against awaiting
// other Supabase calls inside onAuthStateChange, so the listener runs on the next tick.
export async function watchSession(sb, listener) {
  const { data: { subscription } } = sb.auth.onAuthStateChange((_event, session) => {
    setTimeout(() => listener(session), 0);
  });
  const { data } = await sb.auth.getSession();
  listener(data.session);
  return () => subscription.unsubscribe();
}

export function signInWithPassword(sb, email, password) {
  return sb.auth.signInWithPassword({ email, password });
}

export function signUp(sb, email, password) {
  return sb.auth.signUp({ email, password, options: { emailRedirectTo: redirectUrl() } });
}

export function sendMagicLink(sb, email) {
  return sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectUrl(), shouldCreateUser: true } });
}

export function signOut(sb) {
  return sb.auth.signOut();
}

export async function fetchProfile(sb, userId) {
  const { data, error } = await sb.from('profiles').select('id, email, full_name, role').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

export function friendlyAuthError(error) {
  const msg = (error && error.message) || String(error || '');
  if (/invalid login credentials/i.test(msg)) return 'That email and password don’t match an account.';
  if (/email not confirmed/i.test(msg)) return 'Confirm your email first — the link is in your inbox.';
  if (/already registered|already exists/i.test(msg)) return 'An account with this email already exists. Sign in instead.';
  if (/rate limit|too many/i.test(msg)) return 'Too many attempts. Wait a minute and try again.';
  if (/password/i.test(msg) && /(short|least|weak)/i.test(msg)) return msg;
  return msg || 'Something went wrong. Try again.';
}

export const SUPABASE_URL = 'https://btkcubibosbtpxcronnd.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0a2N1Ymlib3NidHB4Y3Jvbm5kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwMzI1ODAsImV4cCI6MjA5ODYwODU4MH0.IqR7dJbZJm83c_XHz923GQrBWdf5GCaNDYMPg6z8kj0';

async function supabaseFetch(url: string, opts: RequestInit) {
  const res = await fetch(url, opts);
  if (!res.ok) {
    const txt = await res.text();
    let json;
    try { json = JSON.parse(txt); } catch { json = {}; }
    const msg = json.error_description || json.msg || json.error || `HTTP ${res.status}: ${txt.slice(0, 100)}`;
    if (res.status === 429) return { error: 'Too many requests. Please wait a minute before trying again.' };
    if (msg.toLowerCase().includes('rate') || msg.toLowerCase().includes('over_limit') || msg.toLowerCase().includes('over_request_rate_limit')) return { error: 'Email rate limit exceeded. Please wait a few minutes before trying again.' };
    if (res.status === 401 && msg === 'JWT expired') {
      const newToken = await doRefresh();
      if (newToken) {
        const h = opts.headers as Record<string, string> | undefined;
        if (h) h['Authorization'] = `Bearer ${newToken}`;
        const retryRes = await fetch(url, opts);
        if (retryRes.ok) {
          const rt = await retryRes.text();
          if (!rt) return {};
          try { return JSON.parse(rt); } catch { return {}; }
        }
        const retryTxt = await retryRes.text();
        let retryJson;
        try { retryJson = JSON.parse(retryTxt); } catch { retryJson = {}; }
        return { error: retryJson.error_description || retryJson.msg || retryJson.error || `HTTP ${retryRes.status}: ${retryTxt.slice(0, 100)}` };
      }
    }
    return { error: msg };
  }
  const text = await res.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return {}; }
}

interface SessionTokens { access_token: string; refresh_token: string; }

function getStoredTokens(): SessionTokens | null {
  try {
    const raw = localStorage.getItem('supa_tokens');
    if (raw) return JSON.parse(raw);
    const old = localStorage.getItem('supa_session');
    if (old) { localStorage.setItem('supa_tokens', JSON.stringify({ access_token: old, refresh_token: '' })); localStorage.removeItem('supa_session'); return { access_token: old, refresh_token: '' }; }
    return null;
  } catch { return null; }
}

function setStoredTokens(t: SessionTokens | null) {
  try { if (t) localStorage.setItem('supa_tokens', JSON.stringify(t)); else localStorage.removeItem('supa_tokens'); } catch {}
}

let refreshPromise: Promise<string | null> | null = null;

async function doRefresh(): Promise<string | null> {
  const tokens = getStoredTokens();
  if (!tokens || !tokens.refresh_token) return null;
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
        body: JSON.stringify({ refresh_token: tokens.refresh_token }),
      });
      if (!r.ok) return null;
      const data = await r.json();
      if (data.access_token) {
        setStoredTokens({ access_token: data.access_token, refresh_token: data.refresh_token || tokens.refresh_token });
        notify(parseJwt(data.access_token));
        return data.access_token;
      }
      return null;
    } catch { return null; }
  })();
  try { return await refreshPromise; } finally { refreshPromise = null; }
}

function getStoredSession(): string | null {
  const t = getStoredTokens();
  return t ? t.access_token : null;
}

function setStoredSession(token: string | null) {
  if (token) { const existing = getStoredTokens(); setStoredTokens({ access_token: token, refresh_token: existing?.refresh_token || '' }); }
  else setStoredTokens(null);
}

export interface SupabaseUser {
  id: string;
  email?: string;
  exp?: number;
}

type Listener = (user: SupabaseUser | null) => void;
const listeners: Listener[] = [];

function notify(user: SupabaseUser | null) {
  listeners.forEach(fn => fn(user));
}

function parseJwt(token: string): SupabaseUser | null {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(base64));
    return { id: payload.sub, email: payload.email, exp: payload.exp };
  } catch { return null; }
}

let claimedBrowserUserId: string | null = null;
let browserClaimPromise: Promise<{ error?: string }> | null = null;

async function claimBrowserAccount(token: string): Promise<{ error?: string }> {
  // This restriction is for the browser app; native clients do not have browser storage.
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return {};
  const user = parseJwt(token);
  if (!user?.id) return { error: 'INVALID_SESSION' };
  if (claimedBrowserUserId === user.id) return {};
  if (browserClaimPromise) {
    const pending = await browserClaimPromise;
    if (pending.error) return pending;
    if (claimedBrowserUserId === user.id) return {};
  }
  browserClaimPromise = (async () => {
    try {
      let browserId = localStorage.getItem('liveme_browser_id');
      if (!browserId) {
        browserId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, ch => {
              const r = Math.random() * 16 | 0;
              return (ch === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
            });
        localStorage.setItem('liveme_browser_id', browserId);
      }
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/bind_browser_account`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ p_browser_id: browserId }),
      });
      if (!response.ok) {
        const body = await response.text();
        if (body.includes('BROWSER_ACCOUNT_MISMATCH')) return { error: 'BROWSER_ACCOUNT_MISMATCH' };
        return { error: 'BROWSER_BINDING_UNAVAILABLE' };
      }
      claimedBrowserUserId = user.id;
      return {};
    } catch {
      return { error: 'BROWSER_BINDING_UNAVAILABLE' };
    }
  })();
  try { return await browserClaimPromise; }
  finally { browserClaimPromise = null; }
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', event => {
    if (event.key !== 'supa_tokens') return;
    const token = getStoredSession();
    if (!token) {
      notify(null);
      return;
    }
    void claimBrowserAccount(token).then(binding => {
      if (binding.error) {
        if (binding.error === 'BROWSER_ACCOUNT_MISMATCH') setStoredTokens(null);
        notify(null);
      } else {
        notify(parseJwt(token));
      }
    });
  });
}

export function getAccessToken(): string | null { return getStoredSession(); }

// Force a server-issued access-token refresh before starting Random Chat.
// A locally unexpired JWT can still be revoked or otherwise rejected by Supabase.
export async function refreshAccessToken(): Promise<string | null> {
  const tokens = getStoredTokens();
  if (!tokens?.access_token) return null;
  if (!tokens.refresh_token) return getValidAccessToken();
  const refreshed = await doRefresh();
  const validToken = refreshed || await getValidAccessToken();
  if (!validToken) return null;
  const binding = await claimBrowserAccount(validToken);
  if (binding.error) {
    if (binding.error === 'BROWSER_ACCOUNT_MISMATCH') {
      setStoredTokens(null);
      notify(null);
    }
    return null;
  }
  return validToken;
}

export async function getValidAccessToken(): Promise<string | null> {
  const tokens = getStoredTokens();
  if (!tokens?.access_token) return null;
  const user = parseJwt(tokens.access_token);
  if (!user) {
    setStoredTokens(null);
    notify(null);
    return null;
  }
  // Refresh shortly before expiry so WebSocket and REST requests start with a valid JWT.
  let validToken = tokens.access_token;
  if ((user.exp || 0) * 1000 <= Date.now() + 60_000) {
    const refreshed = await doRefresh();
    if (refreshed) validToken = refreshed;
    else {
      const latest = getStoredTokens();
      const latestUser = latest?.access_token ? parseJwt(latest.access_token) : null;
      if (!latestUser || (latestUser.exp || 0) * 1000 <= Date.now()) {
        setStoredTokens(null);
        notify(null);
        return null;
      }
      validToken = latest!.access_token;
    }
  }
  const binding = await claimBrowserAccount(validToken);
  if (binding.error) {
    if (binding.error === 'BROWSER_ACCOUNT_MISMATCH') {
      setStoredTokens(null);
      notify(null);
    }
    return null;
  }
  return validToken;
}

export async function setSessionToken(token: string | null, refreshToken?: string | null, skipBrowserBinding = false): Promise<{ error?: string }> {
  const existing = getStoredTokens();
  if (token) {
    const binding = skipBrowserBinding ? {} : await claimBrowserAccount(token);
    if (binding.error) return { error: binding.error === 'BROWSER_ACCOUNT_MISMATCH'
      ? 'This browser is already linked to another LiveMe account. Sign in with the account originally used on this browser.'
      : 'We could not verify this browser. Please try again.' };
    setStoredTokens({ access_token: token, refresh_token: refreshToken || existing?.refresh_token || '' });
    const p = parseJwt(token);
    if (p) notify(p);
  } else {
    setStoredTokens(null);
    notify(null);
  }
  return {};
}

export async function signUp(email: string, password: string, captchaToken?: string): Promise<{ error?: string }> {
  try {
    const normalizedEmail = email.trim().toLowerCase();
    const data = await supabaseFetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
      body: JSON.stringify({ email: normalizedEmail, password, ...(captchaToken ? { captcha_token: captchaToken } : {}) }),
    });
    if (data.error) return { error: data.error };
    // Do not establish a session until the email OTP has been verified.
    if (data.access_token) {
      setStoredTokens(null);
      notify(null);
      return { error: 'Email confirmation is required. Please request a verification code and verify it before signing in.' };
    }
    return {};
  } catch (e: any) {
    return { error: e.message || 'Network error' };
  }
}

export async function verifySignupOtp(email: string, token: string): Promise<{ error?: string }> {
  try {
    const data = await supabaseFetch(`${SUPABASE_URL}/auth/v1/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
      body: JSON.stringify({ type: 'signup', email: email.trim().toLowerCase(), token: token.trim() }),
    });
    if (data.error) return { error: data.error };
    if (!data.access_token || !data.refresh_token) return { error: 'The code could not be verified. Please request a new code.' };
    const binding = await claimBrowserAccount(data.access_token);
    if (binding.error) return { error: binding.error === 'BROWSER_ACCOUNT_MISMATCH'
      ? 'This browser is already linked to another LiveMe account. Sign in with the account originally used on this browser.'
      : 'We could not verify this browser. Please try again.' };
    setStoredTokens({ access_token: data.access_token, refresh_token: data.refresh_token });
    notify(parseJwt(data.access_token));
    return {};
  } catch (e: any) {
    return { error: e.message || 'Network error' };
  }
}

export async function resendSignupOtp(email: string): Promise<{ error?: string }> {
  try {
    const data = await supabaseFetch(`${SUPABASE_URL}/auth/v1/resend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
      body: JSON.stringify({ type: 'signup', email: email.trim().toLowerCase() }),
    });
    if (data.error) return { error: data.error };
    return {};
  } catch (e: any) {
    return { error: e.message || 'Network error' };
  }
}

export async function signIn(email: string, password: string, captchaToken?: string): Promise<{ error?: string }> {
  try {
    const data = await supabaseFetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
      body: JSON.stringify({ email, password, ...(captchaToken ? { captcha_token: captchaToken } : {}) }),
    });
    if (data.error) return { error: data.error };
    if (data.access_token) {
      const binding = await claimBrowserAccount(data.access_token);
      if (binding.error) return { error: binding.error === 'BROWSER_ACCOUNT_MISMATCH'
        ? 'This browser is already linked to another LiveMe account. Sign in with the account originally used on this browser.'
        : 'We could not verify this browser. Please try again.' };
      setStoredTokens({ access_token: data.access_token, refresh_token: data.refresh_token || '' });
      notify(parseJwt(data.access_token));
    }
    return {};
  } catch (e: any) {
    return { error: e.message || 'Network error' };
  }
}

export async function resetPassword(email: string, redirectTo?: string, captchaToken?: string): Promise<{ error?: string }> {
  try {
    const verifiedCaptchaToken = captchaToken?.trim();
    // Never send a password-recovery request without the Turnstile response.
    // Supabase rejects /recover when CAPTCHA protection is enabled and this
    // field is absent.
    if (!verifiedCaptchaToken) return { error: 'Security verification expired. Please complete the security check again.' };
    const body: any = { email, captcha_token: verifiedCaptchaToken };
    if (redirectTo) body.redirect_to = redirectTo;
    const data = await supabaseFetch(`${SUPABASE_URL}/auth/v1/recover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
      body: JSON.stringify(body),
    });
    if (data.error) return { error: data.error };
    return {};
  } catch (e: any) {
    return { error: e.message || 'Network error' };
  }
}

export async function exchangeOAuthCode(code: string): Promise<{ access_token?: string; refresh_token?: string; error?: string }> {
  try {
    // Supabase PKCE redirects store the verifier in localStorage under the
    // project's auth storage key. Accept the standard key and compatible
    // auth-token verifier keys without ever sending a missing verifier.
    let verifier: string | null = null;
    try {
      const suffix = '-auth-token-code-verifier';
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.endsWith(suffix)) continue;
        const stored = localStorage.getItem(key);
        if (stored) { verifier = stored.split('/')[0]; break; }
      }
    } catch {}
    if (!verifier) return { error: 'This sign-in link is missing its security verifier. Please start sign-in again.' };
    const data = await supabaseFetch(`${SUPABASE_URL}/auth/v1/token?grant_type=pkce`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
      body: JSON.stringify({ auth_code: code, code_verifier: verifier }),
    });
    if (data.error) return { error: data.error };
    if (!data.access_token) return { error: 'This sign-in link is invalid or has expired. Please start sign-in again.' };
    return { access_token: data.access_token, refresh_token: data.refresh_token || '' };
  } catch (e: any) {
    return { error: e.message || 'Could not complete social sign-in.' };
  }
}

export async function exchangeRecoveryCode(code: string): Promise<{ access_token?: string; refresh_token?: string; error?: string }> {
  const result = await exchangeOAuthCode(code);
  if (result.error) return { ...result, error: result.error.replace('sign-in', 'password reset').replace('start sign-in again', 'request a new reset email') };
  return result;
}

export async function verifyRecoveryToken(tokenHash: string): Promise<{ access_token?: string; refresh_token?: string; error?: string }> {
  try {
    const data = await supabaseFetch(`${SUPABASE_URL}/auth/v1/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
      body: JSON.stringify({ type: 'recovery', token: tokenHash }),
    });
    if (data.error) return { error: data.error };
    if (!data.access_token) return { error: 'This password reset link is invalid or has expired. Request a new one and try again.' };
    return { access_token: data.access_token, refresh_token: data.refresh_token || '' };
  } catch (e: any) {
    return { error: e.message || 'Could not verify password reset link.' };
  }
}

export async function updatePassword(newPassword: string, recoveryToken?: string | null): Promise<{ error?: string }> {
  // Use the verified recovery token directly as a fallback if browser storage
  // is unavailable or has not persisted the session yet.
  const token = recoveryToken || getStoredSession();
  if (!token) return { error: 'Not authenticated' };
  try {
    const data = await supabaseFetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ password: newPassword }),
    });
    if (data.error) return { error: data.error };
    return {};
  } catch (e: any) {
    return { error: e.message || 'Network error' };
  }
}

export async function sendPhoneOtp(phone: string): Promise<{ error?: string }> {
  try {
    const data = await supabaseFetch(`${SUPABASE_URL}/auth/v1/otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
      body: JSON.stringify({ phone }),
    });
    if (data.error) return { error: data.error };
    return {};
  } catch (e: any) {
    return { error: e.message || 'Network error' };
  }
}

export async function verifyPhoneOtp(phone: string, token: string): Promise<{ error?: string; access_token?: string }> {
  try {
    const data = await supabaseFetch(`${SUPABASE_URL}/auth/v1/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
      body: JSON.stringify({ type: 'sms', phone, token }),
    });
    if (data.error) return { error: data.error };
    if (data.access_token) return { access_token: data.access_token };
    return { error: 'Verification failed' };
  } catch (e: any) {
    return { error: e.message || 'Network error' };
  }
}

export async function signOut() {
  const token = getStoredSession();
  try {
    if (token) await fetch(`${SUPABASE_URL}/auth/v1/logout`, { method: 'POST', headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
  } catch {}
  setStoredSession(null);
  notify(null);
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach(value => { binary += String.fromCharCode(value); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function buildOAuthAuthorizeUrl(provider: 'google' | 'github', captchaToken: string): Promise<string> {
  const random = new Uint8Array(32);
  crypto.getRandomValues(random);
  const verifier = base64Url(random);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = base64Url(new Uint8Array(digest));
  // Supabase's PKCE callback uses this verifier to exchange the returned code.
  localStorage.setItem('sb-btkcubibosbtpxcronnd-auth-token-code-verifier', verifier + '/' + Date.now());
  const params = new URLSearchParams({
    provider,
    redirect_to: `${window.location.origin}/?auth_flow=oauth`,
    captcha_token: captchaToken,
    code_challenge: challenge,
    code_challenge_method: 's256',
  });
  if (provider === 'google') params.set('prompt', 'select_account');
  return `${SUPABASE_URL}/auth/v1/authorize?${params.toString()}`;
}

function startOAuthSignIn(provider: 'google' | 'github', captchaToken: string): boolean {
  if (!captchaToken) return false;
  // Open synchronously during the click to avoid popup blockers while PKCE is prepared.
  try { localStorage.setItem('liveme-oauth-pending', '1'); } catch {}
  const popup = window.open('about:blank', provider + '-oauth', 'width=600,height=700,popup=1');
  void buildOAuthAuthorizeUrl(provider, captchaToken).then(url => {
    if (popup && !popup.closed) popup.location.href = url;
    else window.location.href = url;
  }).catch(() => {
    try { localStorage.removeItem('liveme-oauth-pending'); } catch {}
    if (popup && !popup.closed) popup.close();
  });
  return true;
}

export function signInWithGoogle(captchaToken: string) {
  return startOAuthSignIn('google', captchaToken);
}

export function signInWithGitHub(captchaToken: string) {
  return startOAuthSignIn('github', captchaToken);
}

export function getSession(): SupabaseUser | null {
  try {
    const token = getStoredSession();
    if (!token) return null;
    const user = parseJwt(token);
    if (!user) return null;
    const exp = user.exp || 0;
    if (Date.now() >= exp * 1000 && !getStoredTokens()?.refresh_token) {
      setStoredSession(null);
      return null;
    }
    // Keep the signed-in user during startup when a refresh token is available.
    // Network-backed callers use getValidAccessToken()/supabaseFetch to refresh it.
    return user;
  } catch { return null; }
}

export function onAuthChange(fn: Listener) {
  listeners.push(fn);
  return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
}

export interface ChatProfile {
  display_name: string;
  bio: string;
  avatar_url: string;
  cover_url: string;
  share_name: boolean;
  share_bio: boolean;
  work?: string;
  education?: string;
  share_details?: boolean;
  date_of_birth?: string;
  terms_accepted_at?: string;
  terms_version?: string;
  new_member_badge_expires_at?: string | null;
}

export async function getUserProfile(userId: string): Promise<{ profile?: ChatProfile; error?: string }> {
  const token = getStoredSession();
  if (!token) return { error: 'Not authenticated' };
  const currentUser = parseJwt(token);
  if (!currentUser) return { error: 'Invalid token' };
  try {
    let p: any;
    if (currentUser.id === userId) {
      const data = await supabaseFetch(
        `${SUPABASE_URL}/rest/v1/chat_profiles?user_id=eq.${encodeURIComponent(userId)}&select=*`,
        { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } }
      );
      if (data.error) return { error: data.error };
      if (!Array.isArray(data) || data.length === 0) return {};
      p = data[0];
    } else {
      const data = await supabaseFetch(
        `${SUPABASE_URL}/rest/v1/rpc/get_public_chat_profile`,
        {
          method: 'POST',
          headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ target_user_id: userId }),
        }
      );
      if (data.error) return { error: data.error };
      if (!Array.isArray(data) || data.length === 0) return {};
      p = data[0];
    }
    let details: any = p;
    if (currentUser.id !== userId) {
      const detailRows = await supabaseFetch(
        `${SUPABASE_URL}/rest/v1/rpc/get_public_chat_profile_details`,
        { method: 'POST', headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ target_user_id: userId }) }
      );
      if (!detailRows?.error && Array.isArray(detailRows) && detailRows.length) details = { ...p, ...detailRows[0] };
    }
    return {
      profile: {
        display_name: p.display_name || 'Anonymous',
        bio: p.bio || '',
        avatar_url: p.avatar_url || '',
        cover_url: p.cover_url || '',
        share_name: Boolean(p.share_name),
        share_bio: Boolean(p.share_bio),
        new_member_badge_expires_at: p.new_member_badge_expires_at || null,
        work: details.work || '',
        education: details.education || '',
        share_details: details.share_details !== false,
      },
    };
  } catch (e: any) {
    return { error: e.message || 'Could not load profile' };
  }
}

export async function getChatProfile(): Promise<{ profile?: ChatProfile; error?: string }> {
  const token = getStoredSession();
  if (!token) return { error: 'Not authenticated' };
  const user = parseJwt(token);
  if (!user) return { error: 'Invalid token' };
  try {
    const data = await supabaseFetch(
      `${SUPABASE_URL}/rest/v1/chat_profiles?user_id=eq.${user.id}&select=*`,
      { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}` } }
    );
    if (data.error) return { error: data.error };
    if (Array.isArray(data) && data.length > 0) {
      const p = data[0];
      return { profile: { display_name: p.display_name, bio: p.bio, avatar_url: p.avatar_url, cover_url: p.cover_url, share_name: p.share_name, share_bio: p.share_bio, work: p.work || '', education: p.education || '', share_details: p.share_details !== false, date_of_birth: p.date_of_birth } };
    }
    return {};
  } catch (e: any) {
    return { error: e.message };
  }
}

export interface ChatMessage {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
  read: boolean;
}

export interface CoinWallet {
  total_balance: number;
  purchased_balance: number;
  promotional_balance: number;
}

export async function getCoinWallet(): Promise<{ wallet?: CoinWallet; error?: string }> {
  const token = getStoredSession();
  if (!token) return { error: 'Not authenticated' };
  const user = parseJwt(token);
  if (!user) return { error: 'Invalid token' };
  try {
    const rows = await supabaseFetch(
      `${SUPABASE_URL}/rest/v1/coin_wallets?user_id=eq.${encodeURIComponent(user.id)}&select=total_balance,purchased_balance,promotional_balance&limit=1`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } }
    );
    if (rows?.error) return { error: rows.error };
    if (!Array.isArray(rows) || rows.length === 0) {
      return { wallet: { total_balance: 0, purchased_balance: 0, promotional_balance: 0 } };
    }
    return { wallet: rows[0] as CoinWallet };
  } catch (e: any) {
    return { error: e.message || 'Could not load LivMe Coins balance' };
  }
}

export interface CoinTransaction {
  id: string;
  transaction_type: string;
  coin_source: string;
  amount: number;
  balance_after: number;
  metadata: Record<string, any> | null;
  created_at: string;
}

export async function getCoinTransactions(limit = 50): Promise<{ transactions?: CoinTransaction[]; error?: string }> {
  const token = getStoredSession();
  if (!token) return { error: 'Not authenticated' };
  const user = parseJwt(token);
  if (!user) return { error: 'Invalid token' };
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit) || 50));
  try {
    const rows = await supabaseFetch(
      `${SUPABASE_URL}/rest/v1/coin_transactions?user_id=eq.${encodeURIComponent(user.id)}&select=id,transaction_type,coin_source,amount,balance_after,metadata,created_at&order=created_at.desc&limit=${safeLimit}`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } }
    );
    if (rows?.error) return { error: rows.error };
    return { transactions: Array.isArray(rows) ? rows as CoinTransaction[] : [] };
  } catch (e: any) {
    return { error: e.message || 'Could not load LivMe Coins transaction history' };
  }
}

function createChatMessageRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, ch => {
    const r = Math.random() * 16 | 0;
    return (ch === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

export async function sendMessage(receiverId: string, content: string, requestId?: string): Promise<{ error?: string; balance?: number; charged?: boolean }> {
  const token = getStoredSession();
  if (!token) return { error: 'Not authenticated' };
  const user = parseJwt(token);
  if (!user) return { error: 'Invalid token' };
  const trimmedContent = content.trim();
  if (!trimmedContent) return { error: 'Message is empty' };
  try {
    const isCallLog = /^\[livme-call\]\|(audio|video)\|[0-9]+\|completed$/.test(trimmedContent);
    const endpoint = isCallLog ? 'log_chat_call_message' : 'send_chat_message';
    const body = isCallLog
      ? { p_receiver_id: receiverId, p_content: trimmedContent }
      : { p_message_id: requestId || createChatMessageRequestId(), p_receiver_id: receiverId, p_content: trimmedContent };
    const result = await supabaseFetch(`${SUPABASE_URL}/rest/v1/rpc/${endpoint}`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (result?.error) {
      const errorMap: Record<string, string> = {
        AUTH_REQUIRED: 'Please sign in again.',
        ACCOUNT_SUSPENDED: 'Your account has been suspended.',
        INSUFFICIENT_LC: 'You need 1 LC to send this message, but your balance is empty.',
        INVALID_RECIPIENT: 'This recipient is not available.',
        RECIPIENT_NOT_FOUND: 'This user could not be found.',
        MESSAGE_LENGTH_INVALID: 'Messages must be between 1 and 2,000 characters.',
      };
      return { error: errorMap[result.error] || result.error };
    }
    if (result?.ok === false && result.code === 'INSUFFICIENT_LC') {
      return { error: 'You need 1 LC to send this message. Your current balance is 0 LC.', balance: Number(result.balance || 0) };
    }
    if (result?.ok !== true) return { error: 'Message could not be sent. Please try again.' };
    if (typeof window !== 'undefined' && !isCallLog) {
      window.dispatchEvent(new CustomEvent('liveme-coins-updated'));
    }
    return { balance: typeof result.balance === 'number' ? result.balance : undefined, charged: Boolean(result.charged) };
  } catch (e: any) {
    return { error: e.message || 'Could not send message' };
  }
}
export async function hideConversation(partnerId: string): Promise<{ error?: string }> {
  const token = getStoredSession();
  if (!token) return { error: 'Not authenticated' };
  const user = parseJwt(token);
  if (!user) return { error: 'Invalid token' };
  try {
    const result = await supabaseFetch(`${SUPABASE_URL}/rest/v1/chat_conversation_hides`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({ user_id: user.id, partner_id: partnerId, hidden_at: new Date().toISOString() }),
    });
    if (result?.error) return { error: result.error };
    return {};
  } catch (e: any) {
    return { error: e.message || 'Could not delete conversation' };
  }
}

export async function getConversations(): Promise<{ conversations?: { partnerId: string; lastMessage: ChatMessage; unread: number }[]; presencePartnerIds?: string[]; error?: string }> {
  const token = getStoredSession();
  if (!token) return { error: 'Not authenticated' };
  const user = parseJwt(token);
  if (!user) return { error: 'Invalid token' };
  try {
    const res = await supabaseFetch(
      `${SUPABASE_URL}/rest/v1/chat_messages?or=(sender_id.eq.${user.id},receiver_id.eq.${user.id})&order=created_at.desc`,
      { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}` } }
    );
    if (res?.error) return { error: res.error };
    const messages = res as ChatMessage[];
    const hiddenRows = await supabaseFetch(
      `${SUPABASE_URL}/rest/v1/chat_conversation_hides?user_id=eq.${user.id}&select=partner_id,hidden_at`,
      { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}` } }
    );
    if (hiddenRows?.error) return { error: hiddenRows.error };
    const hiddenAt = new Map<string, number>(
      (Array.isArray(hiddenRows) ? hiddenRows : []).map((row: any) => [row.partner_id, new Date(row.hidden_at).getTime()])
    );
    const presencePartnerIds = Array.from(new Set(messages.map(m => m.sender_id === user.id ? m.receiver_id : m.sender_id)));
    const convMap = new Map<string, { partnerId: string; lastMessage: ChatMessage; unread: number }>();
    for (const m of messages) {
      const otherId = m.sender_id === user.id ? m.receiver_id : m.sender_id;
      const hiddenTime = hiddenAt.get(otherId);
      if (hiddenTime !== undefined && new Date(m.created_at).getTime() <= hiddenTime) continue;
      if (!convMap.has(otherId)) {
        convMap.set(otherId, { partnerId: otherId, lastMessage: m, unread: 0 });
      }
      if (!m.read && m.sender_id !== user.id) {
        convMap.get(otherId)!.unread++;
      }
    }
    return { conversations: Array.from(convMap.values()), presencePartnerIds };
  } catch (e: any) {
    return { error: e.message };
  }
}


export async function getInboxUserDirectory(): Promise<{ users?: { user_id: string; display_name: string; avatar_url: string }[]; error?: string }> {
  const token = getStoredSession();
  if (!token) return { error: 'Not authenticated' };
  const user = parseJwt(token);
  if (!user) return { error: 'Invalid token' };
  try {
    const result = await supabaseFetch(
      `${SUPABASE_URL}/rest/v1/rpc/get_inbox_user_directory`,
      {
        method: 'POST',
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_limit: 100 }),
      }
    );
    if (result?.error) return { error: result.error };
    return { users: Array.isArray(result) ? result : [] };
  } catch (e: any) {
    return { error: e.message || 'Could not load users' };
  }
}

export async function getMessages(partnerId: string): Promise<{ messages?: ChatMessage[]; error?: string }> {
  const token = getStoredSession();
  if (!token) return { error: 'Not authenticated' };
  const user = parseJwt(token);
  if (!user) return { error: 'Invalid token' };
  try {
    const res = await supabaseFetch(
      `${SUPABASE_URL}/rest/v1/chat_messages?sender_id=in.(${user.id},${partnerId})&receiver_id=in.(${user.id},${partnerId})&order=created_at.asc`,
      { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}` } }
    );
    if (res?.error) return { error: res.error };
    const hiddenRows = await supabaseFetch(
      `${SUPABASE_URL}/rest/v1/chat_conversation_hides?user_id=eq.${user.id}&partner_id=eq.${partnerId}&select=hidden_at&limit=1`,
      { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}` } }
    );
    if (hiddenRows?.error) return { error: hiddenRows.error };
    const hiddenAt = Array.isArray(hiddenRows) && hiddenRows.length
      ? new Date(hiddenRows[0].hidden_at).getTime()
      : null;
    const visibleMessages = (res as ChatMessage[]).filter(message =>
      hiddenAt === null || new Date(message.created_at).getTime() > hiddenAt
    );
    return { messages: visibleMessages };
  } catch (e: any) {
    return { error: e.message };
  }
}

export async function markAllMessagesRead(): Promise<void> {
  const token = getStoredSession();
  if (!token) return;
  const user = parseJwt(token);
  if (!user) return;
  try {
    const res = await supabaseFetch(
      `${SUPABASE_URL}/rest/v1/chat_messages?receiver_id=eq.${user.id}&read=eq.false`,
      {
        method: 'PATCH',
        headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ read: true }),
      }
    );
  } catch (e) {}
}

export async function markMessagesRead(partnerId: string): Promise<void> {
  const token = getStoredSession();
  if (!token) return;
  const user = parseJwt(token);
  if (!user) return;
  try {
    await supabaseFetch(
      `${SUPABASE_URL}/rest/v1/chat_messages?receiver_id=eq.${user.id}&sender_id=eq.${partnerId}&read=eq.false`,
      {
        method: 'PATCH',
        headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ read: true }),
      }
    );
  } catch {}
}

export async function upsertChatProfile(profile: ChatProfile): Promise<{ error?: string }> {
  const token = getStoredSession();
  if (!token) return { error: 'Not authenticated' };
  const user = parseJwt(token);
  if (!user) return { error: 'Invalid token' };
  try {
    const res = await supabaseFetch(`${SUPABASE_URL}/rest/v1/chat_profiles`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify({ user_id: user.id, ...profile, updated_at: new Date().toISOString() }),
    });
    if (res?.error) return { error: res.error };
    return {};
  } catch (e: any) {
    return { error: e.message };
  }
}

export async function updateChatProfilePhoto(slot: 'avatar' | 'cover', url: string): Promise<{ error?: string }> {
  const token = getStoredSession();
  if (!token) return { error: 'Not authenticated' };
  const user = parseJwt(token);
  if (!user?.id) return { error: 'Invalid token' };
  const column = slot === 'avatar' ? 'avatar_url' : 'cover_url';
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 12000);
  try {
    // Upsert only the selected photo column. This also handles accounts that
    // do not yet have a chat_profiles row without overwriting the other slot.
    const result = await supabaseFetch(`${SUPABASE_URL}/rest/v1/chat_profiles?on_conflict=user_id&select=user_id`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify({ user_id: user.id, [column]: url, updated_at: new Date().toISOString() }),
    });
    if (result?.error) return { error: result.error };
    if (!Array.isArray(result) || result.length !== 1 || result[0]?.user_id !== user.id) {
      return { error: 'The photo uploaded, but your profile record was not updated. Please refresh and try again.' };
    }
    return {};
  } catch (error: any) {
    return { error: error?.name === 'AbortError' ? 'Profile save timed out after 12 seconds. Your photo upload did not finish saving to the profile.' : (error?.message || 'Could not save the photo to your profile.') };
  } finally {
    window.clearTimeout(timeoutId);
  }
}
export async function saveRecentLive(partnerId: string, name: string, bio: string, avatar: string): Promise<{ error?: string }> {
  const token = getStoredSession();
  if (!token) return { error: 'Not authenticated' };
  const user = parseJwt(token);
  if (!user) return { error: 'Invalid token' };
  try {
    const res = await supabaseFetch(`${SUPABASE_URL}/rest/v1/recent_live`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: user.id, partner_id: partnerId, partner_name: name, partner_bio: bio, partner_avatar: avatar }),
    });
    if (res?.error) return { error: res.error };
    return {};
  } catch (e: any) {
    return { error: e.message };
  }
}

export async function getRecentLive(): Promise<{ entries?: { id: string; partner_id: string; partner_name: string; partner_bio: string; partner_avatar: string; created_at: string }[]; error?: string }> {
  const token = getStoredSession();
  if (!token) return { error: 'Not authenticated' };
  const user = parseJwt(token);
  if (!user) return { error: 'Invalid token' };
  try {
    const res = await supabaseFetch(
      `${SUPABASE_URL}/rest/v1/recent_live?user_id=eq.${user.id}&order=created_at.desc&limit=20`,
      { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}` } }
    );
    if (res?.error) return { error: res.error };
    return { entries: res as any[] };
  } catch (e: any) {
    return { error: e.message };
  }
}

export async function clearRecentLive(): Promise<{ error?: string }> {
  const token = getStoredSession();
  if (!token) return { error: 'Not authenticated' };
  const user = parseJwt(token);
  if (!user) return { error: 'Invalid token' };
  try {
    const res = await supabaseFetch(`${SUPABASE_URL}/rest/v1/recent_live?user_id=eq.${user.id}`, {
      method: 'DELETE',
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}` },
    });
    if (res?.error) return { error: res.error };
    return {};
  } catch (e: any) {
    return { error: e.message };
  }
}

export async function getAllMessagesForDownload(): Promise<{ data?: any[]; error?: string }> {
  const token = getStoredSession();
  if (!token) return { error: 'Not authenticated' };
  const user = parseJwt(token);
  if (!user) return { error: 'Invalid token' };
  if (!(await isAdmin())) return { error: 'Unauthorized: administrator access required.' };
  try {
    const res = await supabaseFetch(
      `${SUPABASE_URL}/rest/v1/rpc/get_my_all_messages`,
      { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}` } }
    );
    if (res?.error) return { error: res.error };
    return { data: Array.isArray(res) ? res : [] };
  } catch (e: any) {
    return { error: e.message };
  }
}

export async function isAdmin(): Promise<boolean> {
  const token = getStoredSession();
  if (!token) return false;
  const user = parseJwt(token);
  if (!user) return false;
  try {
    const res = await supabaseFetch(
      `${SUPABASE_URL}/rest/v1/rpc/is_admin`,
      { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}` } }
    );
    return res === true;
  } catch { return false; }
}

export async function getAllProfiles(): Promise<{ profiles?: any[]; error?: string }> {
  const token = getStoredSession();
  if (!token) return { error: 'Not authenticated' };
  const user = parseJwt(token);
  if (!user) return { error: 'Invalid token' };
  if (!(await isAdmin())) return { error: 'Unauthorized' };
  try {
    const res = await supabaseFetch(
      `${SUPABASE_URL}/rest/v1/chat_profiles?order=updated_at.desc`,
      { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}` } }
    );
    if (res?.error) return { error: res.error };
    return { profiles: Array.isArray(res) ? res : [] };
  } catch (e: any) {
    return { error: e.message };
  }
}

function rpcToken() {
  const token = getStoredSession();
  if (!token) return null;
  return { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function adminRpc(fn: string, body?: any) {
  const headers = rpcToken();
  if (!headers) return { error: 'Not authenticated' };
  if (!(await isAdmin())) return { error: 'Unauthorized: administrator access required.' };
  const result = await supabaseFetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(body ?? {}) });
  if (result?.error) return { error: String(result.error) };
  return result;
}

export async function getAdminStats(): Promise<{ stats?: any; error?: string }> {
  const res = await adminRpc('get_admin_stats');
  if (res?.error) return { error: res.error };
  return { stats: res };
}

export async function adminGetCoinWallet(userId: string): Promise<{ wallet?: any; error?: string }> {
  const res = await adminRpc('admin_get_coin_wallet', { p_target_user_id: userId });
  if (res?.error) return { error: res.error };
  return { wallet: res };
}

export async function adminAddLivmeCoins(userId: string, amount: number, reason: string, requestId: string): Promise<{ error?: string; balance?: number }> {
  const res = await adminRpc('admin_add_livme_coins', {
    p_target_user_id: userId, p_amount: amount, p_reason: reason.trim(), p_request_id: requestId,
  });
  if (res?.error) return { error: res.error };
  await adminLog('livme_coins_manual_add', userId, `${amount} LC · ${reason.trim()}`);
  return { balance: Number(res?.balance) };
}

export async function adminDeductLivmeCoins(userId: string, amount: number, reason: string, requestId: string): Promise<{ error?: string; balance?: number }> {
  const res = await adminRpc('admin_deduct_livme_coins', {
    p_target_user_id: userId, p_amount: amount, p_reason: reason.trim(), p_request_id: requestId,
  });
  if (res?.error) return { error: res.error };
  await adminLog('livme_coins_manual_deduct', userId, `${amount} LC · ${reason.trim()}`);
  return { balance: Number(res?.balance) };
}

export async function adminListUsers(term: string | null = null, page = 0, pageSize = 50): Promise<{ users?: any[]; total?: number; error?: string }> {
  const safePage = Math.max(0, Math.floor(page));
  const safePageSize = Math.min(100, Math.max(1, Math.floor(pageSize)));
  const res = await adminRpc('admin_list_users', {
    p_search: term?.trim() || null,
    p_limit: safePageSize,
    p_offset: safePage * safePageSize,
  });
  if (res?.error) return { error: res.error };
  return {
    users: Array.isArray(res?.users) ? res.users : [],
    total: Number.isFinite(Number(res?.total)) ? Number(res.total) : 0,
  };
}

export async function adminSearchUsers(term: string): Promise<{ users?: any[]; error?: string }> {
  const res = await adminListUsers(term, 0, 100);
  return { users: res.users, error: res.error };
}

export async function adminGetUserMessages(userId: string): Promise<{ messages?: any[]; error?: string }> {
  const res = await adminRpc('get_user_messages', { target_user_id: userId });
  if (res?.error) return { error: res.error };
  return { messages: Array.isArray(res) ? res : [] };
}

export async function adminFlagUser(userId: string, reason: string): Promise<{ error?: string }> {
  const res = await adminRpc('flag_user', { target_id: userId, reason });
  if (res?.error) return { error: res.error };
  await adminLog('flag_user', userId, reason);
  return {};
}

export async function adminUnflagUser(userId: string): Promise<{ error?: string }> {
  const res = await adminRpc('unflag_user', { target_id: userId });
  if (res?.error) return { error: res.error };
  await adminLog('unflag_user', userId, '');
  return {};
}

export async function adminBanUser(userId: string, reason: string): Promise<{ error?: string }> {
  const res = await adminRpc('ban_user', { target_id: userId, reason });
  if (res?.error) return { error: res.error };
  await adminLog('ban_user', userId, reason);
  return {};
}

export async function adminUnbanUser(userId: string): Promise<{ error?: string }> {
  const res = await adminRpc('unban_user', { target_id: userId });
  if (res?.error) return { error: res.error };
  await adminLog('unban_user', userId, '');
  return {};
}

export async function adminGetBannedUsers(): Promise<{ users?: any[]; error?: string }> {
  const res = await adminRpc('get_banned_users');
  if (res?.error) return { error: res.error };
  return { users: Array.isArray(res) ? res : [] };
}

export async function checkIsBanned(userId: string): Promise<boolean> {
  const headers = rpcToken();
  if (!headers) return false;
  const res = await supabaseFetch(`${SUPABASE_URL}/rest/v1/rpc/is_user_banned`, {
    method: 'POST', headers, body: JSON.stringify({ check_id: userId })
  });
  return res === true;
}

export async function getBanReason(userId: string): Promise<string> {
  const headers = rpcToken();
  if (!headers) return '';
  const res = await supabaseFetch(`${SUPABASE_URL}/rest/v1/rpc/get_ban_info`, {
    method: 'POST', headers, body: JSON.stringify({ check_id: userId })
  });
  if (res?.error) return '';
  return res?.reason || '';
}

export async function adminGetReportedMessages(): Promise<{ reports?: any[]; error?: string }> {
  const res = await adminRpc('get_reported_messages');
  if (res?.error) return { error: res.error };
  return { reports: Array.isArray(res) ? res : [] };
}

export async function adminDismissReport(reportId: string): Promise<{ error?: string }> {
  const res = await adminRpc('dismiss_report', { report_id: reportId });
  if (res?.error) return { error: res.error };
  await adminLog('dismiss_report', reportId, '');
  return {};
}

export async function adminGetLogs(): Promise<{ logs?: any[]; error?: string }> {
  const headers = rpcToken();
  if (!headers) return { error: 'Not authenticated' };
  if (!(await isAdmin())) return { error: 'Unauthorized: administrator access required.' };
  const res = await supabaseFetch(
    `${SUPABASE_URL}/rest/v1/action_logs?order=created_at.desc&limit=100`,
    { headers }
  );
  if (res?.error) return { error: res.error };
  return { logs: Array.isArray(res) ? res : [] };
}

async function adminLog(action: string, targetId: string, details: string) {
  const headers = rpcToken();
  if (!headers) return;
  const u = parseJwt(headers.Authorization.replace('Bearer ', ''));
  if (!u) return;
  await supabaseFetch(`${SUPABASE_URL}/rest/v1/action_logs`, {
    method: 'POST', headers: { ...headers, 'Prefer': 'return=minimal' },
    body: JSON.stringify({ admin_id: u.id, action, target_id: targetId, details }),
  });
}


export interface ChatPostCommentReaction {
  comment_id: string;
  user_id: string;
  reaction: 'like' | 'love' | 'haha' | 'wow' | 'sad' | 'angry';
}
export interface ChatPostComment {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
  author_name?: string;
  author_avatar?: string;
  reactions: ChatPostCommentReaction[];
}
export interface ChatPostReaction {
  post_id: string;
  user_id: string;
  reaction: 'like' | 'love' | 'haha' | 'wow' | 'sad' | 'angry';
}
export interface ChatPost {
  id: string;
  user_id: string;
  content: string;
  image_paths: string[];
  is_private: boolean;
  created_at: string;
  reactions: ChatPostReaction[];
  comments: ChatPostComment[];
}

export async function getProfilePosts(userId: string, before?: string, beforeId?: string, pageSize = 20): Promise<{ posts?: ChatPost[]; error?: string }> {
  const token = getStoredSession();
  if (!token) return { error: 'Not authenticated' };
  if (!userId) return { error: 'Profile not found' };
  try {
    const headers = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` };
    const rows = await supabaseFetch(
      `${SUPABASE_URL}/rest/v1/chat_posts?select=id,user_id,content,image_paths,is_private,created_at&user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc,id.desc&limit=${Math.min(30, Math.max(1, pageSize))}${before && beforeId ? `&or=(created_at.lt.${encodeURIComponent(before)},and(created_at.eq.${encodeURIComponent(before)},id.lt.${encodeURIComponent(beforeId)}))` : before ? `&created_at=lt.${encodeURIComponent(before)}` : ''}`,
      { headers }
    );
    if (rows?.error) return { error: rows.error };
    const basePosts = Array.isArray(rows) ? rows as any[] : [];
    if (!basePosts.length) return { posts: [] };
    const ids = basePosts.map(post => post.id).join(',');
    const [reactionRows, commentRows] = await Promise.all([
      supabaseFetch(`${SUPABASE_URL}/rest/v1/chat_post_reactions?select=post_id,user_id,reaction&post_id=in.(${ids})`, { headers }),
      supabaseFetch(`${SUPABASE_URL}/rest/v1/chat_post_comments?select=id,post_id,user_id,content,created_at&post_id=in.(${ids})&order=created_at.asc&limit=100`, { headers }),
    ]);
    if (reactionRows?.error) return { error: reactionRows.error };
    if (commentRows?.error) return { error: commentRows.error };
    const reactions = Array.isArray(reactionRows) ? reactionRows : [];
    const comments = Array.isArray(commentRows) ? commentRows : [];
    const commentIds = comments.map((item: any) => item.id).filter(Boolean);
    const commentReactionRows = commentIds.length
      ? await supabaseFetch(`${SUPABASE_URL}/rest/v1/chat_post_comment_reactions?select=comment_id,user_id,reaction&comment_id=in.(${commentIds.join(',')})`, { headers })
      : [];
    if (commentReactionRows?.error) return { error: commentReactionRows.error };
    const commentReactions = Array.isArray(commentReactionRows) ? commentReactionRows : [];
    const commenterIds = Array.from(new Set(comments.map((item: any) => item.user_id).filter(Boolean))) as string[];
    const commenterProfiles = await Promise.all(commenterIds.map(async (commenterId) => {
      try {
        const profileRows = commenterId === parseJwt(token)?.id
          ? await supabaseFetch(`${SUPABASE_URL}/rest/v1/chat_profiles?user_id=eq.${encodeURIComponent(commenterId)}&select=display_name,avatar_url`, { headers })
          : await supabaseFetch(`${SUPABASE_URL}/rest/v1/rpc/get_public_chat_profile`, {
              method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
              body: JSON.stringify({ target_user_id: commenterId }),
            });
        const profile = Array.isArray(profileRows) ? profileRows[0] : null;
        return [commenterId, { name: profile?.display_name || 'Member', avatar: profile?.avatar_url || '' }] as const;
      } catch { return [commenterId, { name: 'Member', avatar: '' }] as const; }
    }));
    const profileByUser = new Map(commenterProfiles);
    return { posts: basePosts.map(post => ({
      ...post,
      reactions: reactions.filter((item: any) => item.post_id === post.id),
      comments: comments.filter((item: any) => item.post_id === post.id).map((comment: any) => ({
        ...comment,
        author_name: profileByUser.get(comment.user_id)?.name || 'Member',
        author_avatar: profileByUser.get(comment.user_id)?.avatar || '',
        reactions: commentReactions.filter((item: any) => item.comment_id === comment.id),
      })),
    })) as ChatPost[] };
  } catch (e: any) {
    return { error: e.message || 'Could not load posts' };
  }
}

export async function createProfilePost(content: string, imagePaths: string[] = []): Promise<{ post?: ChatPost; error?: string }> {
  const token = getStoredSession();
  if (!token) return { error: 'Not authenticated' };
  const user = parseJwt(token);
  if (!user) return { error: 'Invalid token' };
  const clean = content.trim();
  if (!clean && imagePaths.length === 0) return { error: 'Write a caption or add at least one photo.' };
  if (imagePaths.length > 5) return { error: 'You can add up to 5 photos per post.' };
  if (imagePaths.some(path => !path.startsWith(`${user.id}/posts/`) || !path.endsWith('.webp'))) return { error: 'Invalid post photo path.' };
  if (clean.length > 500) return { error: 'Posts are limited to 500 characters.' };
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 15000);
  try {
    const rows = await supabaseFetch(`${SUPABASE_URL}/rest/v1/chat_posts?select=id,user_id,content,image_paths,created_at`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({ user_id: user.id, content: clean, image_paths: imagePaths }),
    });
    if (rows?.error) return { error: rows.error };
    if (!Array.isArray(rows) || !rows[0]) return { error: 'Post was not saved.' };
    // Return the saved post immediately. Retention cleanup is deliberately
    // best-effort and runs in the background so Storage listing/deletion latency
    // cannot keep the preview or publishing spinner open.
    void (async () => {
      try {
        const [savedPosts, storedImages] = await Promise.all([
          supabaseFetch(`${SUPABASE_URL}/rest/v1/chat_posts?select=image_paths&user_id=eq.${encodeURIComponent(user.id)}&order=created_at.desc&limit=100`, {
            headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
          }),
          fetch(`${SUPABASE_URL}/storage/v1/object/list/profile-photos`, {
            method: 'POST',
            headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ prefix: `${user.id}/posts`, limit: 1000, offset: 0 }),
          }),
        ]);
        const newPostIsConfirmed = Array.isArray(savedPosts) && savedPosts.some((row: any) =>
          imagePaths.length === 0 || imagePaths.every(path => (row.image_paths || []).includes(path))
        );
        if (newPostIsConfirmed && storedImages.ok) {
          const keep = new Set(savedPosts.flatMap((row: any) => row.image_paths || []));
          const files = await storedImages.json();
          const stale = (Array.isArray(files) ? files : [])
            .filter((file: any) => typeof file.name === 'string' && file.name.endsWith('.webp'))
            .map((file: any) => `${user.id}/posts/${file.name}`)
            .filter((path: string) => !keep.has(path));
          if (stale.length) await fetch(`${SUPABASE_URL}/storage/v1/object/profile-photos`, {
            method: 'DELETE',
            headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ prefixes: stale }),
          });
        }
      } catch { /* Cleanup can retry after the next successful post. */ }
    })();
    return { post: { ...rows[0], is_private: rows[0].is_private ?? false, reactions: [], comments: [] } as ChatPost };
  } catch (e: any) {
    return { error: e?.name === 'AbortError' ? 'Creating the photo post timed out after 15 seconds. Please try again.' : (e.message || 'Could not publish post') };
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function updateProfilePost(postId: string, content: string): Promise<{ error?: string }> {
  const token = getStoredSession(); const user = token ? parseJwt(token) : null;
  if (!token || !user) return { error: 'Not authenticated' };
  const clean = content.trim();
  if (clean.length > 500) return { error: 'Posts are limited to 500 characters.' };
  try {
    const result = await supabaseFetch(`${SUPABASE_URL}/rest/v1/chat_posts?id=eq.${encodeURIComponent(postId)}&user_id=eq.${encodeURIComponent(user.id)}`, {
      method: 'PATCH', headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ content: clean }),
    });
    return result?.error ? { error: result.error } : {};
  } catch (e: any) { return { error: e.message || 'Could not update post.' }; }
}

export async function setProfilePostPrivacy(postId: string, isPrivate: boolean): Promise<{ error?: string }> {
  const token = getStoredSession(); const user = token ? parseJwt(token) : null;
  if (!token || !user) return { error: 'Not authenticated' };
  try {
    const result = await supabaseFetch(`${SUPABASE_URL}/rest/v1/chat_posts?id=eq.${encodeURIComponent(postId)}&user_id=eq.${encodeURIComponent(user.id)}`, {
      method: 'PATCH', headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ is_private: isPrivate }),
    });
    if (result?.error) return { error: result.error };
    if (!Array.isArray(result) || result.length !== 1 || result[0]?.is_private !== isPrivate) return { error: 'Privacy change was not confirmed. Please refresh and try again.' };
    return {};
  } catch (e: any) { return { error: e.message || 'Could not change post privacy.' }; }
}

export async function setProfilePostReaction(postId: string, reaction: ChatPostReaction['reaction'] | null): Promise<{ error?: string }> {
  const token = getStoredSession(); const user = token ? parseJwt(token) : null;
  if (!token || !user) return { error: 'Not authenticated' };
  try {
    const url = `${SUPABASE_URL}/rest/v1/chat_post_reactions?post_id=eq.${encodeURIComponent(postId)}&user_id=eq.${encodeURIComponent(user.id)}`;
    const result = reaction
      ? await supabaseFetch(`${SUPABASE_URL}/rest/v1/chat_post_reactions?on_conflict=post_id,user_id`, {
          method: 'POST', headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify({ post_id: postId, user_id: user.id, reaction }),
        })
      : await supabaseFetch(url, { method: 'DELETE', headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, Prefer: 'return=minimal' } });
    return result?.error ? { error: result.error } : {};
  } catch (e: any) { return { error: e.message || 'Could not save reaction.' }; }
}

export async function setProfileCommentReaction(commentId: string, reaction: ChatPostCommentReaction['reaction'] | null): Promise<{ error?: string }> {
  const token = getStoredSession(); const user = token ? parseJwt(token) : null;
  if (!token || !user) return { error: 'Not authenticated' };
  const headers = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' };
  try {
    const removed = await supabaseFetch(`${SUPABASE_URL}/rest/v1/chat_post_comment_reactions?comment_id=eq.${encodeURIComponent(commentId)}&user_id=eq.${encodeURIComponent(user.id)}`, {
      method: 'DELETE', headers,
    });
    if (removed?.error) return { error: removed.error };
    if (!reaction) return {};
    const inserted = await supabaseFetch(`${SUPABASE_URL}/rest/v1/chat_post_comment_reactions`, {
      method: 'POST', headers, body: JSON.stringify({ comment_id: commentId, user_id: user.id, reaction }),
    });
    return inserted?.error ? { error: inserted.error } : {};
  } catch (e: any) { return { error: e.message || 'Could not save comment reaction.' }; }
}

export async function addProfilePostComment(postId: string, content: string): Promise<{ comment?: ChatPostComment; error?: string }> {
  const token = getStoredSession(); const user = token ? parseJwt(token) : null;
  if (!token || !user) return { error: 'Not authenticated' };
  const clean = content.trim();
  if (!clean || clean.length > 500) return { error: 'Comments must be between 1 and 500 characters.' };
  try {
    const rows = await supabaseFetch(`${SUPABASE_URL}/rest/v1/chat_post_comments?select=id,post_id,user_id,content,created_at`, {
      method: 'POST', headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ post_id: postId, user_id: user.id, content: clean }),
    });
    if (rows?.error) return { error: rows.error };
    return Array.isArray(rows) && rows[0] ? { comment: { ...rows[0], reactions: [] } as ChatPostComment } : { error: 'Comment was not saved.' };
  } catch (e: any) { return { error: e.message || 'Could not add comment.' }; }
}

export async function removeProfilePostImage(postId: string, imagePath: string): Promise<{ error?: string }> {
  const token = getStoredSession();
  if (!token) return { error: 'Not authenticated' };
  const user = parseJwt(token);
  if (!user || !imagePath.startsWith(`${user.id}/posts/`)) return { error: 'Invalid post photo.' };
  try {
    const rows = await supabaseFetch(
      `${SUPABASE_URL}/rest/v1/chat_posts?id=eq.${encodeURIComponent(postId)}&user_id=eq.${encodeURIComponent(user.id)}&select=image_paths`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } }
    );
    if (rows?.error) return { error: rows.error };
    if (!Array.isArray(rows) || !rows[0]) return { error: 'Post not found.' };
    const nextPaths = (rows[0].image_paths || []).filter((path: string) => path !== imagePath);
    const updated = await supabaseFetch(
      `${SUPABASE_URL}/rest/v1/chat_posts?id=eq.${encodeURIComponent(postId)}&user_id=eq.${encodeURIComponent(user.id)}`,
      { method: 'PATCH', headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ image_paths: nextPaths }) }
    );
    if (updated?.error) return { error: updated.error };
    const removed = await fetch(`${SUPABASE_URL}/storage/v1/object/profile-photos`, {
      method: 'DELETE',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: [imagePath] }),
    });
    if (!removed.ok) return { error: (await removed.text()) || 'Photo reference removed, but file cleanup failed.' };
    return {};
  } catch (e: any) {
    return { error: e.message || 'Could not remove post photo.' };
  }
}

export async function deleteProfilePost(postId: string): Promise<{ error?: string }> {
  const token = getStoredSession();
  if (!token) return { error: 'Not authenticated' };
  const user = parseJwt(token);
  if (!user) return { error: 'Invalid token' };
  try {
    const rows = await supabaseFetch(
      `${SUPABASE_URL}/rest/v1/chat_posts?id=eq.${encodeURIComponent(postId)}&user_id=eq.${encodeURIComponent(user.id)}&select=image_paths`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } }
    );
    if (rows?.error) return { error: rows.error };
    const paths = Array.isArray(rows) && Array.isArray(rows[0]?.image_paths) ? rows[0].image_paths : [];
    if (paths.length) {
      const response = await fetch(`${SUPABASE_URL}/storage/v1/object/profile-photos`, {
        method: 'DELETE',
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefixes: paths }),
      });
      if (!response.ok) return { error: (await response.text()) || 'Could not remove post photos.' };
    }
    const result = await supabaseFetch(
      `${SUPABASE_URL}/rest/v1/chat_posts?id=eq.${encodeURIComponent(postId)}&user_id=eq.${encodeURIComponent(user.id)}`,
      { method: 'DELETE', headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, Prefer: 'return=minimal' } }
    );
    if (result?.error) return { error: result.error };
    return {};
  } catch (e: any) {
    return { error: e.message || 'Could not delete post' };
  }
}



export interface ProfilePhoto {
  name: string;
  url: string;
  size: number;
}

export async function uploadProfilePhoto(file: File, slot: 'avatar' | 'cover' | 'gallery' | 'post'): Promise<{ photo?: ProfilePhoto; error?: string }> {
  const token = getStoredSession();
  if (!token) return { error: 'Not authenticated' };
  const user = parseJwt(token);
  if (!user) return { error: 'Invalid token' };
  if (file.type !== 'image/webp' || file.size < 1 || file.size > 200 * 1024) {
    return { error: 'Photos must be WebP and no larger than 200 KB.' };
  }
  const name = slot === 'avatar' ? 'avatar.webp' : slot === 'cover' ? 'cover.webp' : slot === 'post' ? `posts/post-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.webp` : `gallery-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`;
  const path = `${user.id}/${name}`;
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(`${SUPABASE_URL}/storage/v1/object/profile-photos/${path.split('/').map(encodeURIComponent).join('/')}`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'image/webp',
        'Cache-Control': '31536000',
        'x-upsert': slot === 'gallery' || slot === 'post' ? 'false' : 'true',
      },
      body: file,
    });
    if (!response.ok) {
      const body = await response.text();
      let message = body;
      try { const parsed = JSON.parse(body); message = parsed.message || parsed.error || parsed.msg || body; } catch {}
      if (response.status === 413) return { error: 'This photo is over the 200 KB limit.' };
      if (/quota|profile_photo_quota_ok|row-level security|policy/i.test(message)) {
        return { error: 'Photo storage limit reached: maximum 25 images and 5 MB total per account.' };
      }
      return { error: message || 'Photo upload failed.' };
    }
    return {
      photo: {
        name,
        url: `${SUPABASE_URL}/storage/v1/object/public/profile-photos/${path.split('/').map(encodeURIComponent).join('/')}`,
        size: file.size,
      },
    };
  } catch (e: any) {
    return { error: e?.name === 'AbortError' ? 'Photo upload timed out after 30 seconds. Please try again.' : (e.message || 'Photo upload failed.') };
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function getProfilePhotos(userId: string): Promise<{ photos?: ProfilePhoto[]; error?: string }> {
  const token = getStoredSession();
  if (!token) return { error: 'Not authenticated' };
  if (!userId) return { photos: [] };
  try {
    const listPrefix = async (prefix: string) => {
      const response = await fetch(`${SUPABASE_URL}/storage/v1/object/list/profile-photos`, {
        method: 'POST',
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix, limit: 100, offset: 0, sortBy: { column: 'name', order: 'asc' } }),
      });
      if (!response.ok) throw new Error((await response.text()) || 'Could not load photos.');
      return await response.json();
    };
    // Post images are rendered from chat_posts so Photos shows the full
    // original post, not a detached Storage thumbnail. This list is only for
    // standalone gallery uploads and legacy profile/cover files.
    const rootRows = await listPrefix(userId);
    const rows = Array.isArray(rootRows) ? rootRows.filter((row: any) =>
      row.name?.toLowerCase().endsWith('.webp')
    ).map((row: any) => ({ ...row, relativeName: row.name })) : [];
    return { photos: rows.map((row: any) => {
      const path = `${userId}/${row.relativeName}`;
      const version = row.updated_at || row.created_at || row.metadata?.lastModified;
      const baseUrl = `${SUPABASE_URL}/storage/v1/object/public/profile-photos/${path.split('/').map(encodeURIComponent).join('/')}`;
      return {
        name: row.relativeName,
        // Avatar and cover objects use stable paths; version the gallery URL so
        // an overwritten profile image cannot remain stale in the browser cache.
        url: version ? `${baseUrl}?v=${encodeURIComponent(version)}` : baseUrl,
        size: Number(row.metadata?.size || 0),
      };
    }) };
  } catch (e: any) {
    return { error: e.message || 'Could not load photos.' };
  }
}

export async function deleteProfilePhoto(name: string): Promise<{ error?: string }> {
  const token = getStoredSession();
  if (!token) return { error: 'Not authenticated' };
  const user = parseJwt(token);
  if (!user) return { error: 'Invalid token' };
  if (!name || name.includes('..') || !/^(?:avatar|cover|gallery-[a-zA-Z0-9-]+|posts\/post-[a-zA-Z0-9-]+)\.webp$/.test(name)) return { error: 'Invalid photo path.' };
  try {
    const response = await fetch(`${SUPABASE_URL}/storage/v1/object/profile-photos`, {
      method: 'DELETE',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: [`${user.id}/${name}`] }),
    });
    if (!response.ok) return { error: (await response.text()) || 'Could not delete photo.' };
    return {};
  } catch (e: any) {
    return { error: e.message || 'Could not delete photo.' };
  }
}


// ── LivMe customer support ────────────────────────────────────────────────
export interface SupportConversation {
  id: string;
  user_id: string | null;
  guest_name: string | null;
  guest_email: string | null;
  subject: string;
  status: 'open' | 'pending' | 'resolved';
  created_at: string;
  updated_at: string;
  last_message_at: string;
}
export interface SupportMessage {
  id: string;
  conversation_id?: string;
  sender_type: 'user' | 'guest' | 'operator';
  body: string;
  created_at: string;
}
function supportAuthHeaders(token?: string) {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token || SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  };
}
export async function getSupportConversations(): Promise<{ conversations?: SupportConversation[]; error?: string }> {
  const token = getStoredSession();
  if (!token) return { error: 'Not authenticated' };
  try {
    const rows = await supabaseFetch(`${SUPABASE_URL}/rest/v1/support_conversations?select=*&order=updated_at.desc&limit=50`, { headers: supportAuthHeaders(token) });
    if (rows?.error) return { error: rows.error };
    return { conversations: Array.isArray(rows) ? rows : [] };
  } catch (e: any) { return { error: e.message || 'Could not load support conversations.' }; }
}
export async function getSupportMessages(conversationId: string): Promise<{ messages?: SupportMessage[]; error?: string }> {
  const token = getStoredSession();
  if (!token) return { error: 'Not authenticated' };
  try {
    const rows = await supabaseFetch(`${SUPABASE_URL}/rest/v1/support_messages?select=id,conversation_id,sender_type,body,created_at&conversation_id=eq.${encodeURIComponent(conversationId)}&order=created_at.asc&limit=200`, { headers: supportAuthHeaders(token) });
    if (rows?.error) return { error: rows.error };
    return { messages: Array.isArray(rows) ? rows : [] };
  } catch (e: any) { return { error: e.message || 'Could not load support messages.' }; }
}
export async function createSupportConversation(subject: string, message: string): Promise<{ conversationId?: string; error?: string }> {
  const token = getStoredSession();
  if (!token) return { error: 'Not authenticated' };
  try {
    const result = await supabaseFetch(`${SUPABASE_URL}/rest/v1/rpc/create_support_conversation`, {
      method: 'POST', headers: supportAuthHeaders(token), body: JSON.stringify({ p_subject: subject, p_message: message }),
    });
    if (result?.error) return { error: result.error };
    return { conversationId: typeof result === 'string' ? result : undefined };
  } catch (e: any) { return { error: e.message || 'Could not start support conversation.' }; }
}
export async function sendSupportMessage(conversationId: string, message: string): Promise<{ error?: string }> {
  const token = getStoredSession();
  if (!token) return { error: 'Not authenticated' };
  try {
    const result = await supabaseFetch(`${SUPABASE_URL}/rest/v1/rpc/send_support_message`, {
      method: 'POST', headers: supportAuthHeaders(token), body: JSON.stringify({ p_conversation_id: conversationId, p_message: message }),
    });
    return result?.error ? { error: result.error } : {};
  } catch (e: any) { return { error: e.message || 'Could not send support message.' }; }
}
export async function createGuestSupportConversation(name: string, email: string, subject: string, message: string): Promise<{ conversationId?: string; accessToken?: string; error?: string }> {
  try {
    const result = await supabaseFetch(`${SUPABASE_URL}/rest/v1/rpc/create_guest_support_conversation`, {
      method: 'POST', headers: supportAuthHeaders(), body: JSON.stringify({ p_name: name, p_email: email, p_subject: subject, p_message: message }),
    });
    if (result?.error) return { error: result.error };
    return { conversationId: result?.conversation_id, accessToken: result?.access_token };
  } catch (e: any) { return { error: e.message || 'Could not start guest support conversation.' }; }
}
export async function getGuestSupportMessages(conversationId: string, accessToken: string): Promise<{ messages?: SupportMessage[]; error?: string }> {
  try {
    const rows = await supabaseFetch(`${SUPABASE_URL}/rest/v1/rpc/get_guest_support_messages`, {
      method: 'POST', headers: supportAuthHeaders(), body: JSON.stringify({ p_conversation_id: conversationId, p_access_token: accessToken }),
    });
    if (rows?.error) return { error: rows.error };
    return { messages: Array.isArray(rows) ? rows : [] };
  } catch (e: any) { return { error: e.message || 'Could not load guest support messages.' }; }
}
export async function sendGuestSupportMessage(conversationId: string, accessToken: string, message: string): Promise<{ error?: string }> {
  try {
    const result = await supabaseFetch(`${SUPABASE_URL}/rest/v1/rpc/send_guest_support_message`, {
      method: 'POST', headers: supportAuthHeaders(), body: JSON.stringify({ p_conversation_id: conversationId, p_access_token: accessToken, p_message: message }),
    });
    return result?.error ? { error: result.error } : {};
  } catch (e: any) { return { error: e.message || 'Could not send guest support message.' }; }
}
export async function adminReplySupportMessage(conversationId: string, message: string): Promise<{ error?: string }> {
  const token = getStoredSession();
  if (!token) return { error: 'Not authenticated' };
  try {
    const result = await supabaseFetch(`${SUPABASE_URL}/rest/v1/rpc/admin_reply_support_message`, {
      method: 'POST', headers: supportAuthHeaders(token), body: JSON.stringify({ p_conversation_id: conversationId, p_message: message }),
    });
    return result?.error ? { error: result.error } : {};
  } catch (e: any) { return { error: e.message || 'Could not send operator reply.' }; }
}
export async function adminUpdateSupportStatus(conversationId: string, status: 'open' | 'pending' | 'resolved'): Promise<{ error?: string }> {
  const token = getStoredSession();
  if (!token) return { error: 'Not authenticated' };
  try {
    const result = await supabaseFetch(`${SUPABASE_URL}/rest/v1/rpc/admin_update_support_status`, {
      method: 'POST', headers: supportAuthHeaders(token), body: JSON.stringify({ p_conversation_id: conversationId, p_status: status }),
    });
    return result?.error ? { error: result.error } : {};
  } catch (e: any) { return { error: e.message || 'Could not update support status.' }; }
}

const SUPABASE_URL = 'https://btkcubibosbtpxcronnd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0a2N1Ymlib3NidHB4Y3Jvbm5kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwMzI1ODAsImV4cCI6MjA5ODYwODU4MH0.IqR7dJbZJm83c_XHz923GQrBWdf5GCaNDYMPg6z8kj0';

async function supabaseFetch(url: string, opts: RequestInit) {
  const res = await fetch(url, opts);
  if (!res.ok) {
    const txt = await res.text();
    let json;
    try { json = JSON.parse(txt); } catch { json = {}; }
    const msg = json.error_description || json.msg || json.error || `HTTP ${res.status}: ${txt.slice(0, 100)}`;
    if (res.status === 429) return { error: 'Too many requests. Please wait a minute before trying again.' };
    if (msg.toLowerCase().includes('rate') || msg.toLowerCase().includes('over_limit') || msg.toLowerCase().includes('over_request_rate_limit')) return { error: 'Email rate limit exceeded. Please wait a few minutes before trying again.' };
    return { error: msg };
  }
  const text = await res.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return {}; }
}

export interface SupabaseUser {
  id: string;
  email?: string;
}

type Listener = (user: SupabaseUser | null) => void;
const listeners: Listener[] = [];

function notify(user: SupabaseUser | null) {
  listeners.forEach(fn => fn(user));
}

function getStoredSession(): string | null {
  try { return localStorage.getItem('supa_session'); } catch { return null; }
}

function setStoredSession(token: string | null) {
  try { if (token) localStorage.setItem('supa_session', token); else localStorage.removeItem('supa_session'); } catch {}
}

export function setSessionToken(token: string | null) {
  setStoredSession(token);
  if (token) notify(parseJwt(token));
  else notify(null);
}

function parseJwt(token: string): SupabaseUser | null {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(base64));
    return { id: payload.sub, email: payload.email };
  } catch { return null; }
}

export async function signUp(email: string, password: string): Promise<{ error?: string }> {
  try {
    const data = await supabaseFetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
      body: JSON.stringify({ email, password }),
    });
    if (data.error) return { error: data.error };
    if (data.access_token) {
      setStoredSession(data.access_token);
      notify(parseJwt(data.access_token));
    }
    return {};
  } catch (e: any) {
    return { error: e.message || 'Network error' };
  }
}

export async function signIn(email: string, password: string): Promise<{ error?: string }> {
  try {
    const data = await supabaseFetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
      body: JSON.stringify({ email, password }),
    });
    if (data.error) return { error: data.error };
    if (data.access_token) {
      setStoredSession(data.access_token);
      notify(parseJwt(data.access_token));
    }
    return {};
  } catch (e: any) {
    return { error: e.message || 'Network error' };
  }
}

export async function resetPassword(email: string): Promise<{ error?: string }> {
  try {
    const data = await supabaseFetch(`${SUPABASE_URL}/auth/v1/recover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
      body: JSON.stringify({ email }),
    });
    if (data.error) return { error: data.error };
    return {};
  } catch (e: any) {
    return { error: e.message || 'Network error' };
  }
}

export async function updatePassword(newPassword: string): Promise<{ error?: string }> {
  const token = getStoredSession();
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

export async function signOut() {
  setStoredSession(null);
  notify(null);
}

export function getSession(): SupabaseUser | null {
  const token = getStoredSession();
  if (!token) return null;
  const user = parseJwt(token);
  const exp = JSON.parse(atob(token.split('.')[1])).exp;
  if (Date.now() >= exp * 1000) {
    setStoredSession(null);
    return null;
  }
  return user;
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
      return { profile: { display_name: p.display_name, bio: p.bio, avatar_url: p.avatar_url, cover_url: p.cover_url, share_name: p.share_name, share_bio: p.share_bio } };
    }
    return { profile: { display_name: 'Anonymous', bio: '', avatar_url: '', cover_url: '', share_name: false, share_bio: false } };
  } catch (e: any) {
    return { error: e.message };
  }
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

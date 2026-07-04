const SUPABASE_URL = 'https://btkcubibosbtpxcronnd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0a2N1Ymlib3NidHB4Y3Jvbm5kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwMzI1ODAsImV4cCI6MjA5ODYwODU4MH0.IqR7dJbZJm83c_XHz923GQrBWdf5GCaNDYMPg6z8kj0';

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

function parseJwt(token: string): SupabaseUser | null {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(base64));
    return { id: payload.sub, email: payload.email };
  } catch { return null; }
}

export async function signUp(email: string, password: string): Promise<{ error?: string }> {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (data.error) return { error: data.error_description || data.msg || data.error };
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
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (data.error) return { error: data.error_description || data.msg || data.error };
    if (data.access_token) {
      setStoredSession(data.access_token);
      notify(parseJwt(data.access_token));
    }
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

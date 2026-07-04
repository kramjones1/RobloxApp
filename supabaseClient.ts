const SUPABASE_URL = 'https://btkcubibosbtpxcronnd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0a2N1Ymlib3NidHB4Y3Jvbm5kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwMzI1ODAsImV4cCI6MjA5ODYwODU4MH0.IqR7dJbZJm83c_XHz923GQrBWdf5GCaNDYMPg6z8kj0';

async function supabaseFetch(url: string, opts: RequestInit) {
  const res = await fetch(url, opts);
  if (!res.ok) {
    const txt = await res.text();
    let json;
    try { json = JSON.parse(txt); } catch { json = {}; }
    return { error: json.error_description || json.msg || json.error || `HTTP ${res.status}: ${txt.slice(0, 100)}` };
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
      return { profile: { display_name: p.display_name, bio: p.bio, avatar_url: p.avatar_url, share_name: p.share_name, share_bio: p.share_bio } };
    }
    return { profile: { display_name: 'Anonymous', bio: '', avatar_url: '', share_name: false, share_bio: false } };
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

export interface MessageRow {
  id: number;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
  read_at: string | null;
}

function getHeaders(token: string) {
  return { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
}

function authCheck() {
  const token = getStoredSession();
  const user = token ? parseJwt(token) : null;
  if (!token || !user) return { token: null, user: null, error: 'Not authenticated' as string };
  return { token, user, error: '' as string };
}

export async function searchUsers(query: string): Promise<{ users?: { user_id: string; display_name: string; bio: string }[]; error?: string }> {
  const { token, error } = authCheck();
  if (error || !token) return { error };
  try {
    const data = await supabaseFetch(
      `${SUPABASE_URL}/rest/v1/chat_profiles?display_name=ilike.*${encodeURIComponent(query)}*&select=user_id,display_name,bio&limit=20`,
      { headers: getHeaders(token) }
    );
    if (data.error) return { error: data.error };
    return { users: data };
  } catch (e: any) {
    return { error: e.message };
  }
}

export async function getUserProfile(userId: string): Promise<{ profile?: { user_id: string; display_name: string; bio: string }; error?: string }> {
  const { token, error } = authCheck();
  if (error || !token) return { error };
  try {
    const data = await supabaseFetch(
      `${SUPABASE_URL}/rest/v1/chat_profiles?user_id=eq.${userId}&select=user_id,display_name,bio`,
      { headers: getHeaders(token) }
    );
    if (data.error) return { error: data.error };
    if (Array.isArray(data) && data.length > 0) return { profile: data[0] };
    return { error: 'Not found' };
  } catch (e: any) {
    return { error: e.message };
  }
}

export async function sendMessage(receiverId: string, content: string): Promise<{ error?: string }> {
  const { token, user, error } = authCheck();
  if (error || !token || !user) return { error: 'Not authenticated' };
  try {
    const res = await supabaseFetch(`${SUPABASE_URL}/rest/v1/messages`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify({ sender_id: user.id, receiver_id: receiverId, content }),
    });
    if (res?.error) return { error: res.error };
    return {};
  } catch (e: any) {
    return { error: e.message };
  }
}

export async function getConversations(): Promise<{ conversations?: any[]; error?: string }> {
  const { token, user, error } = authCheck();
  if (error || !token || !user) return { error: 'Not authenticated' };
  try {
    const data = await supabaseFetch(
      `${SUPABASE_URL}/rest/v1/messages?or=(sender_id.eq.${user.id},receiver_id.eq.${user.id})&order=created_at.desc&limit=100`,
      { headers: getHeaders(token) }
    );
    if (data.error) return { error: data.error };
    if (!Array.isArray(data)) return { conversations: [] };

    const convMap = new Map<string, { otherId: string; lastMsg: MessageRow; unread: number }>();
    for (const msg of data) {
      const otherId = msg.sender_id === user.id ? msg.receiver_id : msg.sender_id;
      if (!convMap.has(otherId)) {
        convMap.set(otherId, { otherId, lastMsg: msg, unread: (msg.receiver_id === user.id && !msg.read_at) ? 1 : 0 });
      } else {
        const c = convMap.get(otherId)!;
        if (msg.receiver_id === user.id && !msg.read_at) c.unread++;
      }
    }
    return { conversations: Array.from(convMap.values()) };
  } catch (e: any) {
    return { error: e.message };
  }
}

export async function getMessages(otherId: string): Promise<{ messages?: MessageRow[]; error?: string }> {
  const { token, user, error } = authCheck();
  if (error || !token || !user) return { error: 'Not authenticated' };
  try {
    const data = await supabaseFetch(
      `${SUPABASE_URL}/rest/v1/messages?and=(sender_id.eq.${user.id},receiver_id.eq.${otherId})&or=(sender_id.eq.${otherId},receiver_id.eq.${user.id})&order=created_at.asc&limit=200`,
      { headers: getHeaders(token) }
    );
    if (data.error) return { error: data.error };
    if (!Array.isArray(data)) return { messages: [] };

    const unreadIds = data.filter((m: MessageRow) => m.receiver_id === user.id && !m.read_at).map((m: MessageRow) => m.id);
    if (unreadIds.length > 0) {
      supabaseFetch(`${SUPABASE_URL}/rest/v1/messages?id=in.(${unreadIds.join(',')})`, {
        method: 'PATCH',
        headers: { ...getHeaders(token), 'Prefer': 'return=minimal' },
        body: JSON.stringify({ read_at: new Date().toISOString() }),
      }).catch(() => {});
    }
    return { messages: data };
  } catch (e: any) {
    return { error: e.message };
  }
}

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

export function getAccessToken(): string | null { return getStoredSession(); }

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
  if ((user.exp || 0) * 1000 <= Date.now() + 60_000) {
    const refreshed = await doRefresh();
    if (refreshed) return refreshed;
    const latest = getStoredTokens();
    const latestUser = latest?.access_token ? parseJwt(latest.access_token) : null;
    if (!latestUser || (latestUser.exp || 0) * 1000 <= Date.now()) {
      setStoredTokens(null);
      notify(null);
      return null;
    }
    return latest!.access_token;
  }
  return tokens.access_token;
}

export function setSessionToken(token: string | null, refreshToken?: string | null) {
  const existing = getStoredTokens();
  if (token) setStoredTokens({ access_token: token, refresh_token: refreshToken || existing?.refresh_token || '' });
  else setStoredTokens(null);
  if (token) { const p = parseJwt(token); if (p) notify(p); }
  else notify(null);
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
      setStoredTokens({ access_token: data.access_token, refresh_token: data.refresh_token || '' });
      notify(parseJwt(data.access_token));
      return {};
    }
    // Email confirmation is ON — signup succeeded, user needs to confirm email
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
      setStoredTokens({ access_token: data.access_token, refresh_token: data.refresh_token || '' });
      notify(parseJwt(data.access_token));
    }
    return {};
  } catch (e: any) {
    return { error: e.message || 'Network error' };
  }
}

export async function resetPassword(email: string, redirectTo?: string): Promise<{ error?: string }> {
  try {
    const body: any = { email };
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

export function signInWithGoogle() {
  const redirectTo = window.location.origin;
  const url = `${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectTo)}&prompt=select_account`;
  const w = window.open(url, 'google-oauth', 'width=600,height=700,popup=1');
  if (!w) { window.location.href = url; return; }
}

export function signInWithGitHub() {
  const redirectTo = window.location.origin;
  const url = `${SUPABASE_URL}/auth/v1/authorize?provider=github&redirect_to=${encodeURIComponent(redirectTo)}`;
  const w = window.open(url, 'github-oauth', 'width=600,height=700,popup=1');
  if (!w) { window.location.href = url; return; }
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
  date_of_birth?: string;
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
    return {
      profile: {
        display_name: p.display_name || 'Anonymous',
        bio: p.bio || '',
        avatar_url: p.avatar_url || '',
        cover_url: p.cover_url || '',
        share_name: Boolean(p.share_name),
        share_bio: Boolean(p.share_bio),
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
      return { profile: { display_name: p.display_name, bio: p.bio, avatar_url: p.avatar_url, cover_url: p.cover_url, share_name: p.share_name, share_bio: p.share_bio, date_of_birth: p.date_of_birth } };
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

export async function sendMessage(receiverId: string, content: string): Promise<{ error?: string }> {
  const token = getStoredSession();
  if (!token) return { error: 'Not authenticated' };
  const user = parseJwt(token);
  if (!user) return { error: 'Invalid token' };
  if (!content.trim()) return { error: 'Message is empty' };
  try {
    const banned = await supabaseFetch(`${SUPABASE_URL}/rest/v1/rpc/is_user_banned`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ check_id: user.id }),
    });
    if (banned === true) return { error: 'Your account has been suspended.' };
    const res = await supabaseFetch(`${SUPABASE_URL}/rest/v1/chat_messages`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender_id: user.id, receiver_id: receiverId, content: content.trim(),
      }),
    });
    if (res?.error) return { error: res.error };
    return {};
  } catch (e: any) {
    return { error: e.message };
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


export interface ChatPostComment {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
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

export async function getProfilePosts(userId: string): Promise<{ posts?: ChatPost[]; error?: string }> {
  const token = getStoredSession();
  if (!token) return { error: 'Not authenticated' };
  if (!userId) return { error: 'Profile not found' };
  try {
    const headers = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` };
    const rows = await supabaseFetch(
      `${SUPABASE_URL}/rest/v1/chat_posts?select=id,user_id,content,image_paths,is_private,created_at&user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc&limit=20`,
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
    return { posts: basePosts.map(post => ({
      ...post,
      reactions: reactions.filter((item: any) => item.post_id === post.id),
      comments: comments.filter((item: any) => item.post_id === post.id),
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
  try {
    const rows = await supabaseFetch(`${SUPABASE_URL}/rest/v1/chat_posts?select=id,user_id,content,image_paths,created_at`, {
      method: 'POST',
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
    // The database retains the latest 100 posts. Remove any post-image objects
    // that are no longer referenced after the retention trigger has run.
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
    return { post: rows[0] as ChatPost };
  } catch (e: any) {
    return { error: e.message || 'Could not publish post' };
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
    return result?.error ? { error: result.error } : {};
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
    return Array.isArray(rows) && rows[0] ? { comment: rows[0] as ChatPostComment } : { error: 'Comment was not saved.' };
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
  try {
    const response = await fetch(`${SUPABASE_URL}/storage/v1/object/profile-photos/${path.split('/').map(encodeURIComponent).join('/')}`, {
      method: 'POST',
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
    return { error: e.message || 'Photo upload failed.' };
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
    const [rootRows, postRows] = await Promise.all([listPrefix(userId), listPrefix(`${userId}/posts`)]);
    const rows = [
      ...(Array.isArray(rootRows) ? rootRows.filter((row: any) => row.name?.toLowerCase().endsWith('.webp')).map((row: any) => ({ ...row, relativeName: row.name })) : []),
      ...(Array.isArray(postRows) ? postRows.filter((row: any) => row.name?.toLowerCase().endsWith('.webp')).map((row: any) => ({ ...row, relativeName: `posts/${row.name}` })) : []),
    ];
    return { photos: rows.map((row: any) => {
      const path = `${userId}/${row.relativeName}`;
      return {
        name: row.relativeName,
        url: `${SUPABASE_URL}/storage/v1/object/public/profile-photos/${path.split('/').map(encodeURIComponent).join('/')}`,
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

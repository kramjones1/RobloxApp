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
    return { error: msg };
  }
  const text = await res.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return {}; }
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
    return { id: payload.sub, email: payload.email, exp: payload.exp };
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
      setStoredSession(data.access_token);
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
  setStoredSession(null);
  notify(null);
}

export function signInWithGoogle() {
  const redirectTo = window.location.origin;
  const url = `${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectTo)}`;
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
    if (Date.now() >= exp * 1000) {
      setStoredSession(null);
      return null;
    }
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
}

export async function getUserProfile(userId: string): Promise<{ profile?: ChatProfile; error?: string }> {
  const token = getStoredSession();
  if (!token) return { error: 'Not authenticated' };
  try {
    const data = await supabaseFetch(
      `${SUPABASE_URL}/rest/v1/chat_profiles?user_id=eq.${userId}&select=*`,
      { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}` } }
    );
    if (data.error) return { error: data.error };
    if (Array.isArray(data) && data.length > 0) {
      const p = data[0];
      return { profile: { display_name: p.display_name, bio: p.bio, avatar_url: p.avatar_url, cover_url: p.cover_url, share_name: p.share_name, share_bio: p.share_bio } };
    }
    return {};
  } catch (e: any) {
    return { error: e.message };
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
      return { profile: { display_name: p.display_name, bio: p.bio, avatar_url: p.avatar_url, cover_url: p.cover_url, share_name: p.share_name, share_bio: p.share_bio } };
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
    const res = await supabaseFetch(`${SUPABASE_URL}/rest/v1/chat_messages`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender_id: user.id, receiver_id: receiverId, content: content.trim() }),
    });
    if (res?.error) return { error: res.error };
    return {};
  } catch (e: any) {
    return { error: e.message };
  }
}

export async function getConversations(): Promise<{ conversations?: { partnerId: string; lastMessage: ChatMessage; unread: number }[]; error?: string }> {
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
    const convMap = new Map<string, { partnerId: string; lastMessage: ChatMessage; unread: number }>();
    for (const m of messages) {
      const otherId = m.sender_id === user.id ? m.receiver_id : m.sender_id;
      if (!convMap.has(otherId)) {
        convMap.set(otherId, { partnerId: otherId, lastMessage: m, unread: 0 });
      }
      if (!m.read && m.sender_id !== user.id) {
        convMap.get(otherId)!.unread++;
      }
    }
    return { conversations: Array.from(convMap.values()) };
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
    return { messages: res as ChatMessage[] };
  } catch (e: any) {
    return { error: e.message };
  }
}

export async function markAllMessagesRead(): Promise<void> {
  const token = getStoredSession();
  if (!token) { console.log('markAllMessagesRead: no token'); return; }
  const user = parseJwt(token);
  if (!user) { console.log('markAllMessagesRead: no user'); return; }
  try {
    const res = await supabaseFetch(
      `${SUPABASE_URL}/rest/v1/chat_messages?receiver_id=eq.${user.id}&read=eq.false`,
      {
        method: 'PATCH',
        headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ read: true }),
      }
    );
    if (res?.error) console.log('markAllMessagesRead error:', res.error);
    else console.log('markAllMessagesRead success for user', user.id);
  } catch (e) { console.log('markAllMessagesRead catch:', e); }
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
  return supabaseFetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(body ?? {}) });
}

export async function getAdminStats(): Promise<{ stats?: any; error?: string }> {
  const res = await adminRpc('get_admin_stats');
  if (res?.error) return { error: res.error };
  return { stats: res };
}

export async function adminSearchUsers(term: string): Promise<{ users?: any[]; error?: string }> {
  const res = await adminRpc('search_users', { search_term: term });
  if (res?.error) return { error: res.error };
  return { users: Array.isArray(res) ? res : [] };
}

export async function adminGetUserMessages(userId: string): Promise<{ messages?: any[]; error?: string }> {
  const res = await adminRpc('get_user_messages', { target_user_id: userId });
  if (res?.error) return { error: res.error };
  return { messages: Array.isArray(res) ? res : [] };
}

export async function adminFlagUser(userId: string, reason: string): Promise<{ error?: string }> {
  const headers = rpcToken();
  if (!headers) return { error: 'Not authenticated' };
  const res = await supabaseFetch(
    `${SUPABASE_URL}/rest/v1/chat_profiles?user_id=eq.${userId}`,
    { method: 'PATCH', headers: { ...headers, 'Prefer': 'return=minimal' }, body: JSON.stringify({ flagged: true, flag_reason: reason }) }
  );
  if (res?.error) return { error: res.error };
  await adminLog('flag_user', userId, reason);
  return {};
}

export async function adminUnflagUser(userId: string): Promise<{ error?: string }> {
  const headers = rpcToken();
  if (!headers) return { error: 'Not authenticated' };
  const res = await supabaseFetch(
    `${SUPABASE_URL}/rest/v1/chat_profiles?user_id=eq.${userId}`,
    { method: 'PATCH', headers: { ...headers, 'Prefer': 'return=minimal' }, body: JSON.stringify({ flagged: false, flag_reason: '' }) }
  );
  if (res?.error) return { error: res.error };
  await adminLog('unflag_user', userId, '');
  return {};
}

export async function adminBanUser(userId: string, reason: string): Promise<{ error?: string }> {
  const headers = rpcToken();
  if (!headers) return { error: 'Not authenticated' };
  const u = parseJwt(headers.Authorization.replace('Bearer ', ''));
  const res = await supabaseFetch(
    `${SUPABASE_URL}/rest/v1/banned_users`,
    { method: 'POST', headers: { ...headers, 'Prefer': 'return=minimal' }, body: JSON.stringify({ user_id: userId, reason, banned_by: u!.id }) }
  );
  if (res?.error) return { error: res.error };
  await adminLog('ban_user', userId, reason);
  return {};
}

export async function adminUnbanUser(userId: string): Promise<{ error?: string }> {
  const headers = rpcToken();
  if (!headers) return { error: 'Not authenticated' };
  const res = await supabaseFetch(
    `${SUPABASE_URL}/rest/v1/banned_users?user_id=eq.${userId}`,
    { method: 'DELETE', headers: { ...headers } }
  );
  if (res?.error) return { error: res.error };
  await adminLog('unban_user', userId, '');
  return {};
}

export async function adminGetBannedUsers(): Promise<{ users?: any[]; error?: string }> {
  const headers = rpcToken();
  if (!headers) return { error: 'Not authenticated' };
  const res = await supabaseFetch(
    `${SUPABASE_URL}/rest/v1/banned_users?order=created_at.desc`,
    { headers }
  );
  if (res?.error) return { error: res.error };
  return { users: Array.isArray(res) ? res : [] };
}

export async function adminGetReportedMessages(): Promise<{ reports?: any[]; error?: string }> {
  const headers = rpcToken();
  if (!headers) return { error: 'Not authenticated' };
  const res = await supabaseFetch(
    `${SUPABASE_URL}/rest/v1/reported_messages?dismissed=eq.false&order=created_at.desc`,
    { headers }
  );
  if (res?.error) return { error: res.error };
  return { reports: Array.isArray(res) ? res : [] };
}

export async function adminDismissReport(reportId: string): Promise<{ error?: string }> {
  const headers = rpcToken();
  if (!headers) return { error: 'Not authenticated' };
  const res = await supabaseFetch(
    `${SUPABASE_URL}/rest/v1/reported_messages?id=eq.${reportId}`,
    { method: 'PATCH', headers: { ...headers, 'Prefer': 'return=minimal' }, body: JSON.stringify({ dismissed: true }) }
  );
  if (res?.error) return { error: res.error };
  return {};
}

export async function adminGetLogs(): Promise<{ logs?: any[]; error?: string }> {
  const headers = rpcToken();
  if (!headers) return { error: 'Not authenticated' };
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

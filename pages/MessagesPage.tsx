import React, { useEffect, useRef, useState } from 'react';
import { getConversations, getMessages, sendMessage, searchUsers, getUserProfile, MessageRow } from '../supabaseClient';

const s = {
  page: { width: '100%', minHeight: '100vh', background: '#0a0a0a', display: 'flex', fontFamily: 'system-ui, sans-serif', paddingTop: 60 },
  sidebar: { width: 320, borderRight: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column' as const, flexShrink: 0 },
  main: { flex: 1, display: 'flex', flexDirection: 'column' as const },
  searchBox: { margin: 12, padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 14, outline: 'none', fontFamily: 'inherit' },
  convItem: { padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer', display: 'flex', flexDirection: 'column' as const, gap: 4 },
  convName: { color: '#fff', fontSize: 14, fontWeight: 600 },
  convPreview: { color: '#888', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis' as const, whiteSpace: 'nowrap' as const },
  convTime: { color: '#555', fontSize: 11 },
  badge: { background: '#6c63ff', color: '#fff', borderRadius: 10, padding: '2px 8px', fontSize: 11, fontWeight: 600, marginLeft: 8 },
  header: { padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', color: '#fff', fontSize: 16, fontWeight: 600 },
  msgs: { flex: 1, overflowY: 'auto' as const, padding: 16, display: 'flex', flexDirection: 'column' as const, gap: 8 },
  msgBubble: (me: boolean) => ({
    alignSelf: me ? 'flex-end' as const : 'flex-start' as const,
    background: me ? 'linear-gradient(135deg, #6c63ff, #2a6eff)' : 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    padding: '8px 14px',
    maxWidth: '70%',
  }),
  msgText: { color: '#fff', fontSize: 14, margin: 0, wordBreak: 'break-word' as const },
  msgTime: { color: 'rgba(255,255,255,0.4)', fontSize: 10, marginTop: 4, textAlign: 'right' as const },
  inputRow: { display: 'flex', gap: 8, padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.06)' },
  chatInput: { flex: 1, padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 14, outline: 'none', fontFamily: 'inherit' },
  sendBtn: { padding: '10px 20px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #6c63ff, #2a6eff)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  searchResult: { padding: '10px 16px', cursor: 'pointer', display: 'flex', flexDirection: 'column' as const, gap: 2, borderBottom: '1px solid rgba(255,255,255,0.04)' },
  empty: { color: '#555', fontSize: 13, textAlign: 'center' as const, marginTop: 60 },
  backBtn: { background: 'none', border: 'none', color: '#888', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', padding: 0, marginRight: 12 },
};

export default function MessagesPage() {
  const [conversations, setConversations] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [input, setInput] = useState('');
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [partnerProfile, setPartnerProfile] = useState<any>(null);
  const msgsEnd = useRef<HTMLDivElement>(null);
  const userIdRef = useRef<string>('');

  useEffect(() => {
    const token = localStorage.getItem('supa_session');
    if (token) {
      try { userIdRef.current = JSON.parse(atob(token.split('.')[1])).sub; } catch {}
    }
    loadConvs();
    const iv = setInterval(loadConvs, 3000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => { msgsEnd.current?.scrollIntoView(); }, [messages]);

  async function loadConvs() {
    const { conversations: c } = await getConversations();
    if (c) {
      const withProfiles = await Promise.all(c.map(async (conv: any) => {
        const { profile } = await getUserProfile(conv.otherId);
        return { ...conv, displayName: profile?.display_name || 'Anonymous', bio: profile?.bio || '' };
      }));
      setConversations(withProfiles);
    }
  }

  async function openConv(otherId: string) {
    setSelectedId(otherId);
    const { profile } = await getUserProfile(otherId);
    setPartnerProfile(profile);
    const { messages: msgs } = await getMessages(otherId);
    if (msgs) setMessages(msgs);
    loadConvs();
  }

  async function handleSend() {
    if (!input.trim() || !selectedId) return;
    const { error } = await sendMessage(selectedId, input.trim());
    if (!error) {
      setInput('');
      const { messages: msgs } = await getMessages(selectedId);
      if (msgs) setMessages(msgs);
      loadConvs();
    }
  }

  async function handleSearch(q: string) {
    setSearchQ(q);
    if (q.length < 2) { setSearchResults([]); return; }
    const { users } = await searchUsers(q);
    if (users) {
      setSearchResults(users.filter(u => u.user_id !== userIdRef.current));
    }
  }

  function startNewConv(otherId: string) {
    setSearchQ('');
    setSearchResults([]);
    openConv(otherId);
  }

  function formatTime(t: string) {
    const d = new Date(t);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  return (
    <div style={s.page}>
      {/* Sidebar */}
      <div style={s.sidebar}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <p style={{ color: '#fff', fontSize: 16, fontWeight: 600, margin: 0 }}>Messages</p>
        </div>
        <input style={s.searchBox} placeholder="Search users..." value={searchQ} onChange={e => handleSearch(e.target.value)} />
        {searchResults.length > 0 && (
          <div style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            {searchResults.map(u => (
              <div key={u.user_id} style={s.searchResult} onClick={() => startNewConv(u.user_id)}>
                <span style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>{u.display_name}</span>
                <span style={{ color: '#888', fontSize: 12 }}>{u.bio || 'No bio'}</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {conversations.length === 0 && <p style={s.empty}>No conversations yet</p>}
          {conversations.map((c: any) => (
            <div key={c.otherId} style={{ ...s.convItem, background: selectedId === c.otherId ? 'rgba(108,99,255,0.1)' : 'transparent' }} onClick={() => openConv(c.otherId)}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={s.convName}>{c.displayName}</span>
                <span style={s.convTime}>{formatTime(c.lastMsg.created_at)}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span style={s.convPreview}>{c.lastMsg.content}</span>
                {c.unread > 0 && <span style={s.badge}>{c.unread}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main */}
      <div style={s.main}>
        {!selectedId ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <p style={{ color: '#555', fontSize: 15 }}>Select a conversation or search for someone</p>
          </div>
        ) : (
          <>
            <div style={s.header}>
              <button style={s.backBtn} onClick={() => { setSelectedId(null); setPartnerProfile(null); }}>← Back</button>
              {partnerProfile?.display_name || 'Anonymous'}
            </div>
            <div style={s.msgs}>
              {messages.map(m => (
                <div key={m.id} style={s.msgBubble(m.sender_id === userIdRef.current)}>
                  <p style={s.msgText}>{m.content}</p>
                  <p style={s.msgTime}>{formatTime(m.created_at)}{m.sender_id !== userIdRef.current && m.read_at ? ' · Read' : ''}</p>
                </div>
              ))}
              <div ref={msgsEnd} />
            </div>
            <div style={s.inputRow}>
              <input style={s.chatInput} placeholder="Type a message..." value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSend()} />
              <button style={s.sendBtn} onClick={handleSend}>Send</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

import React, { useEffect, useRef, useState } from 'react';
import { getConversations, getMessages, sendMessage, markMessagesRead, getUserProfile, ChatMessage } from '../supabaseClient';

const btn = {
  background: 'linear-gradient(135deg, #6c63ff, #2a6eff)', color: '#fff', border: 'none',
  padding: '10px 20px', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer',
  fontFamily: 'inherit',
};
const inp = {
  background: '#2a2a2a', color: '#fff', border: '1px solid rgba(255,255,255,0.08)',
  padding: '11px 14px', borderRadius: 10, fontSize: 15, width: '100%',
  outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const,
};

export default function MessagesPage({ onNav, user, messagePartner }: { onNav: (p: any) => void; user: any; messagePartner?: string }) {
  const [conversations, setConversations] = useState<{ partnerId: string; lastMessage: ChatMessage; unread: number }[]>([]);
  const [selectedId, setSelectedId] = useState(messagePartner || '');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [partnerInfo, setPartnerInfo] = useState<Record<string, { name: string; avatar: string }>>({});
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const myId = user?.id;

  function fetchProfile(uid: string) {
    if (partnerInfo[uid]) return;
    getUserProfile(uid).then(({ profile }) => {
      if (profile) setPartnerInfo(p => ({ ...p, [uid]: { name: profile.display_name || '', avatar: profile.avatar_url || '' } }));
    });
  }

  function loadConvs() {
    getConversations().then(({ conversations: c }) => {
      if (c) { setConversations(c); c.forEach(conv => fetchProfile(conv.partnerId)); }
      setLoading(false);
    });
  }

  useEffect(() => {
    loadConvs();
    if (messagePartner) fetchProfile(messagePartner);
    const iv = setInterval(loadConvs, 3000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    markMessagesRead(selectedId);
    fetchProfile(selectedId);
    getMessages(selectedId).then(({ messages: msgs }) => { if (msgs) setMessages(msgs); });
    const iv = setInterval(() => {
      getMessages(selectedId).then(({ messages: msgs }) => { if (msgs) setMessages(msgs); });
    }, 2000);
    return () => clearInterval(iv);
  }, [selectedId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || !selectedId) return;
    setSending(true);
    const { error: err } = await sendMessage(selectedId, text);
    setSending(false);
    if (err) { setError(err); return; }
    setText('');
    setError('');
    const { messages: msgs } = await getMessages(selectedId);
    if (msgs) setMessages(msgs);
    loadConvs();
  }

  function openChat(partnerId: string) {
    setSelectedId(partnerId);
    markMessagesRead(partnerId);
  }

  function Avatar({ uid, size = 34 }: { uid: string; size?: number }) {
    const info = partnerInfo[uid];
    if (info?.avatar) {
      return <img src={info.avatar} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />;
    }
    return (
      <div style={{ width: size, height: size, borderRadius: '50%', background: '#6c63ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: size * 0.42, fontWeight: 600, flexShrink: 0 }}>
        {(info?.name || 'U')[0].toUpperCase()}
      </div>
    );
  }

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 700;

  if (loading) return <div style={{ background: '#161616', flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontFamily: 'system-ui, sans-serif' }}>Loading...</div>;

  function renderMessages(withAvatars: boolean) {
    return messages.map((m, i) => {
      const isMe = m.sender_id === myId;
      const showAvatar = withAvatars && !isMe && (i === 0 || messages[i - 1]?.sender_id !== m.sender_id);
      const isFirstBySender = i === 0 || messages[i - 1]?.sender_id !== m.sender_id;
      return (
        <div key={m.id} style={{
          alignSelf: isMe ? 'flex-end' : 'flex-start', maxWidth: withAvatars && !isMe ? '85%' : '80%',
          display: 'flex', alignItems: 'flex-end', gap: 6, flexDirection: isMe ? 'row-reverse' : 'row',
        }}>
          {!isMe && withAvatars && (
            <div style={{ width: 28, flexShrink: 0, visibility: showAvatar ? 'visible' : 'hidden' }}>
              {showAvatar ? <Avatar uid={m.sender_id} size={28} /> : <div style={{ width: 28 }} />}
            </div>
          )}
          <div>
            <div style={{
              background: isMe ? '#6c63ff' : '#1f1f1f',
              padding: '8px 12px',
              borderRadius: isMe ? '14px 14px 4px 14px' : isFirstBySender ? '14px 14px 14px 4px' : '4px 14px 14px 4px',
              color: '#fff', fontSize: 14, wordBreak: 'break-word', lineHeight: 1.4,
            }}>
              {m.content}
            </div>
            <div style={{ fontSize: 10, color: '#555', marginTop: 2, textAlign: isMe ? 'right' : 'left' }}>
              {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        </div>
      );
    });
  }

  if (selectedId && isMobile) {
    return (
      <div style={{ background: '#161616', flex: 1, minHeight: 0, fontFamily: 'system-ui, sans-serif', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: '#1a1a1a' }}>
          <button onClick={() => setSelectedId('')} style={{ background: 'none', border: 'none', color: '#6c63ff', fontSize: 16, cursor: 'pointer', fontFamily: 'inherit', padding: '4px 0' }}>←</button>
          <Avatar uid={selectedId} size={34} />
          <span style={{ color: '#fff', fontSize: 15, fontWeight: 600 }}>{partnerInfo[selectedId]?.name || 'User'}</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {renderMessages(true)}
          <div ref={bottomRef} />
        </div>
        <form onSubmit={handleSend} style={{ display: 'flex', gap: 8, padding: '10px 14px', paddingBottom: 'calc(10px + env(safe-area-inset-bottom, 0px))', borderTop: '1px solid rgba(255,255,255,0.06)', background: '#1a1a1a' }}>
          <input style={inp} value={text} onChange={e => setText(e.target.value)} placeholder="Aa" maxLength={500} />
          <button type="submit" disabled={sending || !text.trim()} style={{ ...btn, padding: '11px 18px', opacity: sending || !text.trim() ? 0.5 : 1, flexShrink: 0 }}>Send</button>
        </form>
        {error && <p style={{ color: '#f44336', fontSize: 12, textAlign: 'center', margin: '0 0 6px' }}>{error}</p>}
      </div>
    );
  }

  return (
    <div style={{ background: '#161616', flex: 1, minHeight: 0, fontFamily: 'system-ui, sans-serif', display: 'flex', flexDirection: 'column' }}>
      <div style={{ maxWidth: 900, margin: '0 auto', width: '100%', flex: 1, minHeight: 0, display: 'flex', flexDirection: isMobile ? 'column' : 'row' }}>
        {/* Conversation list */}
        <div style={{ width: isMobile ? '100%' : 320, borderRight: isMobile ? 'none' : '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <h2 style={{ color: '#fff', fontSize: 20, fontWeight: 700, margin: 0 }}>Inbox</h2>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {conversations.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: '#666', fontSize: 13, lineHeight: 1.5 }}>
                No conversations yet.
                <br />Chat with someone from Recent Live on your profile.
              </div>
            ) : conversations.map(conv => (
              <button key={conv.partnerId} onClick={() => openChat(conv.partnerId)} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
                background: selectedId === conv.partnerId ? 'rgba(108,99,255,0.08)' : 'transparent',
                border: 'none', borderBottom: '1px solid rgba(255,255,255,0.04)',
                cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', width: '100%',
              }}>
                <div style={{ position: 'relative' }}>
                  <Avatar uid={conv.partnerId} size={44} />
                  {conv.unread > 0 && <span style={{ position: 'absolute', top: -2, right: -2, width: 10, height: 10, borderRadius: '50%', background: '#6c63ff', border: '2px solid #161616' }} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                    <span style={{ color: '#fff', fontSize: 14, fontWeight: conv.unread > 0 ? 700 : 500 }}>{partnerInfo[conv.partnerId]?.name || 'User'}</span>
                    <span style={{ color: '#666', fontSize: 11 }}>{new Date(conv.lastMessage.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <span style={{ color: conv.unread > 0 ? '#ccc' : '#888', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', fontWeight: conv.unread > 0 ? 600 : 400 }}>
                    {conv.lastMessage.sender_id === myId ? 'You: ' : ''}{conv.lastMessage.content}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Chat panel (desktop or no selection on mobile) */}
        {selectedId && !isMobile && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: '#1a1a1a' }}>
              <Avatar uid={selectedId} size={34} />
              <span style={{ color: '#fff', fontSize: 15, fontWeight: 600 }}>{partnerInfo[selectedId]?.name || 'User'}</span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {messages.map((m, i) => {
                const isMe = m.sender_id === myId;
                const showAvatar = !isMe && (i === 0 || messages[i - 1]?.sender_id !== m.sender_id);
                const isFirstBySender = i === 0 || messages[i - 1]?.sender_id !== m.sender_id;
                return (
                  <div key={m.id} style={{
                    alignSelf: isMe ? 'flex-end' : 'flex-start', maxWidth: '70%',
                    display: 'flex', alignItems: 'flex-end', gap: 6,
                    flexDirection: isMe ? 'row-reverse' : 'row',
                  }}>
                    {!isMe && (
                      <div style={{ width: 28, flexShrink: 0, visibility: showAvatar ? 'visible' : 'hidden' }}>
                        {showAvatar ? <Avatar uid={m.sender_id} size={28} /> : <div style={{ width: 28 }} />}
                      </div>
                    )}
                    <div>
                      <div style={{
                        background: isMe ? '#6c63ff' : '#1f1f1f',
                        padding: '8px 12px',
                        borderRadius: isMe ? '14px 14px 4px 14px' : isFirstBySender ? '14px 14px 14px 4px' : '4px 14px 14px 4px',
                        color: '#fff', fontSize: 14, wordBreak: 'break-word', lineHeight: 1.4,
                      }}>
                        {m.content}
                      </div>
                      <div style={{ fontSize: 10, color: '#555', marginTop: 2, textAlign: isMe ? 'right' : 'left' }}>
                        {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
            <form onSubmit={handleSend} style={{ display: 'flex', gap: 8, padding: '10px 16px', paddingBottom: 'calc(10px + env(safe-area-inset-bottom, 0px))', borderTop: '1px solid rgba(255,255,255,0.06)', background: '#1a1a1a' }}>
              <input style={inp} value={text} onChange={e => setText(e.target.value)} placeholder="Aa" maxLength={500} />
              <button type="submit" disabled={sending || !text.trim()} style={{ ...btn, padding: '11px 18px', opacity: sending || !text.trim() ? 0.5 : 1, flexShrink: 0 }}>Send</button>
            </form>
            {error && <p style={{ color: '#f44336', fontSize: 12, textAlign: 'center', margin: '0 0 6px' }}>{error}</p>}
          </div>
        )}

        {!selectedId && !isMobile && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666', fontSize: 14 }}>
            Select a conversation
          </div>
        )}
      </div>
    </div>
  );
}

import React, { useEffect, useRef, useState } from 'react';
import { getConversations, getMessages, sendMessage, markMessagesRead, getChatProfile, ChatMessage, SUPABASE_URL, SUPABASE_ANON_KEY } from '../supabaseClient';

const input = {
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
  const [partnerNames, setPartnerNames] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const myId = user?.id;

  function loadConversations() {
    getConversations().then(({ conversations: c, error }) => {
      if (c) {
        setConversations(c);
        c.forEach(conv => {
          if (!partnerNames[conv.partnerId]) {
            getChatProfile().then(() => {
              fetch(`${SUPABASE_URL}/rest/v1/chat_profiles?user_id=eq.${conv.partnerId}&select=display_name`, {
                headers: { 'apikey': SUPABASE_ANON_KEY },
              }).then(r => r.json()).then((data: any) => {
                if (data?.[0]?.display_name) setPartnerNames(p => ({ ...p, [conv.partnerId]: data[0].display_name }));
              }).catch(() => {});
            });
          }
        });
      }
      setLoading(false);
    });
  }

  useEffect(() => {
    loadConversations();
    const iv = setInterval(loadConversations, 3000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    markMessagesRead(selectedId);
    getMessages(selectedId).then(({ messages: msgs, error }) => {
      if (msgs) setMessages(msgs);
    });
    const iv = setInterval(() => {
      getMessages(selectedId).then(({ messages: msgs, error }) => {
        if (msgs) setMessages(msgs);
      });
    }, 2000);
    return () => clearInterval(iv);
  }, [selectedId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  useEffect(() => {
    if (selectedId && !partnerNames[selectedId]) {
      fetch(`${SUPABASE_URL}/rest/v1/chat_profiles?user_id=eq.${selectedId}&select=display_name`, {
        headers: { 'apikey': SUPABASE_ANON_KEY },
      }).then(r => r.json()).then((data: any) => {
        if (data?.[0]?.display_name) setPartnerNames(p => ({ ...p, [selectedId]: data[0].display_name }));
      }).catch(() => {});
    }
  }, [selectedId]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || !selectedId) return;
    setSending(true);
    const { error } = await sendMessage(selectedId, text);
    setSending(false);
    if (error) { setMsg(error); return; }
    setText('');
    setMsg('');
    const { messages: msgs } = await getMessages(selectedId);
    if (msgs) setMessages(msgs);
    loadConversations();
  }

  function selectConversation(partnerId: string) {
    setSelectedId(partnerId);
    markMessagesRead(partnerId);
  }

  const sBtn = {
    background: 'linear-gradient(135deg, #6c63ff, #2a6eff)', color: '#fff', border: 'none',
    padding: '10px 24px', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer',
    fontFamily: 'inherit', width: '100%',
  };

  if (loading) return <div style={{ background: '#161616', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontFamily: 'system-ui, sans-serif' }}>Loading...</div>;

  return (
    <div style={{ background: '#161616', minHeight: '100vh', fontFamily: 'system-ui, sans-serif', display: 'flex', flexDirection: 'column' as const }}>
      {selectedId && window.innerWidth < 700 ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' as const }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <button onClick={() => setSelectedId('')} style={{ background: 'none', border: 'none', color: '#6c63ff', fontSize: 15, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>← Back</button>
            <span style={{ color: '#fff', fontSize: 15, fontWeight: 600 }}>{partnerNames[selectedId] || 'User'}</span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {messages.map(m => (
              <div key={m.id} style={{ alignSelf: m.sender_id === myId ? 'flex-end' : 'flex-start', background: m.sender_id === myId ? '#6c63ff' : '#1f1f1f', padding: '8px 12px', borderRadius: 12, maxWidth: '80%', color: '#fff', fontSize: 14, wordBreak: 'break-word' }}>
                {m.content}
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
          <form onSubmit={handleSend} style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <input style={input} value={text} onChange={e => setText(e.target.value)} placeholder="Type a message..." maxLength={500} />
            <button type="submit" disabled={sending || !text.trim()} style={{ ...sBtn, width: 'auto', padding: '11px 20px', opacity: sending || !text.trim() ? 0.5 : 1, flexShrink: 0 }}>{sending ? '...' : 'Send'}</button>
          </form>
          {msg && <p style={{ color: '#f44336', fontSize: 12, textAlign: 'center', margin: '0 0 8px' }}>{msg}</p>}
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', maxWidth: 900, margin: '0 auto', width: '100%' }}>
          <div style={{ width: window.innerWidth < 700 ? '100%' : 300, borderRight: window.innerWidth < 700 ? 'none' : '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column' as const }}>
            <h2 style={{ color: '#fff', fontSize: 18, fontWeight: 700, padding: '16px 16px 12px', margin: 0 }}>Messages</h2>
            {conversations.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: '#666', fontSize: 13 }}>
                No conversations yet. Chat with someone from Recent Live on your profile to start messaging.
              </div>
            ) : conversations.map(conv => (
              <button key={conv.partnerId} onClick={() => selectConversation(conv.partnerId)} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: selectedId === conv.partnerId ? 'rgba(108,99,255,0.1)' : 'transparent',
                border: 'none', borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' as const, width: '100%',
              }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#6c63ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 16, fontWeight: 600, flexShrink: 0 }}>
                  {(partnerNames[conv.partnerId] || 'U')[0].toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>{partnerNames[conv.partnerId] || 'User'}</span>
                    <span style={{ color: '#666', fontSize: 11 }}>{new Date(conv.lastMessage.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <span style={{ color: '#888', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{conv.lastMessage.content}</span>
                    {conv.unread > 0 && <span style={{ background: '#6c63ff', color: '#fff', fontSize: 10, borderRadius: '50%', width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{conv.unread}</span>}
                  </div>
                </div>
              </button>
            ))}
          </div>
          {selectedId && window.innerWidth >= 700 && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' as const }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', color: '#fff', fontSize: 15, fontWeight: 600 }}>{partnerNames[selectedId] || 'User'}</div>
              <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {messages.map(m => (
                  <div key={m.id} style={{ alignSelf: m.sender_id === myId ? 'flex-end' : 'flex-start', background: m.sender_id === myId ? '#6c63ff' : '#1f1f1f', padding: '8px 12px', borderRadius: 12, maxWidth: '70%', color: '#fff', fontSize: 14, wordBreak: 'break-word' }}>
                    {m.content}
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
              <form onSubmit={handleSend} style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <input style={input} value={text} onChange={e => setText(e.target.value)} placeholder="Type a message..." maxLength={500} />
                <button type="submit" disabled={sending || !text.trim()} style={{ ...sBtn, width: 'auto', padding: '11px 20px', opacity: sending || !text.trim() ? 0.5 : 1, flexShrink: 0 }}>{sending ? '...' : 'Send'}</button>
              </form>
              {msg && <p style={{ color: '#f44336', fontSize: 12, textAlign: 'center', margin: '0 0 8px' }}>{msg}</p>}
            </div>
          )}
          {!selectedId && window.innerWidth >= 700 && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666', fontSize: 14 }}>
              Select a conversation
            </div>
          )}
        </div>
      )}
    </div>
  );
}

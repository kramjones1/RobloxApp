import React, { useEffect, useRef, useState } from 'react';
import {
  createGuestSupportConversation, createSupportConversation, getGuestSupportMessages,
  getSupportConversations, getSupportMessages, sendGuestSupportMessage, sendSupportMessage,
  type SupportConversation, type SupportMessage,
} from '../supabaseClient';

interface Props { user: any; admin?: boolean; }
interface GuestSession { conversationId: string; accessToken: string; name: string; email: string; }

export default function SupportChatWidget({ user, admin = false }: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'loading' | 'list' | 'new' | 'thread'>('new');
  const [conversations, setConversations] = useState<SupportConversation[]>([]);
  const [selected, setSelected] = useState<SupportConversation | null>(null);
  const [guestSession, setGuestSession] = useState<GuestSession | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('General inquiry');
  const [firstMessage, setFirstMessage] = useState('');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadMessages = async (id: string) => {
    const result = user
      ? await getSupportMessages(id)
      : guestSession ? await getGuestSupportMessages(id, guestSession.accessToken) : { messages: [] as SupportMessage[] };
    if (result.error) setError(result.error);
    else setMessages(result.messages || []);
  };

  const loadUserConversations = async (showList = true) => {
    const result = await getSupportConversations();
    if (result.error) { setError(result.error); setMode('new'); return; }
    const rows = result.conversations || [];
    setConversations(rows);
    if (showList) {
      if (rows.length) setMode('list');
      else setMode('new');
    }
  };

  useEffect(() => {
    if (!open) return;
    setError('');
    if (user) {
      void loadUserConversations();
    } else {
      try {
        const raw = localStorage.getItem('livme-guest-support-session');
        if (raw) {
          const saved = JSON.parse(raw) as GuestSession;
          if (saved.conversationId && saved.accessToken) {
            setGuestSession(saved);
            setMode('thread');
            void getGuestSupportMessages(saved.conversationId, saved.accessToken).then(r => {
              if (r.error) setError(r.error);
              else setMessages(r.messages || []);
            });
            return;
          }
        }
      } catch {}
      setMode('new');
    }
  }, [open, user?.id]);

  useEffect(() => {
    if (!open || mode !== 'thread') return;
    const id = user ? selected?.id : guestSession?.conversationId;
    if (!id) return;
    const refresh = () => void loadMessages(id);
    const timer = window.setInterval(refresh, 7000);
    return () => window.clearInterval(timer);
  }, [open, mode, selected?.id, guestSession?.conversationId, user?.id]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open, mode]);

  async function startConversation(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try {
      if (user) {
        const result = await createSupportConversation(subject.trim(), firstMessage.trim());
        if (result.error || !result.conversationId) throw new Error(result.error || 'Could not start conversation.');
        await loadUserConversations();
        const row = (await getSupportConversations()).conversations?.find(c => c.id === result.conversationId) || null;
        setSelected(row);
        const loaded = await getSupportMessages(result.conversationId);
        setMessages(loaded.messages || []);
        setMode('thread');
      } else {
        const result = await createGuestSupportConversation(name.trim(), email.trim(), subject.trim(), firstMessage.trim());
        if (result.error || !result.conversationId || !result.accessToken) throw new Error(result.error || 'Could not start conversation.');
        const session = { conversationId: result.conversationId, accessToken: result.accessToken, name: name.trim(), email: email.trim() };
        localStorage.setItem('livme-guest-support-session', JSON.stringify(session));
        setGuestSession(session);
        const loaded = await getGuestSupportMessages(session.conversationId, session.accessToken);
        setMessages(loaded.messages || []);
        setMode('thread');
      }
      setFirstMessage('');
    } catch (e: any) { setError(e.message || 'Could not start conversation.'); }
    finally { setBusy(false); }
  }

  async function submitMessage(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true); setError('');
    try {
      const result = user
        ? selected ? await sendSupportMessage(selected.id, body) : { error: 'Choose a support conversation.' }
        : guestSession ? await sendGuestSupportMessage(guestSession.conversationId, guestSession.accessToken, body) : { error: 'Guest session unavailable.' };
      if (result.error) throw new Error(result.error);
      setDraft('');
      const id = user ? selected?.id : guestSession?.conversationId;
      if (id) await loadMessages(id);
      if (user) await loadUserConversations(false);
    } catch (e: any) { setError(e.message || 'Could not send message.'); }
    finally { setBusy(false); }
  }

  if (admin) return null;
  const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid #393944', borderRadius: 9, padding: '11px 12px', background: '#111116', color: '#fff', font: 'inherit', fontSize: 13, outline: 'none' };
  const actionStyle: React.CSSProperties = { border: 0, borderRadius: 9, padding: '10px 13px', background: '#6c63ff', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' };

  return (
    <>
      {open && (
        <section aria-label="LivMe customer support" style={{ position: 'fixed', zIndex: 3000, right: 16, bottom: 82, width: 'min(360px, calc(100vw - 24px))', height: 'min(540px, calc(100dvh - 110px))', display: 'flex', flexDirection: 'column', background: '#19191f', color: '#f5f5f7', border: '1px solid #353541', borderRadius: 16, boxShadow: '0 18px 60px rgba(0,0,0,.55)', overflow: 'hidden', fontFamily: 'system-ui,sans-serif' }}>
          <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid #30303a' }}>
            <div><strong style={{ fontSize: 14 }}>LivMe Support</strong><div style={{ color: '#9b9ba8', fontSize: 11, marginTop: 2 }}>We’re here to help</div></div>
            <button onClick={() => setOpen(false)} aria-label="Close support" style={{ background: 'transparent', color: '#aaa', border: 0, fontSize: 22, cursor: 'pointer' }}>×</button>
          </header>
          {mode === 'loading' ? <div style={{ padding: 20, color: '#aaa' }}>Loading…</div> : mode === 'list' ? (
            <div style={{ padding: 14, overflowY: 'auto', flex: 1 }}>
              <button style={{ ...actionStyle, width: '100%', marginBottom: 12 }} onClick={() => { setSelected(null); setMode('new'); }}>＋ New support request</button>
              {conversations.map(c => (
                <button key={c.id} onClick={() => { setSelected(c); setMode('thread'); void loadMessages(c.id); }} style={{ width: '100%', textAlign: 'left', background: '#22222b', border: '1px solid #343440', borderRadius: 10, padding: 12, marginBottom: 8, color: '#eee', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><strong style={{ fontSize: 12 }}>{c.subject}</strong><span style={{ color: c.status === 'resolved' ? '#76c893' : '#f0b35a', fontSize: 10 }}>{c.status}</span></div>
                  <div style={{ color: '#888', fontSize: 10, marginTop: 5 }}>{new Date(c.updated_at).toLocaleString()}</div>
                </button>
              ))}
            </div>
          ) : mode === 'new' ? (
            <form onSubmit={startConversation} style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 9, overflowY: 'auto', flex: 1 }}>
              <p style={{ color: '#aaa', fontSize: 12, lineHeight: 1.5 }}>Tell us what you need help with. Our support team will reply here.</p>
              {!user && <><input style={inputStyle} placeholder="Your name" value={name} onChange={e => setName(e.target.value)} maxLength={80} required /><input style={inputStyle} type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} maxLength={254} required /></>}
              <input style={inputStyle} placeholder="Subject" value={subject} onChange={e => setSubject(e.target.value)} maxLength={120} required />
              <textarea style={{ ...inputStyle, minHeight: 110, resize: 'vertical' }} placeholder="How can we help?" value={firstMessage} onChange={e => setFirstMessage(e.target.value)} maxLength={2000} required />
              <button disabled={busy} style={{ ...actionStyle, opacity: busy ? .6 : 1 }}>{busy ? 'Sending…' : 'Start conversation'}</button>
            </form>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderBottom: '1px solid #30303a' }}>
                {user && <button onClick={() => { setMode('list'); void loadUserConversations(); }} style={{ background: 'transparent', border: 0, color: '#b8b4ff', cursor: 'pointer', fontSize: 12 }}>← All</button>}
                <span style={{ color: '#aaa', fontSize: 11 }}>{selected?.subject || 'Guest support request'} · {selected?.status || 'open'}</span>
              </div>
              <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 13, display: 'flex', flexDirection: 'column', gap: 9 }}>
                {messages.map(m => {
                  const mine = m.sender_type === (user ? 'user' : 'guest');
                  return <div key={m.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '86%', background: mine ? '#39348a' : '#292932', borderRadius: 12, padding: '9px 11px' }}>
                    <div style={{ fontSize: 10, color: mine ? '#d6d2ff' : '#b8b8c5', marginBottom: 3 }}>{mine ? 'You' : 'LivMe Support'}</div>
                    <div style={{ fontSize: 13, lineHeight: 1.45, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{m.body}</div>
                    <div style={{ fontSize: 9, color: '#aaa', marginTop: 5 }}>{new Date(m.created_at).toLocaleString()}</div>
                  </div>;
                })}
                {messages.length === 0 && <p style={{ color: '#888', fontSize: 12 }}>No messages yet.</p>}
              </div>
              {(selected?.status !== 'resolved') && (
                <form onSubmit={submitMessage} style={{ display: 'flex', gap: 7, padding: 11, borderTop: '1px solid #30303a' }}>
                  <input style={{ ...inputStyle, flex: 1, minWidth: 0 }} placeholder="Write a message…" value={draft} onChange={e => setDraft(e.target.value)} maxLength={2000} />
                  <button disabled={busy || !draft.trim()} style={{ ...actionStyle, opacity: busy || !draft.trim() ? .5 : 1 }}>Send</button>
                </form>
              )}
            </>
          )}
          {error && <div role="alert" style={{ padding: '8px 12px', color: '#ff9b9b', background: '#351e24', fontSize: 11 }}>{error}</div>}
        </section>
      )}
      <button onClick={() => setOpen(v => !v)} aria-label="Open LivMe support" style={{ position: 'fixed', zIndex: 3001, right: 18, bottom: 18, border: 0, borderRadius: 28, padding: '13px 17px', background: 'linear-gradient(135deg,#6c63ff,#2a6eff)', color: '#fff', fontWeight: 700, fontSize: 13, boxShadow: '0 8px 28px rgba(63,74,220,.4)', cursor: 'pointer', fontFamily: 'system-ui,sans-serif' }}>
        {open ? '× Close' : '💬 Support'}
      </button>
    </>
  );
}

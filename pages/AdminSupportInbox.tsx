import React, { useEffect, useState } from 'react';
import {
  adminReplySupportMessage, adminUpdateSupportStatus, getSupportConversations, getSupportMessages,
  type SupportConversation, type SupportMessage,
} from '../supabaseClient';

export default function AdminSupportInbox() {
  const [conversations, setConversations] = useState<SupportConversation[]>([]);
  const [selected, setSelected] = useState<SupportConversation | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function loadList(keepSelected = true) {
    const result = await getSupportConversations();
    if (result.error) { setError(result.error); return; }
    const rows = result.conversations || [];
    setConversations(rows);
    if (keepSelected && selected) {
      const refreshed = rows.find(row => row.id === selected.id);
      if (refreshed) setSelected(refreshed);
    }
  }
  async function loadThread(id: string) {
    const result = await getSupportMessages(id);
    if (result.error) setError(result.error);
    else setMessages(result.messages || []);
  }
  useEffect(() => {
    void loadList(false);
    const timer = window.setInterval(() => { void loadList(); if (selected?.id) void loadThread(selected.id); }, 10000);
    return () => window.clearInterval(timer);
  }, [selected?.id]);

  async function reply(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !draft.trim() || busy) return;
    setBusy(true); setError(''); setNotice('');
    const result = await adminReplySupportMessage(selected.id, draft.trim());
    if (result.error) setError(result.error);
    else { setDraft(''); setNotice('Reply sent.'); await loadThread(selected.id); await loadList(); }
    setBusy(false);
  }
  async function updateStatus(status: 'open' | 'pending' | 'resolved') {
    if (!selected || busy) return;
    setBusy(true); setError(''); setNotice('');
    const result = await adminUpdateSupportStatus(selected.id, status);
    if (result.error) setError(result.error);
    else { setNotice(`Conversation marked ${status}.`); await loadList(); setSelected({ ...selected, status }); }
    setBusy(false);
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 0.85fr) minmax(0, 1.5fr)', gap: 14, minHeight: 500 }}>
      <section style={{ background: '#1f1f1f', borderRadius: 12, padding: 14, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8 }}>
          <strong style={{ color: '#fff', fontSize: 14 }}>Support Inbox</strong>
          <button onClick={() => void loadList()} style={{ background: '#39348a', color: '#fff', border: 0, borderRadius: 6, padding: '6px 9px', fontSize: 11 }}>Refresh</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 620, overflowY: 'auto' }}>
          {conversations.length === 0 ? <p style={{ color: '#888', fontSize: 12 }}>No support inquiries yet.</p> : conversations.map(c => (
            <button key={c.id} onClick={() => { setSelected(c); void loadThread(c.id); setNotice(''); }} style={{ textAlign: 'left', border: selected?.id === c.id ? '1px solid #7770ff' : '1px solid #35353e', borderRadius: 9, padding: 10, background: selected?.id === c.id ? '#292744' : '#19191f', color: '#eee', cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 5 }}><strong style={{ fontSize: 12 }}>{c.subject}</strong><span style={{ fontSize: 9, color: c.status === 'resolved' ? '#76c893' : '#ffbd66' }}>{c.status}</span></div>
              <div style={{ color: '#aaa', fontSize: 10, marginTop: 5 }}>{c.user_id ? `User ${c.user_id.slice(0, 8)}` : `${c.guest_name} · ${c.guest_email}`}</div>
              <div style={{ color: '#777', fontSize: 9, marginTop: 4 }}>{new Date(c.updated_at).toLocaleString()}</div>
            </button>
          ))}
        </div>
      </section>
      <section style={{ background: '#1f1f1f', borderRadius: 12, padding: 14, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {!selected ? <div style={{ color: '#888', fontSize: 13, margin: 'auto', textAlign: 'center' }}>Select an inquiry to view and reply.</div> : <>
          <div style={{ borderBottom: '1px solid #363640', paddingBottom: 10, marginBottom: 10 }}>
            <strong style={{ color: '#fff', fontSize: 14 }}>{selected.subject}</strong>
            <div style={{ color: '#aaa', fontSize: 11, marginTop: 4 }}>{selected.user_id ? `Registered user · ${selected.user_id}` : `Guest: ${selected.guest_name} · ${selected.guest_email}`}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 9 }}>
              {(['open','pending','resolved'] as const).map(status => <button key={status} disabled={busy || selected.status === status} onClick={() => void updateStatus(status)} style={{ border: 0, borderRadius: 6, padding: '5px 9px', background: selected.status === status ? '#5149bd' : '#34343d', color: '#fff', fontSize: 10, cursor: 'pointer', opacity: busy ? .6 : 1 }}>{status}</button>)}
            </div>
          </div>
          <div style={{ flex: 1, minHeight: 220, maxHeight: 430, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {messages.map(m => <div key={m.id} style={{ alignSelf: m.sender_type === 'operator' ? 'flex-end' : 'flex-start', maxWidth: '88%', background: m.sender_type === 'operator' ? '#39348a' : '#292932', borderRadius: 10, padding: '9px 11px' }}>
              <div style={{ fontSize: 10, color: '#c6c2ff', marginBottom: 3 }}>{m.sender_type === 'operator' ? 'Operator' : m.sender_type === 'guest' ? 'Guest' : 'User'}</div>
              <div style={{ color: '#fff', fontSize: 12, lineHeight: 1.45, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{m.body}</div>
              <div style={{ color: '#aaa', fontSize: 9, marginTop: 4 }}>{new Date(m.created_at).toLocaleString()}</div>
            </div>)}
          </div>
          {selected.status !== 'resolved' && <form onSubmit={reply} style={{ display: 'flex', gap: 7, marginTop: 10 }}>
            <input value={draft} onChange={e => setDraft(e.target.value)} maxLength={2000} placeholder="Reply to customer…" style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', background: '#141419', border: '1px solid #393944', borderRadius: 8, color: '#fff', padding: '10px 11px', fontSize: 12 }} />
            <button disabled={busy || !draft.trim()} style={{ background: '#6c63ff', color: '#fff', border: 0, borderRadius: 8, padding: '8px 12px', fontSize: 11, fontWeight: 700 }}>Send</button>
          </form>}
        </>}
        {error && <p role="alert" style={{ color: '#ff9b9b', fontSize: 11, marginTop: 8 }}>{error}</p>}
        {notice && <p role="status" style={{ color: '#82d49b', fontSize: 11, marginTop: 8 }}>{notice}</p>}
      </section>
    </div>
  );
}

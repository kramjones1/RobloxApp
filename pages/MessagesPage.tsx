import React, { useEffect, useRef, useState } from 'react';
import { getConversations, getMessages, sendMessage, uploadChatAttachment, getChatAttachmentUrl, markMessagesRead, getUserProfile, hideConversation, ChatMessage } from '../supabaseClient';
import { watchConversationPresence } from '../chatPresence';

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

export default function MessagesPage({ onNav, user, messagePartner, onViewProfile, onChatOpened }: { onNav: (p: any) => void; user: any; messagePartner?: string; onViewProfile?: (userId: string) => void; onChatOpened?: () => void }) {
  const [conversations, setConversations] = useState<{ partnerId: string; lastMessage: ChatMessage; unread: number }[]>([]);
  const [selectedId, setSelectedId] = useState(messagePartner || '');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [partnerInfo, setPartnerInfo] = useState<Record<string, { name: string; avatar: string }>>({});
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const myId = user?.id;
  const conversationPartnerKey = conversations.map(conv => conv.partnerId).sort().join('|');
  const [onlinePartners, setOnlinePartners] = useState<Set<string>>(new Set());

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

  // Presence is shared only inside existing one-to-one conversations.
  // Each private channel is authorized by the chat-presence SQL policies.
  useEffect(() => {
    if (!myId || !conversationPartnerKey) {
      setOnlinePartners(new Set());
      return;
    }
    const partnerIds = conversationPartnerKey.split('|').filter(Boolean);
    return watchConversationPresence(myId, partnerIds, setOnlinePartners);
  }, [myId, conversationPartnerKey]);

  useEffect(() => {
    if (!selectedId) return;
    markMessagesRead(selectedId); onChatOpened?.();
    fetchProfile(selectedId);
    getMessages(selectedId).then(({ messages: msgs }) => { if (msgs) setMessages(msgs); });
    const iv = setInterval(() => {
      markMessagesRead(selectedId);
      getMessages(selectedId).then(({ messages: msgs }) => { if (msgs) setMessages(msgs); });
      onChatOpened?.();
    }, 2000);
    return () => clearInterval(iv);
  }, [selectedId]);

  useEffect(() => {
    // Scroll only the messages list. scrollIntoView() can scroll outer page
    // containers too, which makes the fixed composer appear to move with messages.
    const el = bottomRef.current?.parentElement;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const messageText = text.trim();
    const filesToSend = [...selectedFiles];
    if ((!messageText && filesToSend.length === 0) || !selectedId) return;
    setSending(true);
    setError('');
    for (const file of filesToSend) {
      const uploaded = await uploadChatAttachment(selectedId, file);
      if (uploaded.error || !uploaded.attachment) {
        setSending(false);
        setError(uploaded.error || 'Could not upload attachment.');
        return;
      }
      const result = await sendMessage(selectedId, '📎 ' + file.name, uploaded.attachment);
      if (result.error) {
        setSending(false);
        setError(result.error);
        return;
      }
      setSelectedFiles(current => current.filter(item => item !== file));
    }
    if (messageText) {
      const result = await sendMessage(selectedId, messageText);
      if (result.error) {
        setSending(false);
        setError(result.error);
        return;
      }
      setText('');
      if (composerRef.current) composerRef.current.style.height = '42px';
    }
    setSending(false);
    setError('');
    const { messages: msgs } = await getMessages(selectedId);
    if (msgs) setMessages(msgs);
    loadConvs();
  }
  useEffect(() => {
    messages.forEach(async message => {
      const path = message.attachment_path;
      if (!path || attachmentUrls[path]) return;
      const result = await getChatAttachmentUrl(path);
      if (result.url) setAttachmentUrls(current => current[path] ? current : { ...current, [path]: result.url! });
    });
  }, [messages, attachmentUrls]);

  function openChat(partnerId: string) {
    setSelectedId(partnerId);
    markMessagesRead(partnerId); onChatOpened?.();
  }

  async function deleteConversation(partnerId: string) {
    if (!window.confirm('Delete this conversation from your Inbox? The messages will remain visible to the other person.')) return;
    const result = await hideConversation(partnerId);
    if (result.error) {
      setError(result.error);
      return;
    }
    setConversations(current => current.filter(conv => conv.partnerId !== partnerId));
    if (selectedId === partnerId) {
      setSelectedId('');
      setMessages([]);
    }
  }

  function Avatar({ uid, size = 34, onClick }: { uid: string; size?: number; onClick?: () => void }) {
    const info = partnerInfo[uid];
    if (info?.avatar) {
      return <img src={info.avatar} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, cursor: onClick ? 'pointer' : undefined }} onClick={onClick} />;
    }
    return (
      <div style={{ width: size, height: size, borderRadius: '50%', background: '#6c63ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: size * 0.42, fontWeight: 600, flexShrink: 0, cursor: onClick ? 'pointer' : undefined }} onClick={onClick}>
        {(info?.name || 'U')[0].toUpperCase()}
      </div>
    );
  }

  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 700);

  useEffect(() => {
    const updateViewport = () => setIsMobile(window.innerWidth < 700);
    window.addEventListener('resize', updateViewport);
    window.addEventListener('orientationchange', updateViewport);
    return () => {
      window.removeEventListener('resize', updateViewport);
      window.removeEventListener('orientationchange', updateViewport);
    };
  }, []);

  const [keyboardViewport, setKeyboardViewport] = useState(() => ({
    height: typeof window !== 'undefined' ? window.visualViewport?.height || window.innerHeight : 0,
    top: typeof window !== 'undefined' ? window.visualViewport?.offsetTop || 0 : 0,
  }));

  // Lock the document behind the full-screen mobile chat. The message list
  // itself remains the only scrollable region while a conversation is open.
  useEffect(() => {
    if (!isMobile || !selectedId) return;
    const body = document.body;
    const html = document.documentElement;
    const previousBodyOverflow = body.style.overflow;
    const previousHtmlOverflow = html.style.overflow;
    body.style.overflow = 'hidden';
    html.style.overflow = 'hidden';
    return () => {
      body.style.overflow = previousBodyOverflow;
      html.style.overflow = previousHtmlOverflow;
    };
  }, [isMobile, selectedId]);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const syncKeyboardViewport = () => {
      setKeyboardViewport({ height: viewport.height, top: viewport.offsetTop });
    };
    viewport.addEventListener('resize', syncKeyboardViewport);
    viewport.addEventListener('scroll', syncKeyboardViewport);
    syncKeyboardViewport();
    return () => {
      viewport.removeEventListener('resize', syncKeyboardViewport);
      viewport.removeEventListener('scroll', syncKeyboardViewport);
    };
  }, []);

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
              color: '#fff', fontSize: 14, wordBreak: 'break-word', whiteSpace: 'pre-wrap', lineHeight: 1.4,
            }}>
              {renderAttachment(m)}
            </div>
            <div style={{ fontSize: 10, color: '#555', marginTop: 2, textAlign: isMe ? 'right' : 'left' }}>
              {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        </div>
      );
    });
  }

  function renderAttachment(message: ChatMessage) {
    if (!message.attachment_path) return message.content;
    const url = attachmentUrls[message.attachment_path];
    if (!url) return <span style={{ color: '#bbb' }}>Loading attachment…</span>;
    if ((message.attachment_mime_type || '').startsWith('image/')) {
      return <a href={url} target="_blank" rel="noreferrer" style={{ display: 'block', color: '#fff', textDecoration: 'none' }}>
        <img src={url} alt={message.attachment_name || 'Photo'} style={{ display: 'block', maxWidth: 'min(220px, 65vw)', maxHeight: 240, objectFit: 'cover', borderRadius: 9 }} />
        <span style={{ display: 'block', fontSize: 11, marginTop: 4 }}>{message.attachment_name}</span>
      </a>;
    }
    return <a href={url} target="_blank" rel="noreferrer" download={message.attachment_name || true} style={{ color: '#fff', textDecoration: 'underline', overflowWrap: 'anywhere' }}>📎 {message.attachment_name || 'Download file'}</a>;
  }

  function renderSelectedFiles() {
    if (!selectedFiles.length) return null;
    return <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '8px 12px 0', background: '#1a1a1a' }}>
      {selectedFiles.map((file, index) => <div key={index} style={{ display: 'flex', alignItems: 'center', gap: 6, maxWidth: '100%', padding: '5px 8px', borderRadius: 10, background: '#2a2a2a', color: '#ddd', fontSize: 12 }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 190 }}>📎 {file.name}</span>
        <button type="button" aria-label={`Remove ${file.name}`} onClick={() => setSelectedFiles(items => items.filter((_, i) => i !== index))} style={{ border: 0, background: 'transparent', color: '#aaa', fontSize: 17, padding: 0, cursor: 'pointer' }}>×</button>
      </div>)}
    </div>;
  }

  if (selectedId && isMobile) {
    return (
      <div style={{ background: '#161616', position: 'fixed', zIndex: 50, insetInline: 0, top: `${keyboardViewport.top}px`, width: '100%', height: keyboardViewport.height ? `${keyboardViewport.height}px` : '100dvh', maxHeight: keyboardViewport.height ? `${keyboardViewport.height}px` : '100dvh', overflow: 'hidden', overscrollBehavior: 'none', fontFamily: 'system-ui, sans-serif', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: '#1a1a1a' }}>
          <button onClick={() => setSelectedId('')} style={{ background: 'none', border: 'none', color: '#6c63ff', fontSize: 16, cursor: 'pointer', fontFamily: 'inherit', padding: '4px 0' }}>←</button>
          <span style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
            <Avatar uid={selectedId} size={34} onClick={() => onViewProfile?.(selectedId)} />
            {onlinePartners.has(selectedId) && <span aria-label="Online" title="Online" style={{ position: 'absolute', right: 0, bottom: 0, width: 10, height: 10, borderRadius: '50%', background: '#31d17c', border: '2px solid #1a1a1a', pointerEvents: 'none' }} />}
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span style={{ color: '#fff', fontSize: 15, fontWeight: 600 }}>{partnerInfo[selectedId]?.name || 'User'}</span>
            <span style={{ color: onlinePartners.has(selectedId) ? '#31d17c' : '#777', fontSize: 11 }}>{onlinePartners.has(selectedId) ? 'Online' : 'Offline'}</span>
          </div>
        </div>
        <div style={{ flex: '1 1 0%', minHeight: 0, minWidth: 0, overflowY: 'auto', overflowX: 'hidden', overscrollBehaviorY: 'contain', WebkitOverflowScrolling: 'touch', touchAction: 'pan-y', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {renderMessages(true)}
          <div ref={bottomRef} />
        </div>
        {error && <p role="status" style={{ color: '#f44336', fontSize: 12, textAlign: 'left', padding: '4px 14px 0', margin: 0, background: '#1a1a1a' }}>{error}</p>}
        {renderSelectedFiles()}
        <form onSubmit={handleSend} style={{ display: 'flex', alignItems: 'center', gap: 7, width: '100%', boxSizing: 'border-box', flexShrink: 0, padding: '8px 12px', paddingBottom: 'calc(8px + env(safe-area-inset-bottom, 0px))', background: '#1a1a1a' }}>
          <input type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip" style={{ display: 'none' }} id="chat-attachments-mobile" onChange={e => { const files = Array.from(e.target.files || []); setSelectedFiles(current => [...current, ...files].slice(0, 5)); e.currentTarget.value = ''; }} />
          <label htmlFor="chat-attachments-mobile" aria-label="Attach photos or files" title="Attach photos or files" style={{ width: 38, height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bbb', fontSize: 23, cursor: 'pointer', flexShrink: 0 }}>＋</label>
          <textarea ref={composerRef} aria-label="Message" rows={1} style={{ ...inp, flex: '1 1 0%', minWidth: 0, width: 'auto', height: 42, minHeight: 42, maxHeight: 120, resize: 'none', overflowY: 'auto', borderRadius: 22, padding: '10px 16px', fontSize: 16, lineHeight: '20px', background: '#2a2a2a', border: '1px solid rgba(255,255,255,0.08)' }} value={text} onKeyDown={e => {
            if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
              e.preventDefault();
              const target = e.currentTarget;
              const start = target.selectionStart;
              const end = target.selectionEnd;
              const next = text.slice(0, start) + '\n' + text.slice(end);
              setText(next);
              requestAnimationFrame(() => {
                target.setSelectionRange(start + 1, start + 1);
                target.style.height = '42px';
                target.style.height = Math.min(target.scrollHeight, 120) + 'px';
              });
            }
          }} onChange={e => { setText(e.target.value); e.target.style.height = '42px'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'; }} placeholder="Message" maxLength={500} />
          <button type="submit" aria-label="Send message" disabled={sending || (!text.trim() && selectedFiles.length === 0)} style={{ width: 42, height: 42, padding: 0, border: 'none', borderRadius: '50%', background: '#6c63ff', color: '#fff', fontSize: 23, lineHeight: 1, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: sending || (!text.trim() && selectedFiles.length === 0) ? 0.45 : 1, flexShrink: 0 }}>{sending ? '…' : '↑'}</button>
        </form>
      </div>
    );
  }

  return (
    <div style={{ background: '#161616', flex: 1, minHeight: 0, fontFamily: 'system-ui, sans-serif', display: 'flex', flexDirection: 'column' }}>
      <div style={{ maxWidth: 900, margin: '0 auto', width: '100%', flex: 1, minHeight: 0, display: 'flex', flexDirection: isMobile ? 'column' : 'row' }}>
        {/* Conversation list */}
        <div style={{ flex: isMobile ? 1 : undefined, width: isMobile ? '100%' : 320, borderRight: isMobile ? 'none' : '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <h2 style={{ color: '#fff', fontSize: 20, fontWeight: 700, margin: 0 }}>Inbox</h2>
          </div>
          <div style={{ padding: '12px 16px 10px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ color: '#888', fontSize: 11, fontWeight: 700, letterSpacing: 0.7, marginBottom: 9 }}>ONLINE CHATS</div>
            {onlinePartners.size === 0 ? (
              <div style={{ color: '#666', fontSize: 12 }}>No one online right now</div>
            ) : (
              <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 3 }}>
                {conversations.filter(conv => onlinePartners.has(conv.partnerId)).map(conv => (
                  <button key={conv.partnerId} type="button" onClick={() => openChat(conv.partnerId)} title={partnerInfo[conv.partnerId]?.name || 'Open chat'} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, minWidth: 54, padding: 0, border: 0, background: 'transparent', cursor: 'pointer', color: '#ccc', fontFamily: 'inherit' }}>
                    <span style={{ position: 'relative', display: 'inline-flex' }}>
                      <Avatar uid={conv.partnerId} size={48} />
                      <span aria-label="Online" style={{ position: 'absolute', right: 0, bottom: 1, width: 11, height: 11, borderRadius: '50%', background: '#31d17c', border: '2px solid #161616' }} />
                    </span>
                    <span style={{ maxWidth: 62, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11 }}>{partnerInfo[conv.partnerId]?.name || 'User'}</span>
                  </button>
                ))}
              </div>
            )}
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
                  <span onClick={(e) => { e.stopPropagation(); onViewProfile?.(conv.partnerId); }}><Avatar uid={conv.partnerId} size={44} /></span>
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
                <span
                  role="button"
                  tabIndex={0}
                  aria-label="Delete conversation"
                  title="Delete conversation"
                  onClick={e => { e.stopPropagation(); void deleteConversation(conv.partnerId); }}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); void deleteConversation(conv.partnerId); } }}
                  style={{ color: '#888', fontSize: 17, padding: '8px 4px', cursor: 'pointer', flexShrink: 0 }}
                >🗑</span>
              </button>
            ))}
          </div>
        </div>

        {/* Chat panel (desktop or no selection on mobile) */}
        {selectedId && !isMobile && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: '#1a1a1a' }}>
              <span style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
                <Avatar uid={selectedId} size={34} onClick={() => onViewProfile?.(selectedId)} />
                {onlinePartners.has(selectedId) && <span aria-label="Online" title="Online" style={{ position: 'absolute', right: 0, bottom: 0, width: 10, height: 10, borderRadius: '50%', background: '#31d17c', border: '2px solid #1a1a1a', pointerEvents: 'none' }} />}
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span style={{ color: '#fff', fontSize: 15, fontWeight: 600 }}>{partnerInfo[selectedId]?.name || 'User'}</span>
                <span style={{ color: onlinePartners.has(selectedId) ? '#31d17c' : '#777', fontSize: 11 }}>{onlinePartners.has(selectedId) ? 'Online' : 'Offline'}</span>
              </div>
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
                        color: '#fff', fontSize: 14, wordBreak: 'break-word', whiteSpace: 'pre-wrap', lineHeight: 1.4,
                      }}>
                        {renderAttachment(m)}
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
            {error && <p role="status" style={{ color: '#f44336', fontSize: 12, textAlign: 'left', padding: '4px 16px 0', margin: 0, background: '#1a1a1a' }}>{error}</p>}
            {renderSelectedFiles()}
            <form onSubmit={handleSend} style={{ display: 'flex', alignItems: 'center', gap: 7, width: '100%', boxSizing: 'border-box', flexShrink: 0, padding: '8px 12px', background: '#1a1a1a' }}>
              <input type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip" style={{ display: 'none' }} id="chat-attachments-desktop" onChange={e => { const files = Array.from(e.target.files || []); setSelectedFiles(current => [...current, ...files].slice(0, 5)); e.currentTarget.value = ''; }} />
              <label htmlFor="chat-attachments-desktop" aria-label="Attach photos or files" title="Attach photos or files" style={{ width: 38, height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bbb', fontSize: 23, cursor: 'pointer', flexShrink: 0 }}>＋</label>
              <textarea ref={composerRef} aria-label="Message" rows={1} style={{ ...inp, flex: '1 1 0%', minWidth: 0, width: 'auto', height: 42, minHeight: 42, maxHeight: 120, resize: 'none', overflowY: 'auto', borderRadius: 22, padding: '10px 16px', fontSize: 16, lineHeight: '20px', background: '#2a2a2a', border: '1px solid rgba(255,255,255,0.08)' }} value={text} onKeyDown={e => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            if (!e.shiftKey) {
              e.currentTarget.form?.requestSubmit();
              return;
            }
            const target = e.currentTarget;
            const start = target.selectionStart;
            const end = target.selectionEnd;
            const next = text.slice(0, start) + '\n' + text.slice(end);
            setText(next);
            requestAnimationFrame(() => {
              target.setSelectionRange(start + 1, start + 1);
              target.style.height = '42px';
              target.style.height = Math.min(target.scrollHeight, 120) + 'px';
            });
          }} onChange={e => { setText(e.target.value); e.target.style.height = '42px'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'; }} placeholder="Message" maxLength={500} />
              <button type="submit" aria-label="Send message" disabled={sending || (!text.trim() && selectedFiles.length === 0)} style={{ width: 42, height: 42, padding: 0, border: 'none', borderRadius: '50%', background: '#6c63ff', color: '#fff', fontSize: 23, lineHeight: 1, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: sending || (!text.trim() && selectedFiles.length === 0) ? 0.45 : 1, flexShrink: 0 }}>{sending ? '…' : '↑'}</button>
            </form>
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

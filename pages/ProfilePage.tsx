import React, { useEffect, useState } from 'react';
import { getChatProfile, upsertChatProfile, ChatProfile } from '../supabaseClient';

type Page = 'profile' | 'terms' | 'privacy' | 'home';

interface Props {
  onNav: (p: Page) => void;
  user: any;
}

const s = {
  page: { minHeight: '100vh', background: '#0a0a0a', fontFamily: 'system-ui, sans-serif', paddingTop: 60, overflowY: 'auto' as const },
  cover: { height: 200, background: 'linear-gradient(135deg, #6c63ff 0%, #2a6eff 50%, #00d4ff 100%)', position: 'relative' as const },
  coverInner: { maxWidth: 960, margin: '0 auto', position: 'relative' as const, height: '100%' },
  avatarWrap: { position: 'absolute' as const, bottom: -50, left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 8 },
  avatar: { width: 100, height: 100, borderRadius: '50%', border: '4px solid #0a0a0a', background: '#222', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, color: '#fff', fontWeight: 700, boxShadow: '0 2px 12px rgba(0,0,0,0.4)' },
  name: { fontSize: 22, fontWeight: 700, color: '#fff', margin: 0, textAlign: 'center' as const },
  body: { maxWidth: 960, margin: '0 auto', padding: '70px 16px 40px', display: 'flex', flexDirection: 'column' as const, gap: 16 },
  leftCol: { flex: 1 },
  rightCol: { width: 320, flexShrink: 0 },
  card: { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 20, marginBottom: 20 },
  cardTitle: { color: '#fff', fontSize: 18, fontWeight: 600, margin: '0 0 16px' },
  label: { color: '#aaa', fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'block' },
  input: { background: 'rgba(255,255,255,0.06)', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', padding: '11px 14px', borderRadius: 10, fontSize: 15, width: '100%', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const, marginBottom: 16 },
  textarea: { background: 'rgba(255,255,255,0.06)', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', padding: '11px 14px', borderRadius: 10, fontSize: 15, width: '100%', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const, marginBottom: 16, resize: 'vertical' as const, minHeight: 80 },
  toggleRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' },
  toggleLabel: { color: '#ccc', fontSize: 14 },
  toggleBtn: { padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none', fontFamily: 'inherit' },
  saveBtn: { marginTop: 16, background: 'linear-gradient(135deg, #6c63ff, #2a6eff)', color: '#fff', border: 'none', padding: '10px', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', width: '100%' },
  msg: { fontSize: 13, textAlign: 'center' as const, marginTop: 12 },
  friendCard: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' },
  friendAvatar: { width: 36, height: 36, borderRadius: '50%', background: '#6c63ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 15, fontWeight: 600, flexShrink: 0 },
  friendName: { color: '#e0e0e0', fontSize: 14, fontWeight: 500 },
  friendBio: { color: '#777', fontSize: 12 },
};

export default function ProfilePage({ onNav, user }: Props) {
  const [displayName, setDisplayName] = useState('Anonymous');
  const [bio, setBio] = useState('');
  const [shareName, setShareName] = useState(false);
  const [shareBio, setShareBio] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [recent, setRecent] = useState<{ id: string; name: string; bio: string; time: number }[]>([]);

  useEffect(() => {
    (async () => {
      const { profile } = await getChatProfile();
      if (profile) {
        setDisplayName(profile.display_name);
        setBio(profile.bio);
        setShareName(profile.share_name);
        setShareBio(profile.share_bio);
      }
      setLoading(false);
    })();
    try { setRecent(JSON.parse(localStorage.getItem('recent_live') || '[]')); } catch {}
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!displayName || displayName.length < 1) { setMsg('Display name is required'); return; }
    setSaving(true);
    setMsg('');
    const { error } = await upsertChatProfile({ display_name: displayName, bio, avatar_url: '', share_name: shareName, share_bio: shareBio });
    setSaving(false);
    if (error) setMsg(error);
    else setMsg('Saved!');
  }

  if (loading) return <div style={{ ...s.page, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>Loading...</div>;

  const initial = displayName ? displayName[0].toUpperCase() : 'A';

  return (
    <div style={s.page}>
      <div style={s.cover}>
        <div style={s.coverInner}>
          <div style={s.avatarWrap}>
            <div style={s.avatar}>{initial}</div>
            <div>
              <h1 style={s.name}>{displayName}</h1>
            </div>
          </div>
        </div>
      </div>

      <div style={s.body}>
        <div style={s.card}>
          <h2 style={s.cardTitle}>About</h2>
          <form onSubmit={handleSave}>
            <label style={s.label}>Display Name</label>
            <input style={s.input} value={displayName} onChange={e => setDisplayName(e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 9))} maxLength={9} placeholder="e.g. CoolUser1" />

            <label style={s.label}>Bio</label>
            <textarea style={s.textarea} value={bio} onChange={e => setBio(e.target.value)} maxLength={200} placeholder="Tell people about yourself..." />

            <div style={s.toggleRow}>
              <span style={s.toggleLabel}>Show name to partner</span>
              <button type="button" style={{ ...s.toggleBtn, background: shareName ? '#4caf50' : '#444', color: '#fff' }} onClick={() => setShareName(!shareName)}>
                {shareName ? 'ON' : 'OFF'}
              </button>
            </div>

            <div style={s.toggleRow}>
              <span style={s.toggleLabel}>Show bio to partner</span>
              <button type="button" style={{ ...s.toggleBtn, background: shareBio ? '#4caf50' : '#444', color: '#fff' }} onClick={() => setShareBio(!shareBio)}>
                {shareBio ? 'ON' : 'OFF'}
              </button>
            </div>

            <button type="submit" disabled={saving} style={{ ...s.saveBtn, opacity: saving ? 0.5 : 1 }}>{saving ? 'Saving...' : 'Save Changes'}</button>
          </form>
          {msg && <p style={{ ...s.msg, color: msg === 'Saved!' ? '#4caf50' : '#f44336' }}>{msg}</p>}
        </div>

        <div style={s.card}>
          <h2 style={s.cardTitle}>Recent Live</h2>
          {recent.length === 0 ? (
            <p style={{ color: '#666', fontSize: 13 }}>No recent interactions yet. Start chatting to meet people!</p>
          ) : recent.map((r, i) => (
            <div key={i} style={s.friendCard}>
              <div style={s.friendAvatar}>{(r.name || '?')[0].toUpperCase()}</div>
              <div>
                <p style={s.friendName}>{r.name || 'Unknown'}</p>
                <p style={s.friendBio}>{r.bio || ''}</p>
                <p style={{ color: '#555', fontSize: 10, margin: 0 }}>{new Date(r.time).toLocaleDateString()}</p>
              </div>
            </div>
          ))}
          {recent.length > 0 && (
            <p style={{ color: '#6c63ff', fontSize: 12, cursor: 'pointer', marginTop: 12, textAlign: 'center' }} onClick={() => { localStorage.removeItem('recent_live'); setRecent([]); }}>Clear history</p>
          )}
        </div>
      </div>
    </div>
  );
}

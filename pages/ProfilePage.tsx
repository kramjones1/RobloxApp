import React, { useEffect, useRef, useState } from 'react';
import { getChatProfile, upsertChatProfile, ChatProfile } from '../supabaseClient';

type Page = 'profile' | 'terms' | 'privacy' | 'home';

interface Props {
  onNav: (p: Page) => void;
  user: any;
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const s = {
  page: { background: '#0a0a0a', fontFamily: 'system-ui, sans-serif' },
  wrap: { maxWidth: 600, margin: '0 auto', padding: '24px 16px 40px', display: 'flex', flexDirection: 'column' as const, gap: 20 },
  coverWrap: { position: 'relative' as const, width: '100%', height: 180, borderRadius: 14, overflow: 'hidden', background: 'linear-gradient(135deg, #6c63ff 0%, #2a6eff 50%, #00d4ff 100%)', flexShrink: 0 },
  coverImg: { width: '100%', height: '100%', objectFit: 'cover' as const, display: 'block' },
  coverOverlay: { position: 'absolute' as const, inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: 13, fontWeight: 600, border: 'none', width: '100%', opacity: 0, transition: 'opacity 0.2s' },
  avatarWrap: { display: 'flex', justifyContent: 'center', marginTop: -52 },
  avatar: { width: 96, height: 96, borderRadius: '50%', border: '4px solid #0a0a0a', background: '#222', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, color: '#fff', fontWeight: 700, overflow: 'hidden', position: 'relative' as const, flexShrink: 0, cursor: 'pointer' },
  avatarImg: { width: '100%', height: '100%', objectFit: 'cover' as const, display: 'block' },
  avatarOverlay: { position: 'absolute' as const, inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: 11, fontWeight: 600, opacity: 0, transition: 'opacity 0.2s' },
  name: { color: '#fff', fontSize: 20, fontWeight: 700, textAlign: 'center' as const, margin: 0 },
  card: { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 20 },
  cardTitle: { color: '#fff', fontSize: 16, fontWeight: 600, margin: '0 0 16px' },
  label: { color: '#aaa', fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'block' },
  input: { background: 'rgba(255,255,255,0.06)', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', padding: '11px 14px', borderRadius: 10, fontSize: 15, width: '100%', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const, marginBottom: 16 },
  textarea: { background: 'rgba(255,255,255,0.06)', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', padding: '11px 14px', borderRadius: 10, fontSize: 15, width: '100%', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const, marginBottom: 16, resize: 'vertical' as const, minHeight: 64 },
  toggleRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' },
  toggleLabel: { color: '#ccc', fontSize: 14 },
  toggleBtn: { padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none', fontFamily: 'inherit' },
  saveBtn: { marginTop: 12, background: 'linear-gradient(135deg, #6c63ff, #2a6eff)', color: '#fff', border: 'none', padding: '12px', borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', width: '100%' },
  msg: { fontSize: 13, textAlign: 'center' as const, marginTop: 12 },
  friendCard: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' },
  friendAvatar: { width: 36, height: 36, borderRadius: '50%', background: '#6c63ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 15, fontWeight: 600, flexShrink: 0 },
  friendName: { color: '#e0e0e0', fontSize: 14, fontWeight: 500 },
  friendBio: { color: '#777', fontSize: 12 },
  hiddenInput: { display: 'none' },
};

const hoverStyles = document.createElement('style');
hoverStyles.textContent = `
  .cover-overlay { opacity: 0 !important; }
  .av-overlay { opacity: 0 !important; }
  .cover-wrap:hover .cover-overlay { opacity: 1 !important; }
  .avatar-circle:hover .av-overlay { opacity: 1 !important; }
  @media (hover: none) {
    .cover-overlay { opacity: 1 !important; }
    .av-overlay { opacity: 0.8 !important; }
  }
`;
if (!document.getElementById('profile-hover-styles')) {
  hoverStyles.id = 'profile-hover-styles';
  document.head.appendChild(hoverStyles);
}

export default function ProfilePage({ onNav, user }: Props) {
  const [displayName, setDisplayName] = useState('Anonymous');
  const [bio, setBio] = useState('');
  const [shareName, setShareName] = useState(false);
  const [shareBio, setShareBio] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [recent, setRecent] = useState<{ id: string; name: string; bio: string; avatar: string; time: number }[]>([]);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const { profile } = await getChatProfile();
      if (profile) {
        setDisplayName(profile.display_name);
        setBio(profile.bio);
        setShareName(profile.share_name);
        setShareBio(profile.share_bio);
        setAvatarUrl(profile.avatar_url || localStorage.getItem('profile_avatar') || '');
        setCoverUrl(profile.cover_url || localStorage.getItem('profile_cover') || '');
      }
      setLoading(false);
    })();
    try { setRecent(JSON.parse(localStorage.getItem('recent_live') || '[]')); } catch {}
  }, []);

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500 * 1024) { setMsg('Image must be under 500KB'); return; }
    setUploadingAvatar(true);
    try {
      const url = await readFileAsDataURL(file);
      setAvatarUrl(url);
      localStorage.setItem('profile_avatar', url);
      upsertChatProfile({ display_name: displayName, bio, avatar_url: url, cover_url: coverUrl, share_name: shareName, share_bio: shareBio }).catch(() => {});
    } catch { setMsg('Failed to read avatar'); }
    setUploadingAvatar(false);
  }

  async function handleCoverUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500 * 1024) { setMsg('Image must be under 500KB'); return; }
    setUploadingCover(true);
    try {
      const url = await readFileAsDataURL(file);
      setCoverUrl(url);
      localStorage.setItem('profile_cover', url);
      upsertChatProfile({ display_name: displayName, bio, avatar_url: avatarUrl, cover_url: url, share_name: shareName, share_bio: shareBio }).catch(() => {});
    } catch { setMsg('Failed to read cover'); }
    setUploadingCover(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!displayName || displayName.length < 1) { setMsg('Display name is required'); return; }
    setSaving(true);
    setMsg('');
    const { error } = await upsertChatProfile({ display_name: displayName, bio, avatar_url: avatarUrl, cover_url: coverUrl, share_name: shareName, share_bio: shareBio });
    setSaving(false);
    if (error) setMsg(error);
    else setMsg('Saved!');
  }

  if (loading) return <div style={{ ...s.page, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>Loading...</div>;

  const initial = displayName ? displayName[0].toUpperCase() : 'A';

  return (
    <div style={s.page}>
      <div style={s.wrap}>
        <div className="cover-wrap" style={s.coverWrap}>
          {coverUrl ? <img src={coverUrl} alt="" style={s.coverImg} /> : null}
          <button className="cover-overlay" style={s.coverOverlay} onClick={() => coverInputRef.current?.click()} disabled={uploadingCover}>
            {uploadingCover ? 'Uploading...' : 'Change Cover'}
          </button>
        </div>
        <input ref={coverInputRef} type="file" accept="image/*" onChange={handleCoverUpload} style={s.hiddenInput} />

        <div style={s.avatarWrap}>
          <div className="avatar-circle" style={s.avatar} onClick={() => avatarInputRef.current?.click()}>
            {avatarUrl ? <img src={avatarUrl} alt="" style={s.avatarImg} /> : <span>{initial}</span>}
            <span className="av-overlay" style={s.avatarOverlay}>{uploadingAvatar ? '...' : 'Edit'}</span>
          </div>
        </div>
        <input ref={avatarInputRef} type="file" accept="image/*" onChange={handleAvatarUpload} style={s.hiddenInput} />

        <h1 style={s.name}>{displayName}</h1>

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
              {r.avatar ? <img src={r.avatar} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} /> : <div style={s.friendAvatar}>{(r.name || '?')[0].toUpperCase()}</div>}
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
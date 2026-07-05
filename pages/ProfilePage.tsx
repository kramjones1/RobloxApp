import React, { useEffect, useRef, useState } from 'react';
import { getChatProfile, upsertChatProfile, ChatProfile, getRecentLive, clearRecentLive, getUserProfile } from '../supabaseClient';

type Page = 'profile' | 'terms' | 'privacy' | 'home';

interface Props {
  onNav: (p: Page) => void;
  user: any;
  onMessage?: (userId: string) => void;
  viewUserId?: string | null;
  onViewProfile?: (userId: string) => void;
  onClearView?: () => void;
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
  page: { background: '#161616', fontFamily: 'system-ui, sans-serif', minHeight: '100vh' },
  wrap: { maxWidth: 700, margin: '0 auto', padding: '0 0 40px', display: 'flex', flexDirection: 'column' as const },
  coverWrap: { position: 'relative' as const, width: '100%', aspectRatio: '820/312' as any, overflow: 'hidden', background: 'linear-gradient(135deg, #6c63ff 0%, #2a6eff 50%, #00d4ff 100%)', flexShrink: 0 },
  coverImg: { width: '100%', height: '100%', objectFit: 'cover' as const, display: 'block', position: 'absolute' as const, inset: 0 },
  coverOverlay: { position: 'absolute' as const, inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: 13, fontWeight: 600, border: 'none', width: '100%', opacity: 0, transition: 'opacity 0.2s' },
  avatarWrap: { display: 'flex', justifyContent: 'flex-start', marginTop: -64, paddingLeft: 24 },
  avatar: { width: 140, height: 140, borderRadius: '50%', border: '5px solid #0a0a0a', background: '#222', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 44, color: '#fff', fontWeight: 700, overflow: 'hidden', position: 'relative' as const, flexShrink: 0, cursor: 'pointer' },
  avatarImg: { width: '100%', height: '100%', objectFit: 'cover' as const, display: 'block' },
  avatarOverlay: { position: 'absolute' as const, inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: 11, fontWeight: 600, opacity: 0, transition: 'opacity 0.2s' },
  nameSection: { padding: '8px 24px 4px', textAlign: 'left' as const },
  name: { color: '#fff', fontSize: 24, fontWeight: 700, margin: 0 },
  contentArea: { padding: '8px 24px 40px', display: 'flex', flexDirection: 'column' as const, gap: 12 },
  card: { background: '#1f1f1f', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 20 },
  cardTitle: { color: '#fff', fontSize: 16, fontWeight: 600, margin: '0 0 16px' },
  label: { color: '#aaa', fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'block' },
  input: { background: '#2a2a2a', color: '#fff', border: '1px solid rgba(255,255,255,0.08)', padding: '11px 14px', borderRadius: 10, fontSize: 15, width: '100%', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const, marginBottom: 16 },
  textarea: { background: '#2a2a2a', color: '#fff', border: '1px solid rgba(255,255,255,0.08)', padding: '11px 14px', borderRadius: 10, fontSize: 15, width: '100%', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const, marginBottom: 16, resize: 'vertical' as const, minHeight: 64 },
  toggleRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' },
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
  @media (max-width: 699px) {
    .profile-avatar { width: 100px !important; height: 100px !important; font-size: 32px !important; }
    .profile-avatar-wrap { margin-top: -48px !important; padding-left: 16px !important; }
    .profile-name-section { padding-left: 16px !important; }
  }
`;
if (!document.getElementById('profile-hover-styles')) {
  hoverStyles.id = 'profile-hover-styles';
  document.head.appendChild(hoverStyles);
}

export default function ProfilePage({ onNav, user, onMessage, viewUserId, onViewProfile, onClearView }: Props) {
  const [displayName, setDisplayName] = useState('Anonymous');
  const [bio, setBio] = useState('');
  const [shareName, setShareName] = useState(false);
  const [shareBio, setShareBio] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [recent, setRecent] = useState<{ id: string; name: string; bio: string; avatar: string; time: string }[]>([]);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [viewedUser, setViewedUser] = useState<{ name: string; bio: string; avatar: string; cover: string } | null>(null);
  const [loadingViewed, setLoadingViewed] = useState(false);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const longPressTimer = useRef<any>(null);

  const isViewingOther = viewUserId && viewUserId !== user?.id;

  // Long-press handlers
  function startLongPress(cb: () => void) {
    longPressTimer.current = setTimeout(cb, 500);
  }
  function cancelLongPress() {
    clearTimeout(longPressTimer.current);
  }

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
    getRecentLive().then(({ entries }) => {
      if (entries) setRecent(entries.map(e => ({ id: e.partner_id, name: e.partner_name, bio: e.partner_bio, avatar: e.partner_avatar, time: e.created_at })));
    });
  }, []);

  useEffect(() => {
    if (!isViewingOther) { setViewedUser(null); return; }
    setLoadingViewed(true);
    getUserProfile(viewUserId).then(({ profile }) => {
      if (profile) setViewedUser({ name: profile.display_name || 'User', bio: profile.bio || '', avatar: profile.avatar_url || '', cover: profile.cover_url || '' });
      setLoadingViewed(false);
    });
  }, [viewUserId, user?.id]);

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

  if (loading || loadingViewed) return <div style={{ ...s.page, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>Loading...</div>;

  const initial = (isViewingOther ? viewedUser?.name : displayName)?.[0]?.toUpperCase() || 'A';

  // Viewing another user's profile (read-only)
  if (isViewingOther && viewedUser) {
    return (
      <div style={s.page}>
        <div style={s.wrap}>
          
          <div className="cover-wrap" style={s.coverWrap}>
            {viewedUser.cover ? <img src={viewedUser.cover} alt="" style={s.coverImg} /> : null}
          </div>
          <div className="profile-avatar-wrap" style={s.avatarWrap}>
            <div className="avatar-circle profile-avatar" style={{ ...s.avatar, cursor: 'default' }}>
              {viewedUser.avatar ? <img src={viewedUser.avatar} alt="" style={s.avatarImg} /> : <span>{initial}</span>}
            </div>
          </div>
          <div className="profile-name-section" style={s.nameSection}>
            <h1 style={s.name}>{viewedUser.name}</h1>
            {viewedUser.bio && <p style={{ color: '#aaa', fontSize: 14, margin: '4px 0 0' }}>{viewedUser.bio}</p>}
          </div>
          {onMessage && (
            <div style={{ padding: '8px 24px 24px' }}>
              <button onClick={() => { onMessage(viewUserId); onClearView?.(); }} style={s.saveBtn}>Message</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={s.page}>
      <div style={s.wrap}>
        <div className="cover-wrap" style={s.coverWrap}>
          {coverUrl ? <img src={coverUrl} alt="" style={s.coverImg} /> : null}
          <button className="cover-overlay" style={s.coverOverlay}
            onTouchStart={() => startLongPress(() => coverInputRef.current?.click())}
            onTouchEnd={cancelLongPress} onTouchCancel={cancelLongPress}
            onMouseDown={() => startLongPress(() => coverInputRef.current?.click())}
            onMouseUp={cancelLongPress} onMouseLeave={cancelLongPress}
            onClick={(e) => { if (window.innerWidth >= 700) { e.preventDefault(); coverInputRef.current?.click(); } }}
            disabled={uploadingCover}>
            {uploadingCover ? 'Uploading...' : 'Change Cover'}
          </button>
        </div>
        <input ref={coverInputRef} type="file" accept="image/*" onChange={handleCoverUpload} style={s.hiddenInput} />

        <div className="profile-avatar-wrap" style={s.avatarWrap}>
          <div className="avatar-circle profile-avatar" style={s.avatar}
            onTouchStart={() => startLongPress(() => avatarInputRef.current?.click())}
            onTouchEnd={cancelLongPress} onTouchCancel={cancelLongPress}
            onMouseDown={() => startLongPress(() => avatarInputRef.current?.click())}
            onMouseUp={cancelLongPress} onMouseLeave={cancelLongPress}
            onClick={(e) => { if (window.innerWidth >= 700) { e.preventDefault(); avatarInputRef.current?.click(); } }}>
            {avatarUrl ? <img src={avatarUrl} alt="" style={s.avatarImg} /> : <span>{initial}</span>}
            <span className="av-overlay" style={s.avatarOverlay}>{uploadingAvatar ? '...' : 'Edit'}</span>
          </div>
        </div>
        <input ref={avatarInputRef} type="file" accept="image/*" onChange={handleAvatarUpload} style={s.hiddenInput} />

        <div className="profile-name-section" style={s.nameSection}>
          <h1 style={s.name}>{displayName}</h1>
        </div>

        <div style={s.contentArea}>

        <div style={s.card}>
          <h2 style={s.cardTitle}>About</h2>
          <form onSubmit={handleSave}>
            <label style={s.label}>Display Name {displayName !== 'Anonymous' && displayName !== '' && <span style={{ color: '#666', fontSize: 12, fontWeight: 400 }}>(locked — set at signup)</span>}</label>
            <input style={{ ...s.input, opacity: displayName !== 'Anonymous' && displayName !== '' ? 0.6 : 1, cursor: displayName !== 'Anonymous' && displayName !== '' ? 'not-allowed' : 'text' }} value={displayName} readOnly={displayName !== 'Anonymous' && displayName !== ''} onChange={e => setDisplayName(e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 9))} maxLength={9} placeholder="e.g. CoolUser1" />

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
          ) : (
            <div style={{ maxHeight: 320, overflowY: 'auto' as const }}>
            {recent.map((r, i) => (
              <div key={i} style={s.friendCard}>
                <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }} onClick={() => onViewProfile?.(r.id)}>
                  {r.avatar ? <img src={r.avatar} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} /> : <div style={s.friendAvatar}>{(r.name || '?')[0].toUpperCase()}</div>}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={s.friendName}>{r.name || 'Unknown'}</p>
                    <p style={s.friendBio}>{r.bio || ''}</p>
                    <p style={{ color: '#555', fontSize: 10, margin: 0 }}>{new Date(r.time).toLocaleDateString()}</p>
                  </div>
                </div>
                {onMessage && r.id && (
                  <button onClick={() => onMessage(r.id)} style={{ background: 'rgba(108,99,255,0.15)', color: '#6c63ff', border: 'none', padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>Message</button>
                )}
              </div>
            ))}
            </div>
          )}
          {recent.length > 0 && (
            <p style={{ color: '#6c63ff', fontSize: 12, cursor: 'pointer', marginTop: 12, textAlign: 'center' }} onClick={async () => { await clearRecentLive(); setRecent([]); }}>Clear history</p>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}
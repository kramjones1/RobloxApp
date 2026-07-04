import React, { useEffect, useState } from 'react';
import { getChatProfile, upsertChatProfile, ChatProfile, getSession } from '../supabaseClient';

const s = {
  page: { minHeight: '100vh', display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif', padding: '80px 20px' },
  card: { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '32px 28px', width: '100%', maxWidth: 440 },
  title: { color: '#fff', fontSize: 24, fontWeight: 700, margin: '0 0 24px', textAlign: 'center' as const },
  label: { color: '#aaa', fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'block' },
  input: { background: 'rgba(255,255,255,0.06)', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', padding: '11px 14px', borderRadius: 10, fontSize: 15, width: '100%', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const, marginBottom: 16 },
  textarea: { background: 'rgba(255,255,255,0.06)', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', padding: '11px 14px', borderRadius: 10, fontSize: 15, width: '100%', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const, marginBottom: 16, resize: 'vertical' as const, minHeight: 80 },
  toggleRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' },
  toggleLabel: { color: '#ccc', fontSize: 14 },
  toggleBtn: { padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none', fontFamily: 'inherit' },
  saveBtn: { marginTop: 24, background: 'linear-gradient(135deg, #6c63ff, #2a6eff)', color: '#fff', border: 'none', padding: '12px', borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', width: '100%' },
  msg: { fontSize: 13, textAlign: 'center' as const, marginTop: 12 },
};

type Page = 'profile' | 'terms' | 'privacy' | 'home';

interface Props {
  onNav: (p: Page) => void;
  user: any;
}

export default function ProfilePage({ onNav, user }: Props) {
  const [displayName, setDisplayName] = useState('Anonymous');
  const [bio, setBio] = useState('');
  const [shareName, setShareName] = useState(false);
  const [shareBio, setShareBio] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    (async () => {
      const { profile, error } = await getChatProfile();
      if (profile && !error) {
        setDisplayName(profile.display_name);
        setBio(profile.bio);
        setShareName(profile.share_name);
        setShareBio(profile.share_bio);
      }
      setLoading(false);
    })();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg('');
    const { error } = await upsertChatProfile({ display_name: displayName || 'Anonymous', bio, avatar_url: '', share_name: shareName, share_bio: shareBio });
    setSaving(false);
    if (error) setMsg(error);
    else setMsg('Saved!');
  }

  if (loading) return <div style={{ ...s.page, color: '#888' }}>Loading...</div>;

  return (
    <div style={s.page}>
      <div style={s.card}>
        <p style={s.title}>Profile Settings</p>
        <form onSubmit={handleSave}>
          <label style={s.label}>Display Name</label>
          <input style={s.input} value={displayName} onChange={e => setDisplayName(e.target.value)} maxLength={30} />

          <label style={s.label}>Bio</label>
          <textarea style={s.textarea} value={bio} onChange={e => setBio(e.target.value)} maxLength={200} />

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

          <button type="submit" disabled={saving} style={{ ...s.saveBtn, opacity: saving ? 0.5 : 1 }}>{saving ? 'Saving...' : 'Save'}</button>
        </form>
        {msg && <p style={{ ...s.msg, color: msg === 'Saved!' ? '#4caf50' : '#f44336' }}>{msg}</p>}
        <p style={{ color: '#555', fontSize: 12, textAlign: 'center', marginTop: 20, cursor: 'pointer' }} onClick={() => onNav('terms')}>Terms of Service</p>
        <p style={{ color: '#555', fontSize: 12, textAlign: 'center', marginTop: 4, cursor: 'pointer' }} onClick={() => onNav('privacy')}>Privacy Policy</p>
      </div>
    </div>
  );
}

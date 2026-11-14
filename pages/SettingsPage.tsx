import React, { useEffect, useState } from 'react';
import SupportChatPanel from './SupportChatPanel';

const panel: React.CSSProperties = { maxWidth: 720, margin: '0 auto', padding: '28px 18px 48px', color: '#fff', fontFamily: 'system-ui, sans-serif' };
const card: React.CSSProperties = { background: '#151515', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 14, padding: 18, marginTop: 14 };

export default function SettingsPage({ userId, onReplayOnboarding }: { userId: string; onReplayOnboarding?: () => void }) {
  const key = 'liveme-media-auto-request:' + userId;
  const [autoRequest, setAutoRequest] = useState(true);
  const [camera, setCamera] = useState('Checking…');
  const [microphone, setMicrophone] = useState('Checking…');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const light = theme === 'light';

  function updateTheme(value: 'dark' | 'light') {
    setTheme(value);
    try { localStorage.setItem('liveme-theme', value); } catch {}
    document.documentElement.dataset.theme = value;
    document.documentElement.style.colorScheme = value;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', value === 'light' ? '#f4f6fb' : '#1a1a1a');
    window.dispatchEvent(new Event('liveme-theme-change'));
  }

  async function refreshPermissions() {
    if (!navigator.permissions?.query) { setCamera('Check when starting'); setMicrophone('Check when starting'); return; }
    try {
      const [cam, mic] = await Promise.all([
        navigator.permissions.query({ name: 'camera' as PermissionName }),
        navigator.permissions.query({ name: 'microphone' as PermissionName }),
      ]);
      setCamera(cam.state); setMicrophone(mic.state);
      cam.onchange = () => setCamera(cam.state);
      mic.onchange = () => setMicrophone(mic.state);
    } catch { setCamera('Check when starting'); setMicrophone('Check when starting'); }
  }

  useEffect(() => {
    try {
      setAutoRequest(localStorage.getItem(key) !== 'false');
      const savedTheme = localStorage.getItem('liveme-theme') === 'light' ? 'light' : 'dark';
      setTheme(savedTheme);
      document.documentElement.dataset.theme = savedTheme;
      document.documentElement.style.colorScheme = savedTheme;
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', savedTheme === 'light' ? '#f4f6fb' : '#1a1a1a');
      window.dispatchEvent(new Event('liveme-theme-change'));
    } catch {}
    void refreshPermissions();
  }, [key]);

  function updatePreference(value: boolean) {
    setAutoRequest(value);
    try { localStorage.setItem(key, String(value)); } catch {}
  }

  async function requestDevices() {
    setBusy(true); setMessage('');
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      setMessage('Both camera and microphone are working and permission is granted in this browser.');
    } catch (error: any) {
      const name = error?.name || '';
      setMessage(name === 'NotAllowedError' || name === 'PermissionDeniedError'
        ? 'Permission was denied. Allow Camera and Microphone for this site in your browser settings, then try again.'
        : name === 'NotFoundError'
          ? 'A camera or microphone could not be found on this device.'
          : 'Could not access both devices: ' + (error?.message || name || 'Unknown error'));
    } finally {
      stream?.getTracks().forEach(track => track.stop());
      await refreshPermissions();
      setBusy(false);
    }
  }

  const status = (value: string) => value === 'granted' ? '#4caf50' : value === 'denied' ? '#f44336' : '#ffb74d';
  return <main data-onboarding-target="settings" style={{ ...panel, color: light ? '#20232a' : '#fff' }}>
    <h1 style={{ fontSize: 26, margin: '0 0 6px' }}>Settings</h1>
    <p style={{ color: light ? '#626875' : '#999', fontSize: 14, lineHeight: 1.5 }}>Manage your appearance and camera/microphone access.</p>
    <section style={{ ...card, background: light ? '#fff' : '#151515', borderColor: light ? '#e2e5ec' : 'rgba(255,255,255,0.09)' }}>
      <h2 style={{ fontSize: 17, margin: '0 0 8px', color: light ? '#20232a' : '#fff' }}>Appearance</h2>
      <p style={{ color: light ? '#626875' : '#aaa', fontSize: 13, lineHeight: 1.5, margin: '0 0 14px' }}>Choose how LiveMe looks on this device. Your choice is saved automatically.</p>
      <div role="group" aria-label="Color theme" style={{ display: 'flex', gap: 10 }}>
        <button type="button" aria-pressed={theme === 'light'} onClick={() => updateTheme('light')} style={{ flex: 1, border: theme === 'light' ? '2px solid #6c63ff' : '1px solid #bbb', borderRadius: 10, padding: '13px 10px', background: '#f4f6fb', color: '#20232a', fontWeight: 700, cursor: 'pointer' }}>☀ Light mode</button>
        <button type="button" aria-pressed={theme === 'dark'} onClick={() => updateTheme('dark')} style={{ flex: 1, border: theme === 'dark' ? '2px solid #8c85ff' : '1px solid #555', borderRadius: 10, padding: '13px 10px', background: '#171717', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>☾ Dark mode</button>
      </div>
    </section>
    <section style={{ ...card, background: light ? '#fff' : '#151515', borderColor: light ? '#e2e5ec' : 'rgba(255,255,255,0.09)' }}>
      <h2 style={{ fontSize: 17, margin: '0 0 8px', color: light ? '#20232a' : '#fff' }}>Camera & Microphone</h2>
      <p style={{ color: light ? '#626875' : '#aaa', fontSize: 13, lineHeight: 1.6, margin: '0 0 16px' }}>Random Chat requires both devices. LiveMe will request them together before placing you in the matching queue. Your camera and microphone are not kept running in the background.</p>
      <label style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', color: light ? '#303540' : '#eee', fontSize: 14 }}>
        <span><strong>Automatically request both when starting Random Chat</strong><small style={{ display: 'block', color: light ? '#737987' : '#888', marginTop: 4 }}>Recommended · Saved on this device for this account</small></span>
        <input aria-label="Automatically request camera and microphone" type="checkbox" checked={autoRequest} onChange={e => updatePreference(e.target.checked)} style={{ width: 22, height: 22, accentColor: '#6c63ff', flexShrink: 0 }} />
      </label>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', margin: '20px 0 14px' }}>
        <div><div style={{ color: light ? '#737987' : '#999', fontSize: 12 }}>Camera permission</div><strong style={{ color: status(camera), textTransform: 'capitalize' }}>{camera}</strong></div>
        <div><div style={{ color: light ? '#737987' : '#999', fontSize: 12 }}>Microphone permission</div><strong style={{ color: status(microphone), textTransform: 'capitalize' }}>{microphone}</strong></div>
      </div>
      <button type="button" disabled={busy} onClick={requestDevices} style={{ background: '#6c63ff', color: '#fff', border: 0, borderRadius: 8, padding: '11px 16px', fontWeight: 600, cursor: busy ? 'wait' : 'pointer', opacity: busy ? .6 : 1 }}>{busy ? 'Checking devices…' : 'Enable Camera & Microphone'}</button>
      {message && <p role="status" style={{ color: light ? '#4d5563' : '#ccc', fontSize: 13, lineHeight: 1.5, margin: '12px 0 0' }}>{message}</p>}
      <p style={{ color: light ? '#737987' : '#777', fontSize: 12, lineHeight: 1.5, margin: '14px 0 0' }}>Note: Browser permissions are controlled by your browser or device. This setting cannot override a denial or force Always Allow. If access is blocked, open your browser site settings and change Camera and Microphone to Allow.</p>
    </section>
    {onReplayOnboarding && <section style={{ ...card, background: light ? '#fff' : '#151515', borderColor: light ? '#e2e5ec' : 'rgba(255,255,255,0.09)' }}>
      <h2 style={{ fontSize: 17, margin: '0 0 8px', color: light ? '#20232a' : '#fff' }}>Guided tour</h2>
      <p style={{ color: light ? '#626875' : '#aaa', fontSize: 13, lineHeight: 1.5, margin: '0 0 12px' }}>Review the main LivMe features and safety tips at any time.</p>
      <button type="button" onClick={onReplayOnboarding} style={{ background: '#6c63ff', color: '#fff', border: 0, borderRadius: 8, padding: '11px 16px', fontWeight: 650, cursor: 'pointer' }}>Replay guided tour</button>
    </section>}
    <section style={{ ...card, background: light ? '#fff' : '#151515', borderColor: light ? '#e2e5ec' : 'rgba(255,255,255,0.09)' }}>
      <h2 style={{ fontSize: 17, margin: '0 0 8px', color: light ? '#20232a' : '#fff' }}>Help & Support</h2>
      <p style={{ color: light ? '#626875' : '#aaa', fontSize: 13, lineHeight: 1.5, margin: '0 0 12px' }}>Contact the LivMe team and follow your support conversations here.</p>
      <SupportChatPanel user={{ id: userId }} />
    </section>
  </main>;
}

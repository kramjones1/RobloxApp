import React, { useEffect, useRef, useState } from 'react';
import { signUp, signIn, signOut, getSession, onAuthChange, getChatProfile, getConversations } from './supabaseClient';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import LandingPage from './pages/LandingPage';
import PrivacyPage from './pages/PrivacyPage';
import TermsPage from './pages/TermsPage';
import ProfilePage from './pages/ProfilePage';
import MessagesPage from './pages/MessagesPage';

const WS_URL = 'wss://omegle-signaling-server-251a.onbelmo.uk';

const style = document.createElement('style');
style.textContent = '*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}html,body{width:100%;min-height:100vh;background:#0a0a0a;overflow-x:hidden}@media(min-width:500px){.nav-email{display:inline!important}}@media(max-width:699px){.desktop-layout{display:none!important}}@media(min-width:700px){.mobile-auth{display:none!important}}.hero-left{text-align:center}@media(min-width:800px){.hero-left{text-align:left}}';
document.head.appendChild(style);

export default function WebApp() {
  const [page, setPage] = useState('home');
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMsg, setAuthMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [state, setState] = useState('idle');
  const [id, setId] = useState('');
  const [log, setLog] = useState('');
  const [wsStatus, setWsStatus] = useState('connecting');
  const [partnerId, setPartnerId] = useState('');
  const [reportSent, setReportSent] = useState(false);
  const [camError, setCamError] = useState('');
  const [noAudio, setNoAudio] = useState(false);
  const localRef = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<any>(null);
  const lsRef = useRef<any>(null);
  const wsRef = useRef<WebSocket>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  function addLog(msg: string) { console.log(msg); setLog(msg); }

  useEffect(() => {
    const u = getSession();
    setUser(u);
    setAuthLoading(false);
    return onAuthChange(u2 => setUser(u2));
  }, []);

  useEffect(() => {
    if (!user) { setUnreadCount(0); return; }
    const iv = setInterval(async () => {
      const { conversations } = await getConversations();
      if (conversations) setUnreadCount(conversations.reduce((sum: number, c: any) => sum + (c.unread || 0), 0));
    }, 5000);
    return () => clearInterval(iv);
  }, [user]);

  useEffect(() => {
    if (user && page === 'auth') setPage('home');
  }, [user, page]);

  useEffect(() => {
    if (!user) return;
    connect();
    return () => { wsRef.current?.close(); lsRef.current?.getTracks().forEach((t: any) => t.stop()); };
  }, [user]);

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    setAuthMsg('');
    if (password.length < 6) { setAuthMsg('Password must be at least 6 characters'); return; }
    setSubmitting(true);
    const fn = authMode === 'login' ? signIn : signUp;
    const { error } = await fn(email, password);
    setSubmitting(false);
    if (error) setAuthMsg(error);
    else if (window.innerWidth < 700) { setPage('chat'); setTimeout(findStranger, 200); }
    else setPage('home');
  }

  async function handleLogout() {
    signOut();
    wsRef.current?.close();
    cleanup();
    setPage('home');
  }

  function connect() {
    setWsStatus('connecting');
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    ws.onopen = () => { setWsStatus('connected'); addLog('Connected'); };
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      addLog('Signal: ' + msg.type);
      switch (msg.type) {
        case 'connected': setId(msg.id); break;
        case 'matched': setPartnerId(msg.partner); setReportSent(false); startCall(ws, msg.role); break;
        case 'partner_left': cleanup(); addLog('Partner left'); setPartnerId(''); break;
        case 'reported': addLog('You have been reported'); break;
        case 'report_ack': addLog('Report submitted'); break;
        case 'sdp': handleSDP(ws, msg); break;
        case 'ice': handleICE(msg); break;
      }
    };
    ws.onerror = () => { setWsStatus('error'); addLog('WS error'); };
    ws.onclose = () => { if (wsStatus === 'connected') { setWsStatus('disconnected'); addLog('Disconnected'); } };
  }

  async function startCall(ws: WebSocket, role?: string) {
    addLog('Starting call...');
    setState('connecting');
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayprojectsecret' },
        { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayprojectsecret' },
        { urls: 'turn:openrelay.metered.ca:80?transport=tcp', username: 'openrelayproject', credential: 'openrelayprojectsecret' },
      ],
    });
    pcRef.current = pc;
    pc.onicecandidate = (e) => { if (e.candidate) ws.send(JSON.stringify({ type: 'ice', candidate: e.candidate })); };
    pc.ontrack = (e) => {
      if (e.streams?.[0] && remoteRef.current) remoteRef.current.srcObject = e.streams[0];
    };
    pc.oniceconnectionstatechange = () => { addLog('ICE: ' + pc.iceConnectionState); };
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'connected') addLog('Connected!'); };
    const stream = lsRef.current;
    if (stream) {
      stream.getTracks().forEach((t: any) => {
        pc.addTrack(t, stream);
        if (t.kind === 'audio') t.onended = () => { setNoAudio(true); addLog('Mic disconnected'); };
      });
    }
    if (role === 'offer') {
      addLog('Creating offer...');
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      ws.send(JSON.stringify({ type: 'sdp', sdp: pc.localDescription }));
      addLog('Sent offer');
    } else {
      addLog('Waiting for offer...');
    }
    setState('connected');
  }

  async function handleSDP(ws: WebSocket, msg: any) {
    const pc = pcRef.current;
    if (!pc) { addLog('Error: no PC'); return; }
    addLog('Received ' + msg.sdp.type);
    await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
    if (msg.sdp.type === 'offer') {
      addLog('Creating answer...');
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      ws.send(JSON.stringify({ type: 'sdp', sdp: pc.localDescription }));
      addLog('Sent answer');
    }
  }

  async function handleICE(msg: any) {
    try { await pcRef.current?.addIceCandidate(new RTCIceCandidate(msg.candidate)); } catch (_) {}
  }

  async function findStranger() {
    setCamError('');
    setNoAudio(false);
    try {
      addLog('Requesting camera...');
      let stream: MediaProvider;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 } },
          audio: { echoCancellation: true, noiseSuppression: true },
        });
      } catch {
        addLog('Audio unavailable, trying video only...');
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
        setNoAudio(true);
      }
      addLog('Camera OK');
      lsRef.current = stream;
      if (localRef.current) localRef.current.srcObject = stream;
      setState('searching');
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        addLog('WS not open, reconnecting...');
        connect();
        await new Promise(r => setTimeout(r, 2000));
      }
      wsRef.current?.send(JSON.stringify({ type: 'find' }));
      addLog('Searching for partner...');
    } catch (e: any) {
      const denied = e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError';
      const notFound = e.name === 'NotFoundError';
      const inUse = e.message?.includes('already in use') || e.message?.includes('Could not start');
      if (denied) setCamError('Camera permission denied. Please allow camera access in your browser settings and try again.');
      else if (notFound) setCamError('No camera found on this device.');
      else if (inUse) setCamError('Camera is in use by another app or tab. Close it and try again.');
      else setCamError(e.message || 'Could not access camera.');
      addLog('Error: ' + (e.message || e.name));
    }
  }

  function reportUser() {
    if (!partnerId || reportSent) return;
    wsRef.current?.send(JSON.stringify({ type: 'report', target: partnerId }));
    setReportSent(true);
    addLog('Report sent. Thank you.');
  }

  function cleanup() {
    lsRef.current?.getTracks().forEach((t: any) => t.stop());
    lsRef.current = null; pcRef.current?.close(); pcRef.current = null;
    setState('idle'); setNoAudio(false);
  }

  function skip() { cleanup(); setPartnerId(''); wsRef.current?.send(JSON.stringify({ type: 'next' })); }

  const wsColor = wsStatus === 'connected' ? '#4caf50' : wsStatus === 'connecting' ? '#ff9800' : '#f44336';

  const sBtn: React.CSSProperties = {
    background: 'linear-gradient(135deg, #6c63ff, #2a6eff)',
    color: '#fff', border: 'none',
    padding: '14px 40px', borderRadius: 50, fontSize: 16, fontWeight: 600, cursor: 'pointer',
    fontFamily: 'system-ui, sans-serif', width: '100%', maxWidth: 320,
    boxShadow: '0 4px 20px rgba(108,99,255,0.3)',
    transition: 'transform 0.2s, box-shadow 0.2s',
  };
  const input: React.CSSProperties = {
    background: 'rgba(255,255,255,0.06)',
    color: '#fff', border: '1px solid rgba(255,255,255,0.12)',
    padding: '12px 16px', borderRadius: 10, fontSize: 16, width: '100%',
    outline: 'none', fontFamily: 'system-ui, sans-serif', boxSizing: 'border-box',
    transition: 'border-color 0.2s',
  };
  const mobileBtn: React.CSSProperties = {
    background: 'linear-gradient(135deg, #6c63ff, #2a6eff)',
    color: '#fff', border: 'none',
    padding: '12px', borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: 'pointer',
    fontFamily: 'system-ui, sans-serif', width: '100%',
    boxShadow: '0 4px 20px rgba(108,99,255,0.3)',
  };

  if (authLoading) {
    return (
      <div style={{ width: '100vw', height: '100vh', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif' }}>
        <p style={{ color: '#888' }}>Loading...</p>
      </div>
    );
  }

  if (page === 'privacy') {
    return (
      <div style={{ background: '#0a0a0a', minHeight: '100vh' }}>
<Navbar page={page} setPage={setPage} user={user} onLogout={handleLogout} unreadCount={unreadCount} />
        <PrivacyPage />
      </div>
    );
  }

  if (page === 'terms') {
    return (
      <div style={{ background: '#0a0a0a', minHeight: '100vh' }}>
        <Navbar page={page} setPage={setPage} user={user} onLogout={handleLogout} unreadCount={unreadCount} />
        <TermsPage />
        <Footer setPage={setPage} />
      </div>
    );
  }

  if (page === 'profile') {
    return (
      <div style={{ background: '#0a0a0a', minHeight: '100vh' }}>
        <Navbar page={page} setPage={setPage} user={user} onLogout={handleLogout} unreadCount={unreadCount} />
        <ProfilePage onNav={setPage as any} user={user} />
        <Footer setPage={setPage} />
      </div>
    );
  }

  if (page === 'messages') {
    return (
      <div style={{ background: '#0a0a0a', minHeight: '100vh' }}>
        <Navbar page={page} setPage={setPage} user={user} onLogout={handleLogout} unreadCount={unreadCount} />
        <MessagesPage />
      </div>
    );
  }

  if (!user) {
    return (
      <>
        {/* Mobile: clean auth form only (shown on < 700px) */}
        <div className="mobile-auth" style={{ width: '100vw', minHeight: '100vh', background: '#0a0a0a', fontFamily: 'system-ui, sans-serif', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <h1 style={{ fontSize: 40, fontWeight: 800, margin: 0, marginBottom: 4, background: 'linear-gradient(135deg, #6c63ff, #2a6eff, #00d4ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>LiveMe</h1>
          <p style={{ color: '#888', fontSize: 14, marginBottom: 24 }}>{authMode === 'login' ? 'Welcome back' : 'Create an account'}</p>
          <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 360 }}>
            <input style={input} type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
            <input style={input} type="password" placeholder="Password (min 6 chars)" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
            <button type="submit" disabled={submitting} style={{...mobileBtn, opacity: submitting ? 0.5 : 1}}>{submitting ? 'Please wait...' : authMode === 'login' ? 'Sign In' : 'Sign Up'}</button>
          </form>
          {authMsg && <p style={{ color: authMsg.includes('error') || authMsg.includes('Error') ? '#f44336' : '#ff9800', fontSize: 13, marginTop: 12, textAlign: 'center', maxWidth: 320, wordBreak: 'break-word' }}>{authMsg}</p>}
          <p style={{ color: '#666', fontSize: 13, marginTop: 16, cursor: 'pointer' }} onClick={() => { setAuthMode(authMode === 'login' ? 'register' : 'login'); setAuthMsg(''); }}>
            {authMode === 'login' ? "Don't have an account? Sign Up" : 'Already have an account? Sign In'}
          </p>
        </div>

        {/* Desktop: full landing page with inline auth (shown on >= 700px) */}
        <div className="desktop-layout" style={{ background: '#0a0a0a', minHeight: '100vh' }}>
          <Navbar page={page} setPage={setPage} user={user} onLogout={handleLogout} />
          <LandingPage
            onStart={() => {}}
            authMode={authMode}
            authMsg={authMsg}
            submitting={submitting}
            email={email}
            password={password}
            onEmailChange={setEmail}
            onPasswordChange={setPassword}
            onSubmit={handleAuth}
            onToggleAuth={() => { setAuthMode(authMode === 'login' ? 'register' : 'login'); setAuthMsg(''); }}
          />
          <Footer setPage={setPage} />
        </div>
      </>
    );
  }

  if (page === 'home') {
    return (
      <div style={{ background: '#0a0a0a', minHeight: '100vh' }}>
        <Navbar page={page} setPage={setPage} user={user} onLogout={handleLogout} unreadCount={unreadCount} />
        <LandingPage onStart={() => {
          setPage('chat');
          setTimeout(findStranger, 100);
        }} />
        <Footer setPage={setPage} />
      </div>
    );
  }

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#0a0a0a', fontFamily: 'system-ui, sans-serif', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <video ref={remoteRef} autoPlay playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', background: '#111' }} />
      <video ref={localRef} autoPlay playsInline muted style={{ position: 'absolute', top: 14, right: 10, width: 100, height: 140, borderRadius: 10, zIndex: 10, border: '2px solid rgba(255,255,255,0.15)', objectFit: 'cover', background: '#111' }} />

      <div style={{ position: 'absolute', top: 14, left: 14, zIndex: 30, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: wsColor, display: 'inline-block' }} />
        <span style={{ color: '#aaa', fontSize: 11 }}>{wsStatus}</span>
        {noAudio && <span style={{ color: '#ff9800', fontSize: 11, marginLeft: 4 }}>Mic off</span>}
      </div>

      {state === 'idle' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 20, background: 'rgba(0,0,0,0.6)' }}>
          <p style={{ color: '#888', marginBottom: 20 }}>Preview</p>
          <button onClick={findStranger} style={sBtn}>Start Chatting</button>
          {camError && (
            <div style={{ marginTop: 16, padding: '12px 20px', background: 'rgba(244,67,54,0.12)', borderRadius: 10, maxWidth: 320, textAlign: 'center' }}>
              <p style={{ color: '#f44336', fontSize: 13, margin: 0, lineHeight: 1.4 }}>{camError}</p>
              <p style={{ color: '#888', fontSize: 11, marginTop: 8, cursor: 'pointer' }} onClick={() => setCamError('')}>Dismiss</p>
            </div>
          )}
          {noAudio && (
            <div style={{ marginTop: 12, padding: '8px 16px', background: 'rgba(255,152,0,0.12)', borderRadius: 10, maxWidth: 320, textAlign: 'center' }}>
              <p style={{ color: '#ff9800', fontSize: 12, margin: 0 }}>No microphone — your partner won't hear you</p>
            </div>
          )}
          <p style={{ color: '#aaa', fontSize: 14, marginTop: camError ? 8 : 20, textAlign: 'center', maxWidth: '80%' }}>{log}</p>
        </div>
      )}

      {(state === 'searching' || state === 'connecting') && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 20, background: 'rgba(0,0,0,0.6)' }}>
          <div style={{ width: 40, height: 40, border: '3px solid #333', borderTopColor: '#6c63ff', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: 20 }} />
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          <p style={{ color: '#aaa', fontSize: 18 }}>{log || (state === 'connecting' ? 'Connecting...' : 'Searching...')}</p>
          <button onClick={() => { wsRef.current?.send(JSON.stringify({ type: 'leave' })); cleanup(); }} style={{ ...sBtn, marginTop: 20, background: '#555', boxShadow: 'none' }}>Cancel</button>
        </div>
      )}

      {state === 'connected' && (
        <div style={{ position: 'absolute', bottom: 30, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 20, gap: 6 }}>
          <p style={{ color: '#aaa', fontSize: 12, margin: 0 }}>{log}</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', padding: '0 10px' }}>
            <button onClick={reportUser} style={{
              ...sBtn, width: 'auto', padding: '8px 16px', background: reportSent ? '#2e7d32' : 'rgba(255,255,255,0.08)',
              boxShadow: 'none', fontSize: 12,
            }}>
              {reportSent ? 'Reported' : 'Report'}
            </button>
            <button onClick={skip} style={{
              ...sBtn, width: 'auto', padding: '8px 16px', background: '#d32f2f',
              boxShadow: 'none', fontSize: 12,
            }}>
              Next →
            </button>
            <button onClick={() => { skip(); setPage('home'); }} style={{
              ...sBtn, width: 'auto', padding: '8px 16px', background: '#555',
              boxShadow: 'none', fontSize: 12,
            }}>
              Leave
            </button>
          </div>
        </div>
      )}

      <p style={{ position: 'absolute', bottom: 3, left: 6, color: '#555', fontSize: 10, margin: 0, zIndex: 20, fontFamily: 'system-ui, sans-serif' }}>ID: {id}</p>
    </div>
  );
}

import React, { useEffect, useRef, useState } from 'react';
import { signUp, signIn, signOut, resetPassword, updatePassword, setSessionToken, getSession, onAuthChange, getChatProfile, upsertChatProfile } from './supabaseClient';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import LandingPage from './pages/LandingPage';
import PrivacyPage from './pages/PrivacyPage';
import TermsPage from './pages/TermsPage';
import ProfilePage from './pages/ProfilePage';

const WS_URL = 'wss://omegle-signaling-server-251a.onbelmo.uk';

const meta = document.createElement('meta');
meta.name = 'theme-color';
meta.content = '#1a1a1a';
document.head.appendChild(meta);

const style = document.createElement('style');
style.textContent = '*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}html,body{width:100%;min-height:100vh;background:#0a0a0a;overflow-x:hidden}@keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}@media(max-width:699px){.desktop-layout{display:none!important}}@media(min-width:700px){.mobile-auth{display:none!important}}.hero-left{text-align:center}@media(min-width:800px){.hero-left{text-align:left}}';
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
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotCooldown, setForgotCooldown] = useState(0);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [passwordUpdated, setPasswordUpdated] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState<'name' | 'bio' | null>(null);
  const [onboardingName, setOnboardingName] = useState('');
  const [onboardingBio, setOnboardingBio] = useState('');

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
  const dcRef = useRef<any>(null);
  const [chatMessages, setChatMessages] = useState<{ me: boolean; text: string }[]>([]);
  const [showChat, setShowChat] = useState(false);
  const [partnerProfile, setPartnerProfile] = useState<{ name: string; bio: string; avatar: string } | null>(null);
  const [myProfile, setMyProfile] = useState<{ name: string; bio: string; avatar: string } | null>(null);
  const [chatInput, setChatInput] = useState('');

  function addLog(msg: string) { console.log(msg); setLog(msg); }

  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes('type=recovery') && hash.includes('access_token=')) {
      const params = new URLSearchParams(hash.slice(1));
      const token = params.get('access_token');
      if (token) {
        setSessionToken(token);
        window.location.hash = '';
        setRecoveryMode(true);
      }
    }
    const u = getSession();
    setUser(u);
    setAuthLoading(false);
    if (u) getChatProfile().then(({ profile }) => { if (profile) setMyProfile({ name: profile.display_name, bio: profile.bio, avatar: profile.avatar_url }); });
    return onAuthChange(u2 => {
      setUser(u2);
      if (u2) getChatProfile().then(({ profile }) => { if (profile) setMyProfile({ name: profile.display_name, bio: profile.bio, avatar: profile.avatar_url }); });
      else setMyProfile(null);
    });
  }, []);

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
    else if (authMode === 'register') setOnboardingStep('name');
    else setPage('profile');
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    setAuthMsg('');
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(forgotEmail)) { setAuthMsg('Please enter a valid email address (e.g. name@domain.com)'); return; }
    setSubmitting(true);
    const { error } = await resetPassword(forgotEmail);
    setSubmitting(false);
    if (error) {
      setAuthMsg(error);
      setForgotCooldown(60);
      const iv = setInterval(() => setForgotCooldown(prev => { if (prev <= 1) { clearInterval(iv); return 0; } return prev - 1; }), 1000);
    } else {
      setForgotSent(true);
      setForgotCooldown(60);
      const iv = setInterval(() => setForgotCooldown(prev => { if (prev <= 1) { clearInterval(iv); return 0; } return prev - 1; }), 1000);
    }
  }

  async function handlePasswordReset(e: React.FormEvent) {
    e.preventDefault();
    setAuthMsg('');
    if (newPassword.length < 6) { setAuthMsg('Password must be at least 6 characters'); return; }
    setSubmitting(true);
    const { error } = await updatePassword(newPassword);
    setSubmitting(false);
    if (error) setAuthMsg(error);
    else setPasswordUpdated(true);
  }

  async function handleOnboardingSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAuthMsg('');
    if (onboardingStep === 'name') {
      if (!onboardingName || onboardingName.length < 1) { setAuthMsg('Display name is required'); return; }
      setSubmitting(true);
      const { error } = await upsertChatProfile({ display_name: onboardingName, bio: '', avatar_url: '', cover_url: '', share_name: true, share_bio: true });
      setSubmitting(false);
      if (error) setAuthMsg(error);
      else setOnboardingStep('bio');
    } else {
      setSubmitting(true);
      const { error } = await upsertChatProfile({ display_name: onboardingName, bio: onboardingBio, avatar_url: '', cover_url: '', share_name: true, share_bio: true });
      setSubmitting(false);
      if (error) setAuthMsg(error);
      else setOnboardingStep(null);
    }
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

    function onDcMessage(e: any) {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'msg') {
          const msg = { me: false, text: data.text };
          setChatMessages(prev => [...prev, msg]);
          setTimeout(() => setChatMessages(prev => prev.filter(m => m !== msg)), 5000);
        } else if (data.type === 'profile') {
          setPartnerProfile({ name: data.name, bio: data.bio, avatar: data.avatar || '' });
        }
      } catch {}
    }

    if (role === 'offer') {
      const dc = pc.createDataChannel('chat');
      dcRef.current = dc;
      dc.onopen = () => { addLog('Chat ready'); if (myProfile) dc.send(JSON.stringify({ type: 'profile', name: myProfile.name, bio: myProfile.bio, avatar: myProfile.avatar })); };
      dc.onmessage = onDcMessage;
    } else {
      pc.ondatachannel = (e) => {
        const dc = e.channel;
        dcRef.current = dc;
        dc.onopen = () => { addLog('Chat ready'); if (myProfile) dc.send(JSON.stringify({ type: 'profile', name: myProfile.name, bio: myProfile.bio, avatar: myProfile.avatar })); };
        dc.onmessage = onDcMessage;
      };
    }

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
    const { profile } = await getChatProfile();
    if (profile) setMyProfile({ name: profile.display_name, bio: profile.bio, avatar: profile.avatar_url });
    if (lsRef.current) {
      lsRef.current.getTracks().forEach((t: any) => t.stop());
      lsRef.current = null;
    }
    try {
      addLog('Requesting camera...');
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 } } });
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioStream.getAudioTracks().forEach(t => stream.addTrack(t));
      } catch {
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
      const inUse = e.message?.includes('already in use') || e.name === 'NotReadableError';
      const camFail = e.message?.includes('Could not start');
      if (denied) setCamError('Camera permission denied. Please allow camera access in your browser settings and try again.');
      else if (notFound) setCamError('No camera found on this device.');
      else if (inUse) setCamError('Camera is in use by another app or tab. Close Zoom, OBS, or other camera apps and try again.');
      else if (camFail) setCamError('Camera failed to start. Try restarting your browser or reconnecting your camera.');
      else setCamError('Could not access camera: ' + (e.message || e.name));
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
    if (partnerId && partnerProfile) {
      try {
        const recent = JSON.parse(localStorage.getItem('recent_live') || '[]');
        recent.unshift({ id: partnerId, name: partnerProfile.name, bio: partnerProfile.bio, avatar: partnerProfile.avatar, time: Date.now() });
        localStorage.setItem('recent_live', JSON.stringify(recent.slice(0, 20)));
      } catch {}
    }
    lsRef.current?.getTracks().forEach((t: any) => t.stop());
    lsRef.current = null; pcRef.current?.close(); pcRef.current = null; dcRef.current = null;
    setState('idle'); setNoAudio(false); setPartnerProfile(null); setChatMessages([]); setShowChat(false); setPartnerId('');
  }

  function skip() { cleanup(); setPartnerId(''); wsRef.current?.send(JSON.stringify({ type: 'next' })); }

  function sendChat() {
    const text = chatInput.trim();
    if (!text || !dcRef.current) return;
    dcRef.current.send(JSON.stringify({ type: 'msg', text }));
    const msg = { me: true, text };
    setChatMessages(prev => [...prev, msg]);
    setTimeout(() => setChatMessages(prev => prev.filter(m => m !== msg)), 5000);
    setChatInput('');
  }

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
    padding: '14px 18px', borderRadius: 12, fontSize: 17, width: '100%',
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

  if (recoveryMode) {
    return (
      <div style={{ width: '100vw', minHeight: '100vh', background: '#0a0a0a', fontFamily: 'system-ui, sans-serif', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <h1 style={{ fontSize: 40, fontWeight: 800, margin: 0, marginBottom: 4, background: 'linear-gradient(135deg, #6c63ff, #2a6eff, #00d4ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>LiveMe</h1>
        {passwordUpdated ? (
          <>
            <p style={{ color: '#4caf50', fontSize: 16, marginBottom: 16, textAlign: 'center' }}>Password updated successfully!</p>
            <p style={{ color: '#aaa', fontSize: 14, textAlign: 'center', maxWidth: 320, lineHeight: 1.5, marginBottom: 16 }}>
              Your password has been changed. You can now sign in with your new password.
            </p>
            <button onClick={() => { setRecoveryMode(false); setPasswordUpdated(false); setNewPassword(''); signOut(); }} style={mobileBtn}>
              Go to Sign In
            </button>
          </>
        ) : (
          <>
            <p style={{ color: '#888', fontSize: 14, marginBottom: 24 }}>Set a new password</p>
            <form onSubmit={handlePasswordReset} style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 360 }}>
              <input style={input} type="password" placeholder="New password (min 6 chars)" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={6} />
              <button type="submit" disabled={submitting} style={{...mobileBtn, opacity: submitting ? 0.5 : 1}}>{submitting ? 'Updating...' : 'Update Password'}</button>
            </form>
            {authMsg && <p style={{ color: authMsg.includes('error') || authMsg.includes('Error') ? '#f44336' : '#ff9800', fontSize: 13, marginTop: 12, textAlign: 'center', maxWidth: 320, wordBreak: 'break-word' }}>{authMsg}</p>}
          </>
        )}
      </div>
    );
  }

  if (onboardingStep) {
    return (
      <div style={{ width: '100vw', minHeight: '100vh', background: '#0a0a0a', fontFamily: 'system-ui, sans-serif', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <h1 style={{ fontSize: 40, fontWeight: 800, margin: 0, marginBottom: 4, background: 'linear-gradient(135deg, #6c63ff, #2a6eff, #00d4ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>LiveMe</h1>
        <p style={{ color: '#888', fontSize: 14, marginBottom: 24 }}>{onboardingStep === 'name' ? 'Choose your display name' : 'Add a bio (optional)'}</p>
        <form onSubmit={handleOnboardingSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 360 }}>
          {onboardingStep === 'name' ? (
            <input style={input} type="text" placeholder="Display name (a-Z, 0-9, max 9 chars)" value={onboardingName} onChange={e => setOnboardingName(e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 9))} maxLength={9} required />
          ) : (
            <>
              <p style={{ color: '#aaa', fontSize: 14, textAlign: 'center', wordBreak: 'break-word', margin: 0 }}>Display name: <b style={{ color: '#fff' }}>{onboardingName}</b></p>
              <textarea style={{ ...input, resize: 'vertical', minHeight: 80, fontFamily: 'inherit' }} placeholder="Tell people about yourself (optional)" value={onboardingBio} onChange={e => setOnboardingBio(e.target.value)} maxLength={200} />
            </>
          )}
          <button type="submit" disabled={submitting} style={{...mobileBtn, opacity: submitting ? 0.5 : 1}}>
            {submitting ? 'Saving...' : onboardingStep === 'name' ? 'Next' : 'Go to Profile'}
          </button>
        </form>
        {authMsg && <p style={{ color: authMsg.includes('error') || authMsg.includes('Error') ? '#f44336' : '#ff9800', fontSize: 13, marginTop: 12, textAlign: 'center', maxWidth: 320, wordBreak: 'break-word' }}>{authMsg}</p>}
        {onboardingStep === 'bio' && (
          <p style={{ color: '#6c63ff', fontSize: 12, marginTop: 12, cursor: 'pointer' }} onClick={handleOnboardingSubmit}>Skip</p>
        )}
      </div>
    );
  }

  if (authLoading) {
    return (
      <div style={{ width: '100vw', height: '100vh', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif' }}>
        <p style={{ color: '#888' }}>Loading...</p>
      </div>
    );
  }

  if (page === 'privacy') {
    return (
      <div className="page-content" style={{ background: '#0a0a0a', minHeight: '100vh' }}>
        <Navbar page={page} setPage={setPage} user={user} onLogout={handleLogout} />
        <PrivacyPage />
      </div>
    );
  }

  if (page === 'terms') {
    return (
      <div className="page-content" style={{ background: '#0a0a0a', minHeight: '100vh' }}>
        <Navbar page={page} setPage={setPage} user={user} onLogout={handleLogout} />
        <TermsPage />
        <Footer setPage={setPage} />
      </div>
    );
  }

  if (page === 'profile') {
    return (
      <div className="page-content" style={{ background: '#0a0a0a', minHeight: '100vh', overflowY: 'auto' as const }}>
        <Navbar page={page} setPage={setPage} user={user} onLogout={handleLogout} />
        <ProfilePage onNav={setPage as any} user={user} />
        <Footer setPage={setPage} />
      </div>
    );
  }

  if (!user) {
    return (
      <>
        {/* Mobile: clean auth form only (shown on < 700px) */}
        <div className="mobile-auth" style={{ width: '100vw', minHeight: '100vh', background: '#0a0a0a', fontFamily: 'system-ui, sans-serif', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          {showForgot ? (
            <>
              <h1 style={{ fontSize: 40, fontWeight: 800, margin: 0, marginBottom: 4, background: 'linear-gradient(135deg, #6c63ff, #2a6eff, #00d4ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>LiveMe</h1>
              <p style={{ color: '#888', fontSize: 14, marginBottom: 24 }}>{forgotSent ? 'Check your email' : 'Reset password'}</p>
              {forgotSent ? (
                <>
                  <p style={{ color: '#aaa', fontSize: 14, textAlign: 'center', maxWidth: 320, lineHeight: 1.5, marginBottom: 16, wordBreak: 'break-word' }}>
                    If an account exists at <b style={{ color: '#fff' }}>{forgotEmail}</b>, we've sent a password reset link. Check your inbox and spam folder.
                  </p>
                  <button onClick={() => { setShowForgot(false); setForgotSent(false); setForgotEmail(''); setAuthMsg(''); }} style={mobileBtn}>
                    Back to Sign In
                  </button>
                </>
              ) : (
                <form onSubmit={handleForgotPassword} style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 360 }}>
                  <input style={input} type="email" placeholder="Your email address" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} required />
                  <button type="submit" disabled={submitting || forgotCooldown > 0} style={{...mobileBtn, opacity: submitting || forgotCooldown > 0 ? 0.5 : 1}}>
                    {submitting ? 'Sending...' : forgotCooldown > 0 ? `Wait ${forgotCooldown}s` : 'Send Reset Link'}
                  </button>
                  {authMsg && <p style={{ color: authMsg.includes('error') || authMsg.includes('Error') ? '#f44336' : '#ff9800', fontSize: 13, marginTop: 12, textAlign: 'center', maxWidth: 320, wordBreak: 'break-word' }}>{authMsg}</p>}
                  <p style={{ color: '#666', fontSize: 13, marginTop: 16, cursor: 'pointer' }} onClick={() => { setShowForgot(false); setAuthMsg(''); }}>
                    ← Back to Sign In
                  </p>
                </form>
              )}
            </>
          ) : (
            <>
              <h1 style={{ fontSize: 40, fontWeight: 800, margin: 0, marginBottom: 4, background: 'linear-gradient(135deg, #6c63ff, #2a6eff, #00d4ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>LiveMe</h1>
              <p style={{ color: '#888', fontSize: 14, marginBottom: 24 }}>{authMode === 'login' ? 'Welcome back' : 'Create an account'}</p>
              <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 360 }}>
                <input style={input} type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
                <input style={input} type="password" placeholder="Password (min 6 chars)" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
                <button type="submit" disabled={submitting} style={{...mobileBtn, opacity: submitting ? 0.5 : 1}}>{submitting ? 'Please wait...' : authMode === 'login' ? 'Sign In' : 'Sign Up'}</button>
              </form>
              {authMsg && <p style={{ color: authMsg.includes('error') || authMsg.includes('Error') ? '#f44336' : '#ff9800', fontSize: 13, marginTop: 12, textAlign: 'center', maxWidth: 320, wordBreak: 'break-word' }}>{authMsg}</p>}
              {authMode === 'login' && (
                <p style={{ color: '#6c63ff', fontSize: 13, marginTop: 12, cursor: 'pointer' }} onClick={() => { setShowForgot(true); setAuthMsg(''); }}>
                  Forgot password?
                </p>
              )}
              <p style={{ color: '#666', fontSize: 13, marginTop: 16, cursor: 'pointer' }} onClick={() => { setAuthMode(authMode === 'login' ? 'register' : 'login'); setAuthMsg(''); }}>
                {authMode === 'login' ? "Don't have an account? Sign Up" : 'Already have an account? Sign In'}
              </p>
            </>
          )}
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
            showForgot={showForgot}
            forgotSent={forgotSent}
            forgotEmail={forgotEmail}
            forgotCooldown={forgotCooldown}
            onForgotEmailChange={setForgotEmail}
            onForgotSubmit={handleForgotPassword}
            onShowForgot={() => { setShowForgot(true); setAuthMsg(''); }}
            onBackToSignIn={() => { setShowForgot(false); setForgotSent(false); setForgotEmail(''); setAuthMsg(''); }}
          />
          <Footer setPage={setPage} />
        </div>
      </>
    );
  }

  if (page === 'home') {
    return (
      <div className="page-content" style={{ background: '#0a0a0a', minHeight: '100vh' }}>
        <Navbar page={page} setPage={setPage} user={user} onLogout={handleLogout} />
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
              <div style={{ marginTop: 10, display: 'flex', gap: 10, justifyContent: 'center' }}>
                <p style={{ color: '#888', fontSize: 11, cursor: 'pointer' }} onClick={() => setCamError('')}>Dismiss</p>
                <p style={{ color: '#6c63ff', fontSize: 11, cursor: 'pointer', fontWeight: 600 }} onClick={findStranger}>Try Again</p>
              </div>
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
            <button onClick={() => setShowChat(!showChat)} style={{
              ...sBtn, width: 'auto', padding: '8px 16px', background: showChat ? '#6c63ff' : 'rgba(255,255,255,0.08)',
              boxShadow: 'none', fontSize: 12,
            }}>
              Chat
            </button>
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

      {showChat && state === 'connected' && (
        <div style={{ position: 'absolute', bottom: 90, right: 14, width: 280, maxHeight: 300, background: 'rgba(20,20,20,0.95)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', zIndex: 25, display: 'flex', flexDirection: 'column' }}>
          {partnerProfile && (
            <div style={{ padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 8 }}>
              {partnerProfile.avatar ? <img src={partnerProfile.avatar} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} /> :
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#6c63ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 600 }}>
                {(partnerProfile.name || 'A')[0].toUpperCase()}
              </div>}
              <div>
                <p style={{ color: '#fff', fontSize: 12, fontWeight: 600, margin: 0 }}>{partnerProfile.name}</p>
                <p style={{ color: '#888', fontSize: 10, margin: 0 }}>{partnerProfile.bio}</p>
              </div>
            </div>
          )}
          <div style={{ padding: '4px 12px', background: 'rgba(255,152,0,0.1)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <p style={{ color: '#ff9800', fontSize: 10, margin: 0, textAlign: 'center' }}>Messages disappear after 5 seconds</p>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 4, minHeight: 80 }}>
            {chatMessages.map((m, i) => (
              <div key={i} style={{ alignSelf: m.me ? 'flex-end' : 'flex-start', background: m.me ? '#6c63ff' : 'rgba(255,255,255,0.08)', padding: '6px 10px', borderRadius: 12, maxWidth: '80%', fontSize: 12, color: '#fff', wordBreak: 'break-word', animation: 'fadeIn 0.2s' }}>
                {m.text}
              </div>
            ))}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); sendChat(); }} style={{ display: 'flex', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <input value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Type a message..." maxLength={200} style={{ flex: 1, background: 'transparent', border: 'none', padding: '8px 10px', color: '#fff', fontSize: 12, outline: 'none' }} />
            <button type="submit" style={{ background: 'transparent', border: 'none', color: '#6c63ff', padding: '8px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>Send</button>
          </form>
        </div>
      )}

      <p style={{ position: 'absolute', bottom: 3, left: 6, color: '#555', fontSize: 10, margin: 0, zIndex: 20, fontFamily: 'system-ui, sans-serif' }}>ID: {id}</p>
    </div>
  );
}

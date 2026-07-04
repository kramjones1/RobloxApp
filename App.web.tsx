import React, { useEffect, useRef, useState } from 'react';
import { supabase } from './supabaseClient';

const WS_URL = 'wss://omegle-signaling-server-251a.onbelmo.uk';

export default function WebApp() {
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMsg, setAuthMsg] = useState('');

  const [state, setState] = useState('idle');
  const [id, setId] = useState('');
  const [log, setLog] = useState('Initializing...');
  const [wsStatus, setWsStatus] = useState('connecting');
  const localRef = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<any>(null);
  const lsRef = useRef<any>(null);
  const wsRef = useRef<WebSocket>();

  function addLog(msg: string) { console.log(msg); setLog(msg); }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    connect();
    return () => { wsRef.current?.close(); lsRef.current?.getTracks().forEach((t: any) => t.stop()); };
  }, [user]);

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    setAuthMsg('');
    if (password.length < 6) { setAuthMsg('Password must be at least 6 characters'); return; }
    const fn = authMode === 'login' ? supabase.auth.signInWithPassword : supabase.auth.signUp;
    const { error } = await fn({ email, password });
    if (error) setAuthMsg(error.message);
    else if (authMode === 'register') setAuthMsg('Check your email for confirmation link!');
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    wsRef.current?.close();
    cleanup();
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
        case 'matched': startCall(ws, msg.role); break;
        case 'partner_left': cleanup(); addLog('Partner left'); break;
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
        { urls: 'stun:stun2.l.google.com:19302' },
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
    if (stream) stream.getTracks().forEach((t: any) => pc.addTrack(t, stream));
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
    try {
      addLog('Requesting camera...');
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 } },
          audio: { echoCancellation: true, noiseSuppression: true },
        });
      } catch {
        addLog('Audio unavailable, trying video only...');
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
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
      addLog('Sent find, waiting for partner...');
    } catch (e: any) {
      addLog('Error: ' + e.message);
    }
  }

  function cleanup() {
    lsRef.current?.getTracks().forEach((t: any) => t.stop());
    lsRef.current = null; pcRef.current?.close(); pcRef.current = null;
    setState('idle');
  }

  function skip() { cleanup(); wsRef.current?.send(JSON.stringify({ type: 'next' })); }

  const wsColor = wsStatus === 'connected' ? '#4caf50' : wsStatus === 'connecting' ? '#ff9800' : '#f44336';
  const sBtn: React.CSSProperties = {
    background: '#2a6eff', color: '#fff', border: 'none',
    padding: '14px 40px', borderRadius: 8, fontSize: 16, cursor: 'pointer',
    fontFamily: 'system-ui, sans-serif', width: '100%', maxWidth: 320,
  };
  const input: React.CSSProperties = {
    background: '#1a1a1a', color: '#fff', border: '1px solid #333',
    padding: '12px 16px', borderRadius: 8, fontSize: 16, width: '100%', maxWidth: 320,
    outline: 'none', fontFamily: 'system-ui, sans-serif', boxSizing: 'border-box',
  };

  if (authLoading) {
    return (
      <div style={{ width: '100vw', height: '100vh', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#888', fontFamily: 'system-ui, sans-serif' }}>Loading...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ width: '100vw', height: '100vh', background: '#0a0a0a', fontFamily: 'system-ui, sans-serif', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <h1 style={{ color: '#fff', fontSize: 32, margin: 0, marginBottom: 8 }}>Talk</h1>
        <p style={{ color: '#888', marginBottom: 28 }}>{authMode === 'login' ? 'Welcome back' : 'Create an account'}</p>
        <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, width: '100%', maxWidth: 360, padding: '0 20px' }}>
          <input style={input} type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
          <input style={input} type="password" placeholder="Password (min 6 chars)" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
          <button type="submit" style={sBtn}>{authMode === 'login' ? 'Sign In' : 'Sign Up'}</button>
        </form>
        {authMsg && <p style={{ color: '#ff9800', fontSize: 14, marginTop: 16, textAlign: 'center', maxWidth: 320 }}>{authMsg}</p>}
        <p style={{ color: '#666', fontSize: 14, marginTop: 20, cursor: 'pointer' }} onClick={() => { setAuthMode(authMode === 'login' ? 'register' : 'login'); setAuthMsg(''); }}>
          {authMode === 'login' ? "Don't have an account? Sign Up" : 'Already have an account? Sign In'}
        </p>
      </div>
    );
  }

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#0a0a0a', fontFamily: 'system-ui, sans-serif', display: 'flex', flexDirection: 'column' }}>
      <video ref={remoteRef} autoPlay playsInline style={{ position: 'absolute', width: '100%', height: '100%', objectFit: 'cover', background: '#111' }} />
      <video ref={localRef} autoPlay playsInline muted style={{ position: 'absolute', top: 40, right: 10, width: 120, height: 160, borderRadius: 8, zIndex: 10, border: '2px solid #333', objectFit: 'cover', background: '#111' }} />

      <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 30, background: wsColor, color: '#fff', padding: '4px 12px', borderRadius: 4, fontSize: 12 }}>
        {wsStatus}
      </div>

      <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 30, display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ color: '#888', fontSize: 12 }}>{user.email}</span>
        <button onClick={handleLogout} style={{ background: 'none', border: '1px solid #555', color: '#aaa', borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}>Logout</button>
      </div>

      {state === 'idle' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 20 }}>
          <h1 style={{ color: '#fff', fontSize: 36, margin: 0 }}>Talk</h1>
          <p style={{ color: '#888', marginBottom: 20 }}>Random video chat</p>
          <button onClick={findStranger} style={sBtn}>Start Chatting</button>
          <p style={{ color: '#aaa', fontSize: 14, marginTop: 20, textAlign: 'center', maxWidth: '80%' }}>{log}</p>
        </div>
      )}

      {state === 'searching' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 20 }}>
          <p style={{ color: '#aaa', fontSize: 18 }}>{log}</p>
          <button onClick={() => { wsRef.current?.send(JSON.stringify({ type: 'leave' })); cleanup(); }} style={{ ...sBtn, marginTop: 20, background: '#666' }}>Cancel</button>
        </div>
      )}

      {state === 'connected' && (
        <div style={{ position: 'absolute', bottom: 60, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 20 }}>
          <p style={{ color: '#aaa', fontSize: 14 }}>{log}</p>
          <button onClick={skip} style={{ ...sBtn, background: '#d32f2f', marginTop: 10 }}>Next →</button>
        </div>
      )}

      <p style={{ position: 'absolute', bottom: 0, left: 0, right: 0, color: '#555', fontSize: 11, textAlign: 'center', padding: 8, margin: 0, zIndex: 20 }}>ID: {id}</p>
    </div>
  );
}

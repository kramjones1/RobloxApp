import React, { useEffect, useRef, useState } from 'react';

const WS_URL = 'wss://omegle-signaling-server-251a.onbelmo.uk';

export default function WebApp() {
  const [state, setState] = useState('idle');
  const [id, setId] = useState('');
  const [log, setLog] = useState('Initializing...');
  const localRef = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<any>(null);
  const lsRef = useRef<any>(null);
  const wsRef = useRef<WebSocket>();

  function addLog(msg: string) { console.log(msg); setLog(msg); }

  useEffect(() => {
    addLog('Connecting...');
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    ws.onopen = () => addLog('Connected');
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      switch (msg.type) {
        case 'connected': setId(msg.id); break;
        case 'matched': startCall(ws, msg.role); break;
        case 'partner_left': cleanup(); addLog('Partner left'); break;
        case 'sdp': handleSDP(ws, msg); break;
        case 'ice': handleICE(msg); break;
      }
    };
    ws.onerror = () => addLog('Connection error');
    return () => { ws.close(); lsRef.current?.getTracks().forEach((t: any) => t.stop()); };
  }, []);

  async function startCall(ws: WebSocket, role?: string) {
    addLog('Starting call...');
    setState('connecting');
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    pcRef.current = pc;
    pc.onicecandidate = (e) => { if (e.candidate) ws.send(JSON.stringify({ type: 'ice', candidate: e.candidate })); };
    pc.ontrack = (e) => {
      if (e.streams?.[0] && remoteRef.current) remoteRef.current.srcObject = e.streams[0];
    };
    const stream = lsRef.current;
    if (stream) stream.getTracks().forEach((t: any) => pc.addTrack(t, stream));
    if (role === 'offer') {
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
    if (!pc) return;
    await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
    if (msg.sdp.type === 'offer') {
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      ws.send(JSON.stringify({ type: 'sdp', sdp: pc.localDescription }));
    }
  }

  async function handleICE(msg: any) {
    try { await pcRef.current?.addIceCandidate(new RTCIceCandidate(msg.candidate)); } catch (_) {}
  }

  async function findStranger() {
    try {
      addLog('Requesting camera...');
      const constraints = {
        video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 } },
        audio: { echoCancellation: true, noiseSuppression: true },
      };
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch {
        addLog('Audio unavailable, trying video only...');
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      }
      addLog('Camera OK');
      lsRef.current = stream;
      if (localRef.current) localRef.current.srcObject = stream;
      setState('searching');
      wsRef.current?.send(JSON.stringify({ type: 'find' }));
    } catch (e: any) {
      addLog('Error: ' + e.message + '. Check camera permissions.');
    }
  }

  function cleanup() {
    lsRef.current?.getTracks().forEach((t: any) => t.stop());
    lsRef.current = null; pcRef.current?.close(); pcRef.current = null;
    setState('idle');
  }

  function skip() { cleanup(); wsRef.current?.send(JSON.stringify({ type: 'next' })); }

  const sBtn: React.CSSProperties = {
    background: '#2a6eff', color: '#fff', border: 'none',
    padding: '14px 40px', borderRadius: 8, fontSize: 16, cursor: 'pointer',
    fontFamily: 'system-ui, sans-serif',
  };

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#0a0a0a', fontFamily: 'system-ui, sans-serif', display: 'flex', flexDirection: 'column' }}>
      <video ref={remoteRef} autoPlay playsInline style={{ position: 'absolute', width: '100%', height: '100%', objectFit: 'cover', background: '#111' }} />
      <video ref={localRef} autoPlay playsInline muted style={{ position: 'absolute', top: 40, right: 10, width: 120, height: 160, borderRadius: 8, zIndex: 10, border: '2px solid #333', objectFit: 'cover', background: '#111' }} />

      {state === 'idle' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 20 }}>
          <h1 style={{ color: '#fff', fontSize: 36, margin: 0 }}>Talk</h1>
          <p style={{ color: '#888', marginBottom: 20 }}>Random video chat</p>
          <button onClick={findStranger} style={sBtn}>Start Chatting</button>
          <p style={{ color: '#aaa', fontSize: 14, marginTop: 20, textAlign: 'center' }}>{log}</p>
        </div>
      )}

      {state === 'searching' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 20 }}>
          <p style={{ color: '#aaa', fontSize: 18 }}>{log}</p>
          <button onClick={() => { wsRef.current?.send(JSON.stringify({ type: 'leave' })); setState('idle'); }} style={{ ...sBtn, marginTop: 20 }}>Cancel</button>
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

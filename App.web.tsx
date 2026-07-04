import React, { useEffect, useRef, useState } from 'react';

const WS_URL = 'wss://omegle-signaling-server-251a.onbelmo.uk';

export default function WebApp() {
  const [state, setState] = useState('idle');
  const [id, setId] = useState('');
  const [statusText, setStatusText] = useState('');
  const localRef = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<any>(null);
  const lsRef = useRef<any>(null);
  const wsRef = useRef<WebSocket>();
  const wsOk = useRef(false);

  useEffect(() => {
    setStatusText('Connecting...');
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WS connected');
      wsOk.current = true;
      setStatusText('');
    };

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      console.log('WS msg:', msg.type);
      switch (msg.type) {
        case 'connected': setId(msg.id); setStatusText('Ready'); break;
        case 'matched': startCall(ws, msg.room); break;
        case 'partner_left': cleanup(); setStatusText('Partner left'); break;
        case 'sdp': handleSDP(ws, msg); break;
        case 'ice': handleICE(msg); break;
      }
    };

    ws.onerror = () => {
      console.log('WS error');
      setStatusText('Connection failed');
    };

    ws.onclose = () => {
      console.log('WS closed');
      if (wsOk.current) setStatusText('Disconnected');
    };

    return () => { ws.close(); lsRef.current?.getTracks().forEach((t: any) => t.stop()); };
  }, []);

  async function startCall(ws: WebSocket, _room: string) {
    console.log('Starting call...');
    setState('connecting');
    setStatusText('Connecting...');
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    pcRef.current = pc;

    pc.onicecandidate = (e) => {
      if (e.candidate) ws.send(JSON.stringify({ type: 'ice', candidate: e.candidate }));
    };
    pc.ontrack = (e) => {
      console.log('Remote track received');
      if (e.streams?.[0] && remoteRef.current) {
        remoteRef.current.srcObject = e.streams[0];
        setStatusText('Connected');
      }
    };
    pc.oniceconnectionstatechange = () => {
      console.log('ICE state:', pc.iceConnectionState);
    };

    const stream = lsRef.current;
    if (stream) stream.getTracks().forEach((t: any) => pc.addTrack(t, stream));

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    ws.send(JSON.stringify({ type: 'sdp', sdp: pc.localDescription }));
    setState('connected');
    setStatusText('Waiting for answer...');
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
      console.log('Requesting camera...');
      setStatusText('Requesting camera...');
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      console.log('Camera OK');
      lsRef.current = stream;
      if (localRef.current) localRef.current.srcObject = stream;
      setState('searching');
      setStatusText('Looking for someone...');
      wsRef.current?.send(JSON.stringify({ type: 'find' }));
    } catch (e: any) {
      console.log('Camera error:', e);
      setStatusText('Camera access denied');
    }
  }

  function cleanup() {
    lsRef.current?.getTracks().forEach((t: any) => t.stop());
    lsRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    setState('idle');
  }

  function skip() {
    cleanup();
    wsRef.current?.send(JSON.stringify({ type: 'next' }));
  }

  const s = {
    btn: { backgroundColor: '#2a6eff', color: '#fff', border: 'none', padding: '14px 40px', borderRadius: 8, fontSize: 16, cursor: 'pointer', fontFamily: 'system-ui, sans-serif' } as React.CSSProperties,
  };

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', backgroundColor: '#0a0a0a', overflow: 'hidden', fontFamily: 'system-ui, sans-serif' }}>
      <video ref={remoteRef} autoPlay playsInline style={{ position: 'absolute', width: '100%', height: '100%', objectFit: 'cover', backgroundColor: '#111' }} />
      <video ref={localRef} autoPlay playsInline muted style={{ position: 'absolute', top: 40, right: 10, width: 120, height: 160, borderRadius: 8, zIndex: 10, border: '2px solid #333', objectFit: 'cover', backgroundColor: '#111' }} />

      {state === 'idle' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 20 }}>
          <h1 style={{ color: '#fff', fontSize: 36, margin: 0 }}>Talk</h1>
          <p style={{ color: '#888', marginBottom: 40 }}>Random video chat</p>
          <button onClick={findStranger} style={s.btn}>Start Chatting</button>
          {statusText && <p style={{ color: '#aaa', fontSize: 14, marginTop: 20 }}>{statusText}</p>}
        </div>
      )}

      {state === 'searching' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 20 }}>
          <p style={{ color: '#aaa', fontSize: 18 }}>{statusText}</p>
          <button onClick={() => { wsRef.current?.send(JSON.stringify({ type: 'leave' })); setState('idle'); setStatusText(''); }} style={{ ...s.btn, marginTop: 20 }}>Cancel</button>
        </div>
      )}

      {state === 'connected' && (
        <div style={{ position: 'absolute', bottom: 60, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 20, gap: 10 }}>
          {statusText && <p style={{ color: '#aaa', fontSize: 14 }}>{statusText}</p>}
          <button onClick={skip} style={{ ...s.btn, backgroundColor: '#d32f2f' }}>Next →</button>
        </div>
      )}

      <p style={{ position: 'absolute', bottom: 0, left: 0, right: 0, color: '#555', fontSize: 11, textAlign: 'center', padding: 8, margin: 0, zIndex: 20 }}>ID: {id}</p>
    </div>
  );
}

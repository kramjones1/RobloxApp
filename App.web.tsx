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
    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;
      ws.onopen = () => addLog('Connected to server');
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        addLog('Signal: ' + msg.type);
        switch (msg.type) {
          case 'connected': setId(msg.id); break;
          case 'matched': startCall(ws); break;
          case 'partner_left': cleanup(); addLog('Partner left'); break;
          case 'sdp': handleSDP(ws, msg); break;
          case 'ice': handleICE(msg); break;
        }
      };
      ws.onerror = () => addLog('Connection error');
      ws.onclose = () => addLog('Disconnected');
    } catch (e: any) {
      addLog('Failed: ' + e.message);
    }
    return () => { wsRef.current?.close(); lsRef.current?.getTracks().forEach((t: any) => t.stop()); };
  }, []);

  async function startCall(ws: WebSocket) {
    addLog('Starting call...');
    setState('connecting');
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    pcRef.current = pc;
    pc.onicecandidate = (e) => { if (e.candidate) ws.send(JSON.stringify({ type: 'ice', candidate: e.candidate })); };
    pc.ontrack = (e) => {
      addLog('Remote video received');
      if (e.streams?.[0] && remoteRef.current) remoteRef.current.srcObject = e.streams[0];
    };
    const stream = lsRef.current;
    if (stream) stream.getTracks().forEach((t: any) => pc.addTrack(t, stream));
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    ws.send(JSON.stringify({ type: 'sdp', sdp: pc.localDescription }));
    setState('connected');
    addLog('Waiting for partner...');
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
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      addLog('Camera OK');
      lsRef.current = stream;
      if (localRef.current) localRef.current.srcObject = stream;
      setState('searching');
      wsRef.current?.send(JSON.stringify({ type: 'find' }));
      addLog('Searching for partner...');
    } catch (e: any) {
      addLog('Camera error: ' + e.message);
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
  };

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#0a0a0a', fontFamily: 'system-ui, sans-serif', display: 'flex', flexDirection: 'column' }}>
      <video ref={remoteRef} autoPlay playsInline style={{ position: 'absolute', width: '100%', height: '100%', objectFit: 'cover', background: '#111' }} />
      <video ref={localRef} autoPlay playsInline muted style={{ position: 'absolute', top: 40, right: 10, width: 120, height: 160, borderRadius: 8, zIndex: 10, border: '2px solid #333', objectFit: 'cover', background: '#111' }} />

      {state === 'idle' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 20 }}>
          <h1 style={{ color: '#fff', fontSize: 36, margin: 0 }}>Talk</h1>
          <p style={{ color: '#888', marginBottom: 20 }}>Random video chat</p>
          <button id="startBtn" onClick={findStranger} style={sBtn}>Start Chatting</button>
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

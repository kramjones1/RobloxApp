import React, { useEffect, useRef, useState } from 'react';

const WS_URL = 'wss://16f292242c7ce9.lhr.life';
const iceServers = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

let ws: WebSocket;
let pc: RTCPeerConnection;
let localStream: MediaStream;

type State = 'idle' | 'searching' | 'connecting' | 'connected';

export default function App() {
  const [state, setState] = useState<State>('idle');
  const [id, setId] = useState('');
  const localVideo = useRef<HTMLVideoElement>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    ws = new WebSocket(WS_URL);
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      switch (msg.type) {
        case 'connected': setId(msg.id); break;
        case 'matched': startCall(msg.room); break;
        case 'partner_left': hangup(); break;
        case 'sdp': handleSDP(msg); break;
        case 'ice': handleICE(msg); break;
      }
    };
    return () => ws?.close();
  }, []);

  async function startCall(room: string) {
    setState('connecting');
    pc = new RTCPeerConnection(iceServers);
    pc.onicecandidate = (e) => e.candidate && ws.send(JSON.stringify({ type: 'ice', candidate: e.candidate }));
    pc.ontrack = (e) => { if (remoteVideo.current) remoteVideo.current.srcObject = e.streams[0]; };
    localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    ws.send(JSON.stringify({ type: 'sdp', sdp: pc.localDescription }));
    setState('connected');
  }

  async function handleSDP(msg: any) {
    await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
    if (msg.sdp.type === 'offer') {
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      ws.send(JSON.stringify({ type: 'sdp', sdp: pc.localDescription }));
    }
  }

  async function handleICE(msg: any) {
    await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
  }

  async function findStranger() {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (localVideo.current) localVideo.current.srcObject = localStream;
      setState('searching');
      ws.send(JSON.stringify({ type: 'find' }));
    } catch (e) {
      alert('Camera access required');
    }
  }

  function hangup() {
    localStream?.getTracks().forEach((t) => t.stop());
    pc?.close();
    setState('idle');
    setId('');
  }

  function skip() {
    hangup();
    ws.send(JSON.stringify({ type: 'next' }));
  }

  return (
    <div style={styles.container}>
      {remoteVideo && (
        <video ref={remoteVideo} autoPlay playsInline style={styles.remoteVideo} />
      )}
      <video ref={localVideo} autoPlay playsInline muted style={styles.localVideo} />
      
      <div style={styles.overlay}>
        {state === 'idle' && (
          <div style={styles.center}>
            <h1 style={{ color: '#fff', fontSize: 36, margin: 0 }}>Talk</h1>
            <p style={{ color: '#888', marginBottom: 40 }}>Random video chat</p>
            <button onClick={findStranger} style={styles.btn}>Start Chatting</button>
          </div>
        )}
        {state === 'searching' && (
          <div style={styles.center}>
            <p style={{ color: '#aaa', fontSize: 18 }}>Looking for someone...</p>
            <button onClick={() => { ws.send(JSON.stringify({ type: 'leave' })); setState('idle'); }} style={{ ...styles.btn, marginTop: 20 }}>Cancel</button>
          </div>
        )}
        {state === 'connected' && (
          <div style={styles.controls}>
            <button onClick={skip} style={{ ...styles.btn, backgroundColor: '#d32f2f' }}>Next →</button>
          </div>
        )}
        <p style={styles.idText}>ID: {id}</p>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { position: 'relative', width: '100vw', height: '100vh', backgroundColor: '#0a0a0a', overflow: 'hidden' },
  remoteVideo: { position: 'absolute', width: '100%', height: '100%', objectFit: 'cover', backgroundColor: '#111' },
  localVideo: { position: 'absolute', top: 40, right: 10, width: 120, height: 160, borderRadius: 8, objectFit: 'cover', zIndex: 10, border: '2px solid #333' },
  overlay: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', zIndex: 20 },
  center: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1 },
  btn: { backgroundColor: '#2a6eff', color: '#fff', border: 'none', padding: '14px 40px', borderRadius: 8, fontSize: 16, cursor: 'pointer' },
  controls: { display: 'flex', justifyContent: 'center', paddingBottom: 60 },
  idText: { color: '#555', fontSize: 11, textAlign: 'center', padding: 8, margin: 0 },
};

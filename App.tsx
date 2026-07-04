import React, { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View, TouchableOpacity } from 'react-native';

const WS_URL = 'wss://omegle-signaling-server-251a.onbelmo.uk';
const isWeb = Platform.OS === 'web';

let _rtc: any = null;
function getRTC() {
  if (!_rtc) {
    try {
      _rtc = isWeb ? (globalThis as any) : require('react-native-webrtc');
    } catch (e) {
      console.warn('WebRTC init failed:', e);
      _rtc = {};
    }
  }
  return _rtc;
}

let ws: WebSocket;
let pc: any;
let localStream: any = null;

type State = 'idle' | 'searching' | 'connecting' | 'connected';

export default function App() {
  const [state, setState] = useState<State>('idle');
  const [id, setId] = useState('');
  const [remoteURL, setRemoteURL] = useState('');
  const [error, setError] = useState('');
  const localRef = useRef<any>(null);
  const remoteRef = useRef<any>(null);

  useEffect(() => {
    try {
      ws = new WebSocket(WS_URL);
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          switch (msg.type) {
            case 'connected': setId(msg.id); break;
            case 'matched': startCall(); break;
            case 'partner_left': cleanup(); break;
            case 'sdp': handleSDP(msg); break;
            case 'ice': handleICE(msg); break;
          }
        } catch (_) {}
      };
      ws.onerror = () => setError('Connection failed');
    } catch (e: any) {
      setError(e.message);
    }
    return () => {
      ws?.close();
      localStream?.getTracks().forEach((t: any) => t.stop());
    };
  }, []);

  async function startCall() {
    try {
      setState('connecting');
      const rtc = getRTC();
      pc = new rtc.RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      pc.onicecandidate = (e: any) => {
        if (e.candidate) ws.send(JSON.stringify({ type: 'ice', candidate: e.candidate }));
      };
      pc.ontrack = (e: any) => {
        if (e.streams?.[0]) {
          if (isWeb && remoteRef.current) (remoteRef.current as HTMLVideoElement).srcObject = e.streams[0];
          else setRemoteURL(e.streams[0].toURL());
        }
      };
      localStream?.getTracks().forEach((t: any) => pc.addTrack(t, localStream));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      ws.send(JSON.stringify({ type: 'sdp', sdp: pc.localDescription }));
      setState('connected');
    } catch (e: any) {
      setError('Call failed: ' + e.message);
    }
  }

  async function handleSDP(msg: any) {
    const rtc = getRTC();
    await pc.setRemoteDescription(new rtc.RTCSessionDescription(msg.sdp));
    if (msg.sdp.type === 'offer') {
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      ws.send(JSON.stringify({ type: 'sdp', sdp: pc.localDescription }));
    }
  }

  async function handleICE(msg: any) {
    try {
      const rtc = getRTC();
      await pc.addIceCandidate(new rtc.RTCIceCandidate(msg.candidate));
    } catch (_) {}
  }

  async function findStranger() {
    try {
      setError('');
      const rtc = getRTC();
      if (!rtc.mediaDevices) { setError('WebRTC not available'); return; }
      localStream = await rtc.mediaDevices.getUserMedia({ video: true, audio: true });
      if (isWeb && localRef.current) (localRef.current as HTMLVideoElement).srcObject = localStream;
      setState('searching');
      ws.send(JSON.stringify({ type: 'find' }));
    } catch (e: any) {
      setError('Camera access required');
    }
  }

  function cleanup() {
    localStream?.getTracks().forEach((t: any) => t.stop());
    localStream = null; pc?.close(); pc = null;
    setRemoteURL(''); setState('idle');
  }

  function skip() { cleanup(); ws.send(JSON.stringify({ type: 'next' })); }

  const Btn = ({ label, onPress, style }: any) => (
    <TouchableOpacity onPress={onPress} style={[s.btn, style]}>
      <Text style={s.btnText}>{label}</Text>
    </TouchableOpacity>
  );

  const rtc = getRTC();

  return (
    <View style={s.container}>
      {isWeb ? (
        <video ref={remoteRef} autoPlay playsInline style={s.remoteWeb as any} />
      ) : remoteURL ? (
        <rtc.RTCView streamURL={remoteURL} style={s.remoteNative} objectFit="cover" />
      ) : null}

      {isWeb ? (
        <video ref={localRef} autoPlay playsInline muted style={s.localWeb as any} />
      ) : localStream ? (
        <rtc.RTCView streamURL={localStream.toURL()} style={s.localNative} objectFit="cover" zOrder={1} />
      ) : null}

      {error ? (
        <View style={s.errorBar}>
          <Text style={s.errorText}>{error}</Text>
        </View>
      ) : null}

      <View style={s.overlay}>
        {state === 'idle' && (
          <View style={s.center}>
            <Text style={s.title}>Talk</Text>
            <Text style={s.subtitle}>Random video chat</Text>
            <Btn label="Start Chatting" onPress={findStranger} style={{ marginTop: 40 }} />
          </View>
        )}
        {state === 'searching' && (
          <View style={s.center}>
            <Text style={{ color: '#aaa', fontSize: 18 }}>Looking for someone...</Text>
            <Btn label="Cancel" onPress={() => { ws.send(JSON.stringify({ type: 'leave' })); setState('idle'); }} style={{ marginTop: 20 }} />
          </View>
        )}
        {state === 'connected' && (
          <View style={s.controls}>
            <Btn label="Next \u2192" onPress={skip} style={{ backgroundColor: '#d32f2f' }} />
          </View>
        )}
        <Text style={s.id}>ID: {id}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  overlay: { ...StyleSheet.absoluteFillObject as any, justifyContent: 'space-between' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { color: '#fff', fontSize: 36, fontWeight: 'bold' },
  subtitle: { color: '#888', fontSize: 16, marginTop: 4 },
  btn: { backgroundColor: '#2a6eff', paddingVertical: 14, paddingHorizontal: 40, borderRadius: 8 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  controls: { alignItems: 'center', paddingBottom: 60 },
  id: { color: '#555', fontSize: 11, textAlign: 'center', padding: 8 },
  errorBar: { backgroundColor: 'rgba(255,0,0,0.8)', padding: 10, zIndex: 100, position: 'absolute', top: 0, left: 0, right: 0 },
  errorText: { color: '#fff', textAlign: 'center', fontSize: 13 },
  remoteWeb: { position: 'absolute', width: '100%', height: '100%', objectFit: 'cover' as any, backgroundColor: '#111' },
  remoteNative: { position: 'absolute', width: '100%', height: '100%', backgroundColor: '#111' },
  localWeb: { position: 'absolute', top: 40, right: 10, width: 120, height: 160, borderRadius: 8, zIndex: 10, borderWidth: 2, borderColor: '#333' },
  localNative: { position: 'absolute', top: 40, right: 10, width: 120, height: 160, borderRadius: 8, zIndex: 10, borderWidth: 2, borderColor: '#333' },
});

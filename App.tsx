import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';

const WS_URL = 'wss://16f292242c7ce9.lhr.life';

let RTCPeerConnection: any;
let RTCSessionDescription: any;
let RTCIceCandidate: any;
let mediaDevices: any;
let RTCView: any;

if (Platform.OS === 'web') {
  RTCPeerConnection = (window as any).RTCPeerConnection;
  RTCSessionDescription = (window as any).RTCSessionDescription;
  RTCIceCandidate = (window as any).RTCIceCandidate;
  mediaDevices = navigator.mediaDevices;
} else {
  const wrtc = require('react-native-webrtc');
  RTCPeerConnection = wrtc.RTCPeerConnection;
  RTCSessionDescription = wrtc.RTCSessionDescription;
  RTCIceCandidate = wrtc.RTCIceCandidate;
  mediaDevices = wrtc.mediaDevices;
  RTCView = wrtc.RTCView;
}

const iceServers = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

export default function App() {
  const [status, setStatus] = useState('idle');
  const [myId, setMyId] = useState('');
  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<any>(null);
  const localStreamRef = useRef<any>(null);
  const [localSrc, setLocalSrc] = useState<any>(null);
  const [remoteSrc, setRemoteSrc] = useState<any>(null);

  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    ws.onopen = () => console.log('WS connected');
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      handleMessage(msg);
    };
    ws.onclose = () => console.log('WS closed');
    wsRef.current = ws;
    return () => ws.close();
  }, []);

  const handleMessage = useCallback(async (msg: any) => {
    switch (msg.type) {
      case 'connected':
        setMyId(msg.id);
        break;
      case 'matched':
        setStatus('connected');
        startCall();
        break;
      case 'partner_left':
        setStatus('idle');
        setRemoteSrc(null);
        cleanupPC();
        break;
      case 'sdp':
        if (pcRef.current) {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(msg.sdp));
          if (msg.sdp.type === 'offer') {
            const answer = await pcRef.current.createAnswer();
            await pcRef.current.setLocalDescription(answer);
            wsRef.current?.send(JSON.stringify({ type: 'sdp', sdp: pcRef.current.localDescription }));
          }
        }
        break;
      case 'ice':
        if (pcRef.current) {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(msg.candidate));
        }
        break;
    }
  }, []);

  async function startCall() {
    const pc = new RTCPeerConnection(iceServers);
    pcRef.current = pc;

    pc.onicecandidate = (e: any) => {
      if (e.candidate) {
        wsRef.current?.send(JSON.stringify({ type: 'ice', candidate: e.candidate }));
      }
    };

    pc.ontrack = (e: any) => {
      if (Platform.OS === 'web') {
        setRemoteSrc(e.streams[0]);
      } else {
        setRemoteSrc(e.streams[0].toURL());
      }
    };

    try {
      const stream = await mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      if (Platform.OS === 'web') {
        setLocalSrc(stream);
      } else {
        setLocalSrc(stream.toURL());
      }
      stream.getTracks().forEach((t: any) => pc.addTrack(t, stream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      wsRef.current?.send(JSON.stringify({ type: 'sdp', sdp: pc.localDescription }));
    } catch (err) {
      console.error('Media error:', err);
      setStatus('idle');
    }
  }

  function cleanupPC() {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
  }

  function findStranger() {
    setStatus('searching');
    wsRef.current?.send(JSON.stringify({ type: 'find' }));
  }

  function skip() {
    cleanupPC();
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t: any) => t.stop());
      localStreamRef.current = null;
    }
    setLocalSrc(null);
    setRemoteSrc(null);
    wsRef.current?.send(JSON.stringify({ type: 'next' }));
    setStatus('searching');
  }

  return (
    <View style={styles.container}>
      {Platform.OS !== 'web' && RTCView && localSrc && (
        <RTCView streamURL={localSrc} style={styles.localVideo} objectFit="cover" zOrder={1} />
      )}
      {Platform.OS === 'web' && localSrc && (
        <video autoPlay muted playsInline ref={(ref) => { if (ref) ref.srcObject = localSrc; }} style={{ ...styles.localVideo, position: 'absolute', top: 40, right: 10, width: 120, height: 160, borderRadius: 8, zIndex: 10 }} />
      )}

      {Platform.OS !== 'web' && RTCView && remoteSrc && (
        <RTCView streamURL={remoteSrc} style={styles.remoteVideo} objectFit="cover" zOrder={0} />
      )}
      {Platform.OS === 'web' && remoteSrc && (
        <video autoPlay playsInline ref={(ref) => { if (ref) ref.srcObject = remoteSrc; }} style={styles.remoteVideo} />
      )}

      <View style={styles.overlay}>
        {status === 'idle' && (
          <View style={styles.center}>
            <Text style={styles.title}>Omegle</Text>
            <Text style={styles.subtitle}>Random video chat</Text>
            <TouchableOpacity style={styles.btn} onPress={findStranger}>
              <Text style={styles.btnText}>Start Chatting</Text>
            </TouchableOpacity>
          </View>
        )}
        {status === 'searching' && (
          <View style={styles.center}>
            <Text style={styles.waiting}>Looking for someone...</Text>
            <TouchableOpacity style={styles.btnSmall} onPress={() => { cleanupPC(); setStatus('idle'); }}>
              <Text style={styles.btnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}
        {status === 'connected' && (
          <View style={styles.controls}>
            <Text style={styles.connectedText}>Connected</Text>
            <TouchableOpacity style={styles.btnSmall} onPress={skip}>
              <Text style={styles.btnText}>Next</Text>
            </TouchableOpacity>
          </View>
        )}
        <Text style={styles.idText}>ID: {myId}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  remoteVideo: { flex: 1, backgroundColor: '#111' },
  localVideo: { width: 120, height: 160, borderRadius: 8, overflow: 'hidden' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'space-between' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 36, fontWeight: '700', color: '#fff', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#888', marginBottom: 40 },
  btn: { backgroundColor: '#2a6eff', paddingHorizontal: 40, paddingVertical: 14, borderRadius: 8 },
  btnSmall: { backgroundColor: '#2a6eff', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 6, marginTop: 16 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  waiting: { fontSize: 18, color: '#aaa', marginBottom: 20 },
  connectedText: { color: '#4caf50', fontSize: 14, textAlign: 'center', marginBottom: 8 },
  controls: { alignItems: 'center', paddingBottom: 60 },
  idText: { color: '#555', fontSize: 11, textAlign: 'center', padding: 8 },
});

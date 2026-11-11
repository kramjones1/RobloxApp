import React, { useEffect, useRef, useState } from 'react';
import { getConversations, getMessages, sendMessage, markMessagesRead, getUserProfile, hideConversation, ChatMessage } from '../supabaseClient';
import { watchConversationPresence, createChatCallSignaling, ChatCallSignal, ChatCallSignaling } from '../chatPresence';

const btn = {
  background: 'linear-gradient(135deg, #6c63ff, #2a6eff)', color: '#fff', border: 'none',
  padding: '10px 20px', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer',
  fontFamily: 'inherit',
};
const inp = {
  background: '#2a2a2a', color: '#fff', border: '1px solid rgba(255,255,255,0.08)',
  padding: '11px 14px', borderRadius: 10, fontSize: 15, width: '100%',
  outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const,
};

export default function MessagesPage({ onNav, user, messagePartner, onViewProfile, onChatOpened }: { onNav: (p: any) => void; user: any; messagePartner?: string; onViewProfile?: (userId: string) => void; onChatOpened?: () => void }) {
  const [conversations, setConversations] = useState<{ partnerId: string; lastMessage: ChatMessage; unread: number }[]>([]);
  const [selectedId, setSelectedId] = useState(messagePartner || '');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [partnerInfo, setPartnerInfo] = useState<Record<string, { name: string; avatar: string }>>({});
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const myId = user?.id;
  const [presencePartnerIds, setPresencePartnerIds] = useState<string[]>([]);
  const presencePartnerKey = presencePartnerIds.slice().sort().join('|');
  const [onlinePartners, setOnlinePartners] = useState<Set<string>>(new Set());
  type CallSession = { callId: string; partnerId: string; media: 'audio' | 'video'; direction: 'incoming' | 'outgoing'; status: 'incoming' | 'outgoing' | 'connecting' | 'active' };
  const [callSession, setCallSession] = useState<CallSession | null>(null);
  const [callError, setCallError] = useState('');
  const [callSignalingReady, setCallSignalingReady] = useState(false);
  const [callMuted, setCallMuted] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [localCallStream, setLocalCallStream] = useState<MediaStream | null>(null);
  const [remoteCallStream, setRemoteCallStream] = useState<MediaStream | null>(null);
  const callSessionRef = useRef<CallSession | null>(null);
  const callSignalingRef = useRef<ChatCallSignaling | null>(null);
  const callPcRef = useRef<RTCPeerConnection | null>(null);
  const pendingCallCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const callLocalStreamRef = useRef<MediaStream | null>(null);
  const callTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callStartedAtRef = useRef<number | null>(null);
  const CALL_LOG_PREFIX = '[livme-call]';
  const localCallVideoRef = useRef<HTMLVideoElement>(null);
  const remoteCallVideoRef = useRef<HTMLVideoElement>(null);
  const remoteCallAudioRef = useRef<HTMLAudioElement>(null);

  function updateCallSession(next: CallSession | null) {
    callSessionRef.current = next;
    setCallSession(next);
  }

  function endLocalCall() {
    const finishedSession = callSessionRef.current;
    const startedAt = callStartedAtRef.current;
    callStartedAtRef.current = null;
    if (finishedSession?.direction === 'outgoing' && startedAt) {
      const durationSeconds = Math.max(1, Math.floor((Date.now() - startedAt) / 1000));
      const callLog = `${CALL_LOG_PREFIX}|${finishedSession.media}|${durationSeconds}|completed`;
      void sendMessage(finishedSession.partnerId, callLog).then(result => {
        if (!result.error) {
          if (selectedId === finishedSession.partnerId) {
            getMessages(finishedSession.partnerId).then(({ messages: latest }) => { if (latest) setMessages(latest); });
          }
          loadConvs();
        }
      });
    }
    if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
    callTimeoutRef.current = null;
    callPcRef.current?.close();
    callPcRef.current = null;
    pendingCallCandidatesRef.current = [];
    callLocalStreamRef.current?.getTracks().forEach(track => track.stop());
    callLocalStreamRef.current = null;
    setLocalCallStream(null);
    setRemoteCallStream(null);
    setCallMuted(false);
    setCameraEnabled(true);
    updateCallSession(null);
  }

  async function sendCallSignal(partnerId: string, callId: string, action: ChatCallSignal['action'], extra: Partial<ChatCallSignal> = {}) {
    if (!myId || !callSignalingRef.current) return { error: 'Call connection is not ready yet. Please try again.' };
    return callSignalingRef.current.send(partnerId, { from: myId, to: partnerId, callId, action, ...extra });
  }

  async function startCallMedia(session: CallSession, initiator: boolean): Promise<boolean> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: session.media === 'video',
      });
      if (callSessionRef.current?.callId !== session.callId) {
        stream.getTracks().forEach(track => track.stop());
        return false;
      }
      callLocalStreamRef.current = stream;
      setLocalCallStream(stream);
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayprojectsecret' },
          { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayprojectsecret' },
          { urls: 'turn:openrelay.metered.ca:80?transport=tcp', username: 'openrelayproject', credential: 'openrelayprojectsecret' },
        ],
      });
      callPcRef.current = pc;
      stream.getTracks().forEach(track => pc.addTrack(track, stream));
      pc.ontrack = event => {
        const incoming = event.streams?.[0] || new MediaStream([event.track]);
        setRemoteCallStream(incoming);
      };
      pc.onicecandidate = event => {
        if (event.candidate && callSessionRef.current?.callId === session.callId) {
          void sendCallSignal(session.partnerId, session.callId, 'candidate', { candidate: event.candidate.toJSON() });
        }
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected' && callSessionRef.current?.callId === session.callId) {
          if (session.direction === 'outgoing' && callStartedAtRef.current === null) callStartedAtRef.current = Date.now();
          updateCallSession({ ...session, status: 'active' });
        } else if (pc.connectionState === 'failed' && callSessionRef.current?.callId === session.callId) {
          setCallError('The call connection failed. Please try again.');
          endLocalCall();
        }
      };
      if (initiator) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        const sent = await sendCallSignal(session.partnerId, session.callId, 'offer', { description: pc.localDescription?.toJSON() });
        if (sent.error) throw new Error(sent.error);
      }
      return true;
    } catch (error: any) {
      setCallError(error?.name === 'NotAllowedError'
        ? 'Please allow microphone' + (session.media === 'video' ? ' and camera' : '') + ' access to make a call.'
        : error?.message || 'Unable to start the call.');
      endLocalCall();
      return false;
    }
  }

  async function handleCallSignal(signal: ChatCallSignal) {
    const current = callSessionRef.current;
    if (signal.action === 'invite') {
      if (current) {
        void sendCallSignal(signal.from, signal.callId, 'busy');
        return;
      }
      const incoming: CallSession = { callId: signal.callId, partnerId: signal.from, media: signal.media || 'audio', direction: 'incoming', status: 'incoming' };
      setCallError('');
      updateCallSession(incoming);
      setSelectedId(signal.from);
      return;
    }
    if (!current || current.callId !== signal.callId || current.partnerId !== signal.from) return;
    if (signal.action === 'accept' && current.direction === 'outgoing') {
      if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
      callTimeoutRef.current = null;
      updateCallSession({ ...current, status: 'connecting' });
      try {
        const pc = callPcRef.current;
        if (!pc || !callLocalStreamRef.current) throw new Error('Your microphone/camera is not ready. End the call and try again.');
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        const sent = await sendCallSignal(current.partnerId, current.callId, 'offer', { description: pc.localDescription?.toJSON() });
        if (sent.error) throw new Error(sent.error);
      } catch (error: any) {
        setCallError(error?.message || 'Could not start the call offer.');
        endLocalCall();
      }
    } else if (signal.action === 'decline' || signal.action === 'busy') {
      setCallError(signal.action === 'busy' ? 'This user is already on another call.' : 'The call was declined.');
      endLocalCall();
    } else if (signal.action === 'cancel' || signal.action === 'hangup') {
      setCallError(signal.action === 'cancel' ? 'The caller cancelled the invitation.' : 'The other user ended the call.');
      endLocalCall();
    } else if (signal.action === 'offer' && signal.description && callPcRef.current) {
      try {
        await callPcRef.current.setRemoteDescription(new RTCSessionDescription(signal.description));
        for (const candidate of pendingCallCandidatesRef.current.splice(0)) {
          try { await callPcRef.current.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
        }
        const answer = await callPcRef.current.createAnswer();
        await callPcRef.current.setLocalDescription(answer);
        const sent = await sendCallSignal(current.partnerId, current.callId, 'answer', { description: callPcRef.current.localDescription?.toJSON() });
        if (sent.error) throw new Error(sent.error);
      } catch (error: any) {
        setCallError(error?.message || 'Could not answer the call.');
        endLocalCall();
      }
    } else if (signal.action === 'answer' && signal.description && callPcRef.current) {
      try {
        await callPcRef.current.setRemoteDescription(new RTCSessionDescription(signal.description));
        for (const candidate of pendingCallCandidatesRef.current.splice(0)) {
          try { await callPcRef.current.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
        }
      } catch (error: any) { setCallError(error?.message || 'Could not connect the call.'); endLocalCall(); }
    } else if (signal.action === 'candidate' && signal.candidate && callPcRef.current) {
      if (!callPcRef.current.remoteDescription) pendingCallCandidatesRef.current.push(signal.candidate);
      else { try { await callPcRef.current.addIceCandidate(new RTCIceCandidate(signal.candidate)); } catch {} }
    }
  }

  async function beginCall(media: 'audio' | 'video') {
    if (!selectedId || !myId || callSessionRef.current) return;
    if (!onlinePartners.has(selectedId)) {
      setCallError('This user is offline. Calls are available when they are online.');
      return;
    }
    if (!callSignalingRef.current) {
      setCallError('Call connection is still starting. Please try again in a moment.');
      return;
    }
    const callId = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const session: CallSession = { callId, partnerId: selectedId, media, direction: 'outgoing', status: 'outgoing' };
    setCallError('');
    updateCallSession(session);
    // Request the caller's microphone/camera directly from the button gesture,
    // before inviting the other participant. This makes the browser permission
    // prompt appear for the caller too, not only for the receiver.
    const mediaReady = await startCallMedia({ ...session, status: 'outgoing' }, false);
    if (!mediaReady) return;
    const result = await sendCallSignal(selectedId, callId, 'invite', { media });
    if (result.error) {
      setCallError(result.error);
      endLocalCall();
      return;
    }
    callTimeoutRef.current = setTimeout(() => {
      if (callSessionRef.current?.callId === callId && callSessionRef.current.status === 'outgoing') {
        setCallError('No answer. The call invitation expired.');
        void sendCallSignal(selectedId, callId, 'cancel');
        endLocalCall();
      }
    }, 30000);
  }

  async function acceptIncomingCall() {
    const session = callSessionRef.current;
    if (!session || session.direction !== 'incoming') return;
    updateCallSession({ ...session, status: 'connecting' });
    const ready = await startCallMedia({ ...session, status: 'connecting' }, false);
    if (!ready) return;
    const result = await sendCallSignal(session.partnerId, session.callId, 'accept');
    if (result.error) {
      setCallError(result.error);
      endLocalCall();
    }
  }

  function declineIncomingCall() {
    const session = callSessionRef.current;
    if (session) void sendCallSignal(session.partnerId, session.callId, 'decline');
    endLocalCall();
  }

  function hangUpCall() {
    const session = callSessionRef.current;
    if (session) void sendCallSignal(session.partnerId, session.callId, session.direction === 'outgoing' ? 'cancel' : 'hangup');
    endLocalCall();
  }

  function toggleCallMute() {
    const next = !callMuted;
    callLocalStreamRef.current?.getAudioTracks().forEach(track => { track.enabled = !next; });
    setCallMuted(next);
  }

  function toggleCallCamera() {
    const next = !cameraEnabled;
    callLocalStreamRef.current?.getVideoTracks().forEach(track => { track.enabled = next; });
    setCameraEnabled(next);
  }

  function renderCallPanel() {
    if (!callSession) return null;
    const caller = partnerInfo[callSession.partnerId];
    const callerName = caller?.name || 'User';
    const isIncoming = callSession.status === 'incoming';
    const isVideo = callSession.media === 'video';
    const isMobileCall = typeof window !== 'undefined' && window.innerWidth < 700;
    const statusText = callSession.status === 'outgoing'
      ? 'Calling…'
      : callSession.status === 'connecting'
        ? 'Connecting…'
        : callSession.status === 'active'
          ? (isVideo ? 'Video call' : 'Audio call')
          : (isVideo ? 'Incoming video call' : 'Incoming audio call');
    const callButton = (label: string, onClick: () => void, background: string, ariaLabel: string) => (
      <button type="button" aria-label={ariaLabel} onClick={onClick} style={{
        minWidth: isMobileCall ? 58 : 76, height: 54, padding: '0 15px',
        border: '1px solid rgba(255,255,255,0.12)', borderRadius: 18,
        color: '#fff', background, fontSize: 12, fontWeight: 600,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', gap: 3, cursor: 'pointer',
        boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
      }}>{label}</button>
    );
    return (
      <div role="dialog" aria-label={statusText} style={{
        position: 'fixed', inset: 0, zIndex: 1000, background: '#080808',
        color: '#fff', fontFamily: 'system-ui, sans-serif', overflow: 'hidden',
      }}>
        {isIncoming ? (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', padding: 24,
            background: 'radial-gradient(circle at center, #292642 0%, #11111b 55%, #050505 100%)',
            textAlign: 'center',
          }}>
            <div style={{ width: 104, height: 104, borderRadius: '50%', overflow: 'hidden',
              background: '#6c63ff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 20, border: '3px solid rgba(255,255,255,0.18)' }}>
              {caller?.avatar ? <img src={caller.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ fontSize: 38, fontWeight: 700 }}>{callerName.charAt(0).toUpperCase()}</span>}
            </div>
            <div style={{ color: '#aaa', fontSize: 13, marginBottom: 8 }}>{isVideo ? 'Incoming video call' : 'Incoming audio call'}</div>
            <div style={{ fontSize: 25, fontWeight: 700, marginBottom: 10 }}>{callerName}</div>
            <div style={{ color: '#999', fontSize: 13, marginBottom: 42 }}>LivMe private call</div>
            <div style={{ display: 'flex', gap: 28, alignItems: 'center' }}>
              {callButton('Decline', declineIncomingCall, '#d93645', 'Decline call')}
              {callButton('Accept', () => void acceptIncomingCall(), '#20a464', 'Accept call')}
            </div>
          </div>
        ) : (
          <>
            {isVideo ? (
              <div style={{ position: 'absolute', inset: 0, background: '#080808' }}>
                <video ref={remoteCallVideoRef} autoPlay playsInline style={{
                  position: 'absolute', inset: 0, width: '100%', height: '100%',
                  objectFit: 'cover', display: remoteCallStream ? 'block' : 'none',
                }} />
                {!remoteCallStream && (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(circle, #25243b, #080808 70%)' }}>
                    <div style={{ width: 96, height: 96, borderRadius: '50%', overflow: 'hidden', background: '#6c63ff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                      {caller?.avatar ? <img src={caller.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <span style={{ fontSize: 36, fontWeight: 700 }}>{callerName.charAt(0).toUpperCase()}</span>}
                    </div>
                    <div style={{ fontSize: 19, fontWeight: 600 }}>{callerName}</div>
                    <div style={{ color: '#aaa', fontSize: 13, marginTop: 8 }}>{statusText}</div>
                  </div>
                )}
                <video ref={localCallVideoRef} autoPlay muted playsInline style={{
                  position: 'absolute', top: 'calc(82px + env(safe-area-inset-top, 0px))',
                  right: 14, width: isMobileCall ? 96 : 140, height: isMobileCall ? 132 : 184,
                  objectFit: 'cover', borderRadius: 14, background: '#222',
                  border: '2px solid rgba(255,255,255,0.22)', boxShadow: '0 6px 22px rgba(0,0,0,0.35)',
                }} />
              </div>
            ) : (
              <>
                <audio ref={remoteCallAudioRef} autoPlay />
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  background: 'radial-gradient(circle at center, #292642 0%, #11111b 55%, #050505 100%)' }}>
                  <div style={{ width: 112, height: 112, borderRadius: '50%', overflow: 'hidden',
                    background: '#6c63ff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: 20, border: '3px solid rgba(255,255,255,0.18)' }}>
                    {caller?.avatar ? <img src={caller.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ fontSize: 42, fontWeight: 700 }}>{callerName.charAt(0).toUpperCase()}</span>}
                  </div>
                  <div style={{ fontSize: 23, fontWeight: 700 }}>{callerName}</div>
                  <div style={{ color: '#aaa', fontSize: 13, marginTop: 9 }}>{statusText}</div>
                  <div style={{ color: '#666', fontSize: 11, marginTop: 8 }}>LivMe audio call</div>
                </div>
              </>
            )}
            <div style={{ position: 'absolute', top: 'calc(18px + env(safe-area-inset-top, 0px))',
              left: 16, right: 16, minWidth: 0, color: '#fff', textShadow: '0 1px 5px #000',
              padding: '7px 11px', borderRadius: 12, background: 'rgba(0,0,0,0.38)', boxSizing: 'border-box' }}>
              <div style={{ fontSize: 16, fontWeight: 650, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{callerName}</div>
              <div style={{ fontSize: 13, lineHeight: '18px', color: '#fff', marginTop: 4, whiteSpace: 'nowrap', overflow: 'visible' }}>{statusText}</div>
            </div>
            <div style={{
              position: 'absolute', left: 0, right: 0, bottom: 0,
              padding: '26px 14px calc(24px + env(safe-area-inset-bottom, 0px))',
              display: 'flex', justifyContent: 'center', alignItems: 'center', gap: isMobileCall ? 10 : 16,
              background: 'linear-gradient(transparent, rgba(0,0,0,0.82))',
            }}>
              {callButton(callMuted ? 'Unmute' : 'Mute', toggleCallMute, callMuted ? '#b8323c' : '#353545', callMuted ? 'Unmute microphone' : 'Mute microphone')}
              {isVideo && callButton(cameraEnabled ? 'Camera off' : 'Camera on', toggleCallCamera, cameraEnabled ? '#353545' : '#b8323c', cameraEnabled ? 'Turn camera off' : 'Turn camera on')}
              {callButton('End call', hangUpCall, '#d93645', 'End call')}
            </div>
          </>
        )}
      </div>
    );
  }

  function renderCallActions() {
    const canCall = onlinePartners.has(selectedId) && callSignalingReady && !callSession;
    return (
      <div aria-label="Call actions" style={{ display: 'flex', gap: 8, width: '100%', boxSizing: 'border-box', padding: '8px 12px 0', background: '#1a1a1a' }}>
        <button type="button" aria-label="Start audio call" title={canCall ? 'Start audio call' : 'Calls are available when the user is online'} disabled={!canCall} onClick={() => void beginCall('audio')} style={{ ...btn, flex: 1, padding: '9px 12px', background: '#303047', opacity: canCall ? 1 : 0.45 }}>☎ Audio call</button>
        <button type="button" aria-label="Invite video call" title={canCall ? 'Start video call' : 'Calls are available when the user is online'} disabled={!canCall} onClick={() => void beginCall('video')} style={{ ...btn, flex: 1, padding: '9px 12px', background: '#303047', opacity: canCall ? 1 : 0.45 }}>▣ Video call</button>
      </div>
    );
  }

  function fetchProfile(uid: string) {
    if (partnerInfo[uid]) return;
    getUserProfile(uid).then(({ profile }) => {
      if (profile) setPartnerInfo(p => ({ ...p, [uid]: { name: profile.display_name || '', avatar: profile.avatar_url || '' } }));
    });
  }

  function loadConvs() {
    getConversations().then(({ conversations: c, presencePartnerIds: presenceIds }) => {
      if (c) { setConversations(c); c.forEach(conv => fetchProfile(conv.partnerId)); }
      if (presenceIds) { setPresencePartnerIds(presenceIds); presenceIds.forEach(fetchProfile); }
      setLoading(false);
    });
  }

  useEffect(() => {
    loadConvs();
    if (messagePartner) fetchProfile(messagePartner);
    const iv = setInterval(loadConvs, 3000);
    return () => clearInterval(iv);
  }, []);

  // Presence is shared only inside existing one-to-one conversations.
  // Each private channel is authorized by the chat-presence SQL policies.
  useEffect(() => () => {
    if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
    callPcRef.current?.close();
    callPcRef.current = null;
    callLocalStreamRef.current?.getTracks().forEach(track => track.stop());
    callLocalStreamRef.current = null;
    callSignalingRef.current?.close();
    callSignalingRef.current = null;
  }, []);

  useEffect(() => {
    if (!myId || !presencePartnerKey) {
      setOnlinePartners(new Set());
      return;
    }
    const partnerIds = presencePartnerKey.split('|').filter(Boolean);
    return watchConversationPresence(myId, partnerIds, setOnlinePartners);
  }, [myId, presencePartnerKey]);

  useEffect(() => {
    if (!myId) return;
    let active = true;
    const partners = Array.from(new Set(presencePartnerIds)).filter(Boolean);
    setCallSignalingReady(false);
    callSignalingRef.current?.close();
    callSignalingRef.current = null;
    createChatCallSignaling(myId, partners, handleCallSignal).then(controller => {
      if (!active) controller.close();
      else {
        callSignalingRef.current = controller;
        setCallSignalingReady(true);
        setCallError('');
      }
    }).catch(error => {
      if (active) {
        setCallSignalingReady(false);
        setCallError(error?.message || 'Call signaling could not connect. Keep Inbox open and retry.');
      }
    });
    return () => {
      active = false;
      setCallSignalingReady(false);
      callSignalingRef.current?.close();
      callSignalingRef.current = null;
    };
  }, [myId, presencePartnerKey]);

  useEffect(() => {
    if (localCallVideoRef.current && localCallStream) localCallVideoRef.current.srcObject = localCallStream;
    if (remoteCallVideoRef.current && remoteCallStream) remoteCallVideoRef.current.srcObject = remoteCallStream;
    if (remoteCallAudioRef.current && remoteCallStream) remoteCallAudioRef.current.srcObject = remoteCallStream;
  }, [localCallStream, remoteCallStream, callSession?.media, callSession?.status]);

  useEffect(() => {
    if (!selectedId) return;
    markMessagesRead(selectedId); onChatOpened?.();
    fetchProfile(selectedId);
    getMessages(selectedId).then(({ messages: msgs }) => { if (msgs) setMessages(msgs); });
    const iv = setInterval(() => {
      markMessagesRead(selectedId);
      getMessages(selectedId).then(({ messages: msgs }) => { if (msgs) setMessages(msgs); });
      onChatOpened?.();
    }, 2000);
    return () => clearInterval(iv);
  }, [selectedId]);

  useEffect(() => {
    // Scroll only the messages list. scrollIntoView() can scroll outer page
    // containers too, which makes the fixed composer appear to move with messages.
    const el = bottomRef.current?.parentElement;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const messageText = text.trim();
    if (!messageText || !selectedId) return;
    setSending(true);
    setError('');
    const result = await sendMessage(selectedId, messageText);
    if (result.error) {
      setSending(false);
      setError(result.error);
      return;
    }
    setText('');
    if (composerRef.current) composerRef.current.style.height = '42px';
    setSending(false);
    setError('');
    const { messages: msgs } = await getMessages(selectedId);
    if (msgs) setMessages(msgs);
    loadConvs();
  }

  function openChat(partnerId: string) {
    setSelectedId(partnerId);
    markMessagesRead(partnerId); onChatOpened?.();
  }

  async function deleteConversation(partnerId: string) {
    if (!window.confirm('Delete this conversation from your Inbox? The messages will remain visible to the other person.')) return;
    const result = await hideConversation(partnerId);
    if (result.error) {
      setError(result.error);
      return;
    }
    setConversations(current => current.filter(conv => conv.partnerId !== partnerId));
    if (selectedId === partnerId) {
      setSelectedId('');
      setMessages([]);
    }
  }

  function Avatar({ uid, size = 34, onClick }: { uid: string; size?: number; onClick?: () => void }) {
    const info = partnerInfo[uid];
    if (info?.avatar) {
      return <img src={info.avatar} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, cursor: onClick ? 'pointer' : undefined }} onClick={onClick} />;
    }
    return (
      <div style={{ width: size, height: size, borderRadius: '50%', background: '#6c63ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: size * 0.42, fontWeight: 600, flexShrink: 0, cursor: onClick ? 'pointer' : undefined }} onClick={onClick}>
        {(info?.name || 'U')[0].toUpperCase()}
      </div>
    );
  }

  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 700);

  useEffect(() => {
    const updateViewport = () => setIsMobile(window.innerWidth < 700);
    window.addEventListener('resize', updateViewport);
    window.addEventListener('orientationchange', updateViewport);
    return () => {
      window.removeEventListener('resize', updateViewport);
      window.removeEventListener('orientationchange', updateViewport);
    };
  }, []);

  const [keyboardViewport, setKeyboardViewport] = useState(() => ({
    height: typeof window !== 'undefined' ? window.visualViewport?.height || window.innerHeight : 0,
    top: typeof window !== 'undefined' ? window.visualViewport?.offsetTop || 0 : 0,
  }));

  // Lock the document behind the full-screen mobile chat. The message list
  // itself remains the only scrollable region while a conversation is open.
  useEffect(() => {
    if (!isMobile || !selectedId) return;
    const body = document.body;
    const html = document.documentElement;
    const previousBodyOverflow = body.style.overflow;
    const previousHtmlOverflow = html.style.overflow;
    body.style.overflow = 'hidden';
    html.style.overflow = 'hidden';
    return () => {
      body.style.overflow = previousBodyOverflow;
      html.style.overflow = previousHtmlOverflow;
    };
  }, [isMobile, selectedId]);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const syncKeyboardViewport = () => {
      setKeyboardViewport({ height: viewport.height, top: viewport.offsetTop });
    };
    viewport.addEventListener('resize', syncKeyboardViewport);
    viewport.addEventListener('scroll', syncKeyboardViewport);
    syncKeyboardViewport();
    return () => {
      viewport.removeEventListener('resize', syncKeyboardViewport);
      viewport.removeEventListener('scroll', syncKeyboardViewport);
    };
  }, []);

  if (loading) return <div style={{ background: '#161616', flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontFamily: 'system-ui, sans-serif' }}>Loading...</div>;

  function parseCallLog(content: string) {
    const match = content.match(/^\[livme-call\]\|(audio|video)\|(\d+)\|completed$/);
    return match ? { media: match[1] as 'audio' | 'video', seconds: Number(match[2]) } : null;
  }

  function formatCallDuration(totalSeconds: number) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return minutes > 0 ? `${minutes}:${String(seconds).padStart(2, '0')}` : `0:${String(seconds).padStart(2, '0')}`;
  }

  function renderCallLog(messageId: string, content: string) {
    const call = parseCallLog(content);
    if (!call) return null;
    return (
      <div key={messageId} style={{ alignSelf: 'center', maxWidth: '85%', margin: '9px 0', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 9, padding: '10px 14px', borderRadius: 14,
          background: '#20202a', border: '1px solid rgba(255,255,255,0.08)', color: '#ddd' }}>
          <span aria-hidden="true" style={{ width: 30, height: 30, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: '#303047', fontSize: 16 }}>{call.media === 'video' ? '▣' : '☎'}</span>
          <span style={{ textAlign: 'left', minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 13, fontWeight: 650, color: '#fff' }}>{call.media === 'video' ? 'Video call' : 'Audio call'}</span>
            <span style={{ display: 'block', fontSize: 11, color: '#aaa', marginTop: 2 }}>Call ended · {formatCallDuration(call.seconds)}</span>
          </span>
        </div>
      </div>
    );
  }

  function getMessagePreview(content: string) {
    const call = parseCallLog(content);
    return call ? `${call.media === 'video' ? 'Video' : 'Audio'} call · ${formatCallDuration(call.seconds)}` : content;
  }

  function renderMessages(withAvatars: boolean) {
    return messages.map((m, i) => {
      if (parseCallLog(m.content)) return renderCallLog(m.id, m.content);
      const isMe = m.sender_id === myId;
      const showAvatar = withAvatars && !isMe && (i === 0 || messages[i - 1]?.sender_id !== m.sender_id);
      const isFirstBySender = i === 0 || messages[i - 1]?.sender_id !== m.sender_id;
      return (
        <div key={m.id} style={{
          alignSelf: isMe ? 'flex-end' : 'flex-start', maxWidth: withAvatars && !isMe ? '85%' : '80%',
          display: 'flex', alignItems: 'flex-end', gap: 6, flexDirection: isMe ? 'row-reverse' : 'row',
        }}>
          {!isMe && withAvatars && (
            <div style={{ width: 28, flexShrink: 0, visibility: showAvatar ? 'visible' : 'hidden' }}>
              {showAvatar ? (
                <span style={{ position: 'relative', display: 'inline-flex' }}>
                  <Avatar uid={m.sender_id} size={28} />
                  {onlinePartners.has(m.sender_id) && <span aria-label="Online" title="Online" style={{ position: 'absolute', right: -1, bottom: -1, width: 9, height: 9, borderRadius: '50%', background: '#31d17c', border: '2px solid #161616' }} />}
                </span>
              ) : <div style={{ width: 28 }} />}
            </div>
          )}
          <div>
            <div style={{
              background: isMe ? '#6c63ff' : '#1f1f1f',
              padding: '8px 12px',
              borderRadius: isMe ? '14px 14px 4px 14px' : isFirstBySender ? '14px 14px 14px 4px' : '4px 14px 14px 4px',
              color: '#fff', fontSize: 14, wordBreak: 'break-word', whiteSpace: 'pre-wrap', lineHeight: 1.4,
            }}>
              {m.content}
            </div>
            <div style={{ fontSize: 10, color: '#555', marginTop: 2, textAlign: isMe ? 'right' : 'left' }}>
              {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        </div>
      );
    });
  }


  if (selectedId && isMobile) {
    return (
      <div style={{ background: '#161616', position: 'fixed', zIndex: 50, insetInline: 0, top: `${keyboardViewport.top}px`, width: '100%', height: keyboardViewport.height ? `${keyboardViewport.height}px` : '100dvh', maxHeight: keyboardViewport.height ? `${keyboardViewport.height}px` : '100dvh', overflow: 'hidden', overscrollBehavior: 'none', fontFamily: 'system-ui, sans-serif', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: '#1a1a1a' }}>
          <button onClick={() => setSelectedId('')} style={{ background: 'none', border: 'none', color: '#6c63ff', fontSize: 16, cursor: 'pointer', fontFamily: 'inherit', padding: '4px 0' }}>←</button>
          <span style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
            <Avatar uid={selectedId} size={34} onClick={() => onViewProfile?.(selectedId)} />
            {onlinePartners.has(selectedId) && <span aria-label="Online" title="Online" style={{ position: 'absolute', right: 0, bottom: 0, width: 10, height: 10, borderRadius: '50%', background: '#31d17c', border: '2px solid #1a1a1a', pointerEvents: 'none' }} />}
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span style={{ color: '#fff', fontSize: 15, fontWeight: 600 }}>{partnerInfo[selectedId]?.name || 'User'}</span>
            <span style={{ color: onlinePartners.has(selectedId) ? '#31d17c' : '#777', fontSize: 11 }}>{onlinePartners.has(selectedId) ? 'Online' : 'Offline'}</span>
          </div>
        </div>
        {callError && <div role="status" style={{ color: '#ff9b9b', background: '#251919', fontSize: 12, padding: '7px 14px' }}>{callError}</div>}
        {renderCallPanel()}
        <div style={{ flex: '1 1 0%', minHeight: 0, minWidth: 0, overflowY: 'auto', overflowX: 'hidden', overscrollBehaviorY: 'contain', WebkitOverflowScrolling: 'touch', touchAction: 'pan-y', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {renderMessages(true)}
          <div ref={bottomRef} />
        </div>
        {error && <p role="status" style={{ color: '#f44336', fontSize: 12, textAlign: 'left', padding: '4px 14px 0', margin: 0, background: '#1a1a1a' }}>{error}</p>}
        {renderCallActions()}
        <form onSubmit={handleSend} style={{ display: 'flex', alignItems: 'center', gap: 7, width: '100%', boxSizing: 'border-box', flexShrink: 0, padding: '8px 12px', paddingBottom: 'calc(8px + env(safe-area-inset-bottom, 0px))', background: '#1a1a1a' }}>
          <textarea ref={composerRef} aria-label="Message" rows={1} style={{ ...inp, flex: '1 1 0%', minWidth: 0, width: 'auto', height: 42, minHeight: 42, maxHeight: 120, resize: 'none', overflowY: 'auto', borderRadius: 22, padding: '10px 16px', fontSize: 16, lineHeight: '20px', background: '#2a2a2a', border: '1px solid rgba(255,255,255,0.08)' }} value={text} onKeyDown={e => {
            if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
              e.preventDefault();
              const target = e.currentTarget;
              const start = target.selectionStart;
              const end = target.selectionEnd;
              const next = text.slice(0, start) + '\n' + text.slice(end);
              setText(next);
              requestAnimationFrame(() => {
                target.setSelectionRange(start + 1, start + 1);
                target.style.height = '42px';
                target.style.height = Math.min(target.scrollHeight, 120) + 'px';
              });
            }
          }} onChange={e => { setText(e.target.value); e.target.style.height = '42px'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'; }} placeholder="Message" maxLength={500} />
          <button type="submit" aria-label="Send message" disabled={sending || !text.trim()} style={{ width: 42, height: 42, padding: 0, border: 'none', borderRadius: '50%', background: '#6c63ff', color: '#fff', fontSize: 23, lineHeight: 1, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: sending || !text.trim() ? 0.45 : 1, flexShrink: 0 }}>{sending ? '…' : '↑'}</button>
        </form>
      </div>
    );
  }

  return (
    <div style={{ background: '#161616', flex: 1, minHeight: 0, fontFamily: 'system-ui, sans-serif', display: 'flex', flexDirection: 'column' }}>
      <div style={{ maxWidth: 900, margin: '0 auto', width: '100%', flex: 1, minHeight: 0, display: 'flex', flexDirection: isMobile ? 'column' : 'row' }}>
        {/* Conversation list */}
        <div style={{ flex: isMobile ? 1 : undefined, width: isMobile ? '100%' : 320, borderRight: isMobile ? 'none' : '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <h2 style={{ color: '#fff', fontSize: 20, fontWeight: 700, margin: 0 }}>Inbox</h2>
          </div>
          <div style={{ padding: '12px 16px 10px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ color: '#888', fontSize: 11, fontWeight: 700, letterSpacing: 0.7, marginBottom: 9 }}>ONLINE CHATS</div>
            {onlinePartners.size === 0 ? (
              <div style={{ color: '#666', fontSize: 12 }}>No one online right now</div>
            ) : (
              <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 3 }}>
                {presencePartnerIds.filter(partnerId => onlinePartners.has(partnerId)).map(partnerId => (
                  <button key={partnerId} type="button" onClick={() => openChat(partnerId)} title={partnerInfo[partnerId]?.name || 'Open chat'} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, minWidth: 54, padding: 0, border: 0, background: 'transparent', cursor: 'pointer', color: '#ccc', fontFamily: 'inherit' }}>
                    <span style={{ position: 'relative', display: 'inline-flex' }}>
                      <Avatar uid={partnerId} size={48} />
                      <span aria-label="Online" style={{ position: 'absolute', right: 0, bottom: 1, width: 11, height: 11, borderRadius: '50%', background: '#31d17c', border: '2px solid #161616' }} />
                    </span>
                    <span style={{ maxWidth: 62, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11 }}>{partnerInfo[partnerId]?.name || 'User'}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {conversations.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: '#666', fontSize: 13, lineHeight: 1.5 }}>
                No conversations yet.
                <br />Chat with someone from Recent Live on your profile.
              </div>
            ) : conversations.map(conv => (
              <button key={conv.partnerId} onClick={() => openChat(conv.partnerId)} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
                background: selectedId === conv.partnerId ? 'rgba(108,99,255,0.08)' : 'transparent',
                border: 'none', borderBottom: '1px solid rgba(255,255,255,0.04)',
                cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', width: '100%',
              }}>
                <div style={{ position: 'relative' }}>
                  <span onClick={(e) => { e.stopPropagation(); onViewProfile?.(conv.partnerId); }}><Avatar uid={conv.partnerId} size={44} /></span>
                  {onlinePartners.has(conv.partnerId) && <span aria-label="Online" title="Online" style={{ position: 'absolute', bottom: -1, right: -1, width: 11, height: 11, borderRadius: '50%', background: '#31d17c', border: '2px solid #161616' }} />}
                  {conv.unread > 0 && <span style={{ position: 'absolute', top: -2, right: -2, width: 10, height: 10, borderRadius: '50%', background: '#6c63ff', border: '2px solid #161616' }} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                    <span style={{ color: '#fff', fontSize: 14, fontWeight: conv.unread > 0 ? 700 : 500 }}>{partnerInfo[conv.partnerId]?.name || 'User'}</span>
                    <span style={{ color: '#666', fontSize: 11 }}>{new Date(conv.lastMessage.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <span style={{ color: conv.unread > 0 ? '#ccc' : '#888', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', fontWeight: conv.unread > 0 ? 600 : 400 }}>
                    {conv.lastMessage.sender_id === myId ? 'You: ' : ''}{getMessagePreview(conv.lastMessage.content)}
                  </span>
                </div>
                <span
                  role="button"
                  tabIndex={0}
                  aria-label="Delete conversation"
                  title="Delete conversation"
                  onClick={e => { e.stopPropagation(); void deleteConversation(conv.partnerId); }}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); void deleteConversation(conv.partnerId); } }}
                  style={{ color: '#888', fontSize: 17, padding: '8px 4px', cursor: 'pointer', flexShrink: 0 }}
                >🗑</span>
              </button>
            ))}
          </div>
        </div>

        {/* Chat panel (desktop or no selection on mobile) */}
        {selectedId && !isMobile && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: '#1a1a1a' }}>
              <span style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
                <Avatar uid={selectedId} size={34} onClick={() => onViewProfile?.(selectedId)} />
                {onlinePartners.has(selectedId) && <span aria-label="Online" title="Online" style={{ position: 'absolute', right: 0, bottom: 0, width: 10, height: 10, borderRadius: '50%', background: '#31d17c', border: '2px solid #1a1a1a', pointerEvents: 'none' }} />}
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span style={{ color: '#fff', fontSize: 15, fontWeight: 600 }}>{partnerInfo[selectedId]?.name || 'User'}</span>
                <span style={{ color: onlinePartners.has(selectedId) ? '#31d17c' : '#777', fontSize: 11 }}>{onlinePartners.has(selectedId) ? 'Online' : 'Offline'}</span>
              </div>
            </div>
            {callError && <div role="status" style={{ color: '#ff9b9b', background: '#251919', fontSize: 12, padding: '7px 16px' }}>{callError}</div>}
            {renderCallPanel()}
            <div style={{ flex: 1, overflowY: 'auto', padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {messages.map((m, i) => {
                if (parseCallLog(m.content)) return renderCallLog(m.id, m.content);
                const isMe = m.sender_id === myId;
                const showAvatar = !isMe && (i === 0 || messages[i - 1]?.sender_id !== m.sender_id);
                const isFirstBySender = i === 0 || messages[i - 1]?.sender_id !== m.sender_id;
                return (
                  <div key={m.id} style={{
                    alignSelf: isMe ? 'flex-end' : 'flex-start', maxWidth: '70%',
                    display: 'flex', alignItems: 'flex-end', gap: 6,
                    flexDirection: isMe ? 'row-reverse' : 'row',
                  }}>
                    {!isMe && (
                      <div style={{ width: 28, flexShrink: 0, visibility: showAvatar ? 'visible' : 'hidden' }}>
                        {showAvatar ? (
                <span style={{ position: 'relative', display: 'inline-flex' }}>
                  <Avatar uid={m.sender_id} size={28} />
                  {onlinePartners.has(m.sender_id) && <span aria-label="Online" title="Online" style={{ position: 'absolute', right: -1, bottom: -1, width: 9, height: 9, borderRadius: '50%', background: '#31d17c', border: '2px solid #161616' }} />}
                </span>
              ) : <div style={{ width: 28 }} />}
                      </div>
                    )}
                    <div>
                      <div style={{
                        background: isMe ? '#6c63ff' : '#1f1f1f',
                        padding: '8px 12px',
                        borderRadius: isMe ? '14px 14px 4px 14px' : isFirstBySender ? '14px 14px 14px 4px' : '4px 14px 14px 4px',
                        color: '#fff', fontSize: 14, wordBreak: 'break-word', whiteSpace: 'pre-wrap', lineHeight: 1.4,
                      }}>
                        {m.content}
                      </div>
                      <div style={{ fontSize: 10, color: '#555', marginTop: 2, textAlign: isMe ? 'right' : 'left' }}>
                        {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
            {error && <p role="status" style={{ color: '#f44336', fontSize: 12, textAlign: 'left', padding: '4px 16px 0', margin: 0, background: '#1a1a1a' }}>{error}</p>}
                {renderCallActions()}
                <form onSubmit={handleSend} style={{ display: 'flex', alignItems: 'center', gap: 7, width: '100%', boxSizing: 'border-box', flexShrink: 0, padding: '8px 12px', background: '#1a1a1a' }}>
              <textarea ref={composerRef} aria-label="Message" rows={1} style={{ ...inp, flex: '1 1 0%', minWidth: 0, width: 'auto', height: 42, minHeight: 42, maxHeight: 120, resize: 'none', overflowY: 'auto', borderRadius: 22, padding: '10px 16px', fontSize: 16, lineHeight: '20px', background: '#2a2a2a', border: '1px solid rgba(255,255,255,0.08)' }} value={text} onKeyDown={e => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            if (!e.shiftKey) {
              e.currentTarget.form?.requestSubmit();
              return;
            }
            const target = e.currentTarget;
            const start = target.selectionStart;
            const end = target.selectionEnd;
            const next = text.slice(0, start) + '\n' + text.slice(end);
            setText(next);
            requestAnimationFrame(() => {
              target.setSelectionRange(start + 1, start + 1);
              target.style.height = '42px';
              target.style.height = Math.min(target.scrollHeight, 120) + 'px';
            });
          }} onChange={e => { setText(e.target.value); e.target.style.height = '42px'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'; }} placeholder="Message" maxLength={500} />
              <button type="submit" aria-label="Send message" disabled={sending || !text.trim()} style={{ width: 42, height: 42, padding: 0, border: 'none', borderRadius: '50%', background: '#6c63ff', color: '#fff', fontSize: 23, lineHeight: 1, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: sending || !text.trim() ? 0.45 : 1, flexShrink: 0 }}>{sending ? '…' : '↑'}</button>
            </form>
          </div>
        )}

        {!selectedId && !isMobile && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666', fontSize: 14 }}>
            Select a conversation
          </div>
        )}
      </div>
    </div>
  );
}

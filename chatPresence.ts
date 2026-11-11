import { createClient, RealtimeChannel } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, getValidAccessToken } from './supabaseClient';

// Uses the existing signed-in user's JWT. No service-role key or new backend is needed.
const realtimeClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  accessToken: async () => (await getValidAccessToken()) || SUPABASE_ANON_KEY,
});

type PresencePayload = { user_id?: string; online_at?: string };

export function watchConversationPresence(
  userId: string,
  partnerIds: string[],
  onChange: (onlineIds: Set<string>) => void,
): () => void {
  let stopped = false;
  const channels: RealtimeChannel[] = [];
  const statusByPartner = new Map<string, boolean>();

  const publish = () => {
    if (stopped) return;
    onChange(new Set(
      Array.from(statusByPartner.entries())
        .filter(([, isOnline]) => isOnline)
        .map(([partnerId]) => partnerId),
    ));
  };

  const refreshPartnerStatus = (partnerId: string, channel: RealtimeChannel) => {
    const state = channel.presenceState() as Record<string, PresencePayload[]>;
    const isOnline = Object.values(state).some((entries) =>
      entries.some((entry) => entry.user_id === partnerId),
    );
    statusByPartner.set(partnerId, isOnline);
    publish();
  };

  const start = async () => {
    const token = await getValidAccessToken();
    if (!token || stopped) {
      publish();
      return;
    }

    await realtimeClient.realtime.setAuth(token);

    const uniquePartners = Array.from(new Set(partnerIds))
      .filter((partnerId) => partnerId && partnerId !== userId);

    for (const partnerId of uniquePartners) {
      if (stopped) break;
      const pair = [userId, partnerId].sort();
      const topic = `chat-presence:${pair[0]}:${pair[1]}`;
      statusByPartner.set(partnerId, false);

      const channel = realtimeClient.channel(topic, {
        config: { private: true, presence: { key: userId } },
      });

      channel
        .on('presence', { event: 'sync' }, () => refreshPartnerStatus(partnerId, channel))
        .on('presence', { event: 'join' }, () => refreshPartnerStatus(partnerId, channel))
        .on('presence', { event: 'leave' }, () => refreshPartnerStatus(partnerId, channel))
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            try {
              await channel.track({
                user_id: userId,
                online_at: new Date().toISOString(),
              });
              refreshPartnerStatus(partnerId, channel);
            } catch {
              statusByPartner.set(partnerId, false);
              publish();
            }
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            statusByPartner.set(partnerId, false);
            publish();
          }
        });

      channels.push(channel);
    }
  };

  void start().catch(() => publish());

  return () => {
    stopped = true;
    channels.forEach((channel) => {
      void realtimeClient.removeChannel(channel);
    });
  };
}


/**
 * Subscribe to the signed-in user's Recent Live history.
 * Postgres Changes are filtered by user_id and RLS still limits rows to the owner.
 */
export function watchRecentLive(
  userId: string,
  onChange: () => void,
): () => void {
  let stopped = false;
  let channel: RealtimeChannel | null = null;

  const start = async () => {
    const token = await getValidAccessToken();
    if (!token || stopped) return;
    await realtimeClient.realtime.setAuth(token);

    channel = realtimeClient
      .channel(`recent-live:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'recent_live',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          if (!stopped) onChange();
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED' && !stopped) onChange();
      });
  };

  void start().catch(() => {
    if (!stopped) onChange();
  });

  return () => {
    stopped = true;
    if (channel) void realtimeClient.removeChannel(channel);
  };
}


export type ChatCallSignal = {
  from: string;
  to: string;
  callId: string;
  action: 'invite' | 'accept' | 'decline' | 'busy' | 'cancel' | 'hangup' | 'offer' | 'answer' | 'candidate';
  media?: 'audio' | 'video';
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
};

export type ChatCallSignaling = {
  send: (partnerId: string, signal: ChatCallSignal) => Promise<{ error?: string }>;
  close: () => void;
};

/**
 * Private, conversation-scoped signaling for one-to-one audio/video calls.
 * The database policies restrict each channel to the two participants in an
 * existing conversation. No media is sent through Supabase; only WebRTC signals.
 */
export async function createChatCallSignaling(
  userId: string,
  partnerIds: string[],
  onSignal: (signal: ChatCallSignal) => void,
): Promise<ChatCallSignaling> {
  const token = await getValidAccessToken();
  if (!token) throw new Error('Your session has expired. Please sign in again.');
  await realtimeClient.realtime.setAuth(token);

  const channels = new Map<string, RealtimeChannel>();
  const uniquePartners = Array.from(new Set(partnerIds))
    .filter((id) => id && id !== userId);

  await Promise.all(uniquePartners.map((partnerId) => new Promise<void>((resolve) => {
    const pair = [userId, partnerId].sort();
    const channel = realtimeClient.channel(`chat-call:${pair[0]}:${pair[1]}`, {
      config: { private: true, broadcast: { self: false, ack: true } },
    });
    channels.set(partnerId, channel);
    let settled = false;
    const finish = () => {
      if (!settled) { settled = true; resolve(); }
    };
    channel
      .on('broadcast', { event: 'call-signal' }, ({ payload }) => {
        const signal = payload as ChatCallSignal;
        if (signal && signal.to === userId && signal.from === partnerId) onSignal(signal);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') finish();
      });
    setTimeout(finish, 6000);
  })));

  return {
    send: async (partnerId, signal) => {
      const channel = channels.get(partnerId);
      if (!channel) return { error: 'This conversation is not ready for calls. Reopen the chat and try again.' };
      try {
        const result = await channel.send({ type: 'broadcast', event: 'call-signal', payload: signal });
        if (result !== 'ok') return { error: 'Call signaling is unavailable. Please try again.' };
        return {};
      } catch (error: any) {
        return { error: error?.message || 'Could not send the call signal.' };
      }
    },
    close: () => {
      channels.forEach((channel) => { void realtimeClient.removeChannel(channel); });
      channels.clear();
    },
  };
}

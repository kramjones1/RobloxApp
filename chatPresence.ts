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

/**
 * Publishes this authenticated user's presence on their own user-scoped topic.
 * The database policy only permits auth.uid() to publish to that user's topic.
 * Each tab gets its own server-generated Presence key, so one tab leaving cannot
 * mark the account offline while another tab remains connected.
 */
export function startUserPresence(userId: string): () => void {
  let stopped = false;
  let channel: RealtimeChannel | null = null;

  const start = async () => {
    const token = await getValidAccessToken();
    if (!token || stopped) return;

    await realtimeClient.realtime.setAuth(token);
    if (stopped) return;

    channel = realtimeClient.channel(`user-presence:${userId}`, {
      config: { private: true },
    });

    channel.subscribe(async (status) => {
      if (stopped || status !== 'SUBSCRIBED') return;
      try {
        await channel?.track({ user_id: userId, online_at: new Date().toISOString() });
      } catch {
        if (channel) void realtimeClient.removeChannel(channel);
        channel = null;
      }
    });
  };

  void start().catch(() => {});

  return () => {
    stopped = true;
    if (channel) void realtimeClient.removeChannel(channel);
    channel = null;
  };
}

/**
 * Watches any set of user IDs through the same user-scoped presence topics.
 * This is not conversation- or friendship-scoped: any authenticated user can
 * read a user's online state, while only that user can publish to their topic.
 */
export function watchUserPresence(
  userIds: string[],
  onChange: (onlineIds: Set<string>) => void,
): () => void {
  let stopped = false;
  const channels: RealtimeChannel[] = [];
  const statusByUser = new Map<string, boolean>();

  const publish = () => {
    if (stopped) return;
    onChange(new Set(
      Array.from(statusByUser.entries())
        .filter(([, isOnline]) => isOnline)
        .map(([id]) => id),
    ));
  };

  const refreshUserStatus = (targetUserId: string, channel: RealtimeChannel) => {
    const state = channel.presenceState() as Record<string, unknown[]>;
    const isOnline = Object.values(state).some(
      (entries) => Array.isArray(entries) && entries.length > 0,
    );
    statusByUser.set(targetUserId, isOnline);
    publish();
  };

  const start = async () => {
    const token = await getValidAccessToken();
    if (!token || stopped) {
      publish();
      return;
    }

    await realtimeClient.realtime.setAuth(token);
    const uniqueUsers = Array.from(new Set(userIds)).filter(Boolean);

    for (const targetUserId of uniqueUsers) {
      if (stopped) break;
      statusByUser.set(targetUserId, false);

      const channel = realtimeClient.channel(`user-presence:${targetUserId}`, {
        config: { private: true },
      });

      channel
        .on('presence', { event: 'sync' }, () => refreshUserStatus(targetUserId, channel))
        .on('presence', { event: 'join' }, () => refreshUserStatus(targetUserId, channel))
        .on('presence', { event: 'leave' }, () => refreshUserStatus(targetUserId, channel))
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            refreshUserStatus(targetUserId, channel);
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            statusByUser.set(targetUserId, false);
            publish();
          }
        });

      channels.push(channel);
    }

    publish();
  };

  void start().catch(() => publish());

  return () => {
    stopped = true;
    channels.forEach((channel) => { void realtimeClient.removeChannel(channel); });
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

  try {
    await Promise.all(uniquePartners.map((partnerId) => new Promise<void>((resolve, reject) => {
      const pair = [userId, partnerId].sort();
      const channel = realtimeClient.channel(`chat-call:${pair[0]}:${pair[1]}`, {
        config: { private: true, broadcast: { self: false, ack: true } },
      });
      channels.set(partnerId, channel);
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error('Call channel timed out while connecting. Keep the chat open and try again.'));
      }, 12000);

      channel
        .on('broadcast', { event: 'call-signal' }, ({ payload }) => {
          const signal = payload as ChatCallSignal;
          if (signal && signal.to === userId && signal.from === partnerId) onSignal(signal);
        })
        .subscribe((status, error) => {
          if (settled) return;
          if (status === 'SUBSCRIBED') {
            settled = true;
            clearTimeout(timer);
            resolve();
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            settled = true;
            clearTimeout(timer);
            reject(new Error(error?.message || `Call channel subscription failed (${status}). Check Realtime authorization and try again.`));
          }
        });
    })));
  } catch (error) {
    channels.forEach((channel) => { void realtimeClient.removeChannel(channel); });
    channels.clear();
    throw error;
  }

  return {
    send: async (partnerId, signal) => {
      const channel = channels.get(partnerId);
      if (!channel) return { error: 'This conversation is not ready for calls. Reopen the chat and try again.' };
      try {
        const result = await channel.send({ type: 'broadcast', event: 'call-signal', payload: signal });
        if (result !== 'ok') return { error: `Call signal was rejected (${String(result)}). Check the private channel permissions.` };
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

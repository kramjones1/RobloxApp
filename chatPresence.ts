import { createClient, RealtimeChannel } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, getValidAccessToken, onAuthChange } from './supabaseClient';

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
 * Central Presence Directory.
 *
 * Components subscribe to user IDs through this shared manager. Each user still
 * owns a private, user-scoped topic (enforced by realtime.messages RLS), while
 * the manager deduplicates channels and fans updates out to every mounted UI.
 */
type PresenceDirectoryEntry = {
  channel: RealtimeChannel | null;
  online: boolean;
  starting: boolean;
  listeners: Set<() => void>;
};

const presenceDirectory = new Map<string, PresenceDirectoryEntry>();
const ownPresenceChannels = new Map<string, { channel: RealtimeChannel; refs: number }>();
let realtimeAuthSyncStarted = false;

function ensureRealtimeAuthSync() {
  if (realtimeAuthSyncStarted) return;
  realtimeAuthSyncStarted = true;
  onAuthChange((nextUser) => {
    if (!nextUser?.id) return;
    void getValidAccessToken()
      .then((token) => token ? realtimeClient.realtime.setAuth(token) : undefined)
      .catch(() => {});
  });
}

function notifyPresenceEntry(entry: PresenceDirectoryEntry) {
  entry.listeners.forEach((listener) => listener());
}

function updatePresenceEntry(entry: PresenceDirectoryEntry, channel: RealtimeChannel) {
  const state = channel.presenceState() as Record<string, unknown[]>;
  entry.online = Object.values(state).some(
    (presences) => Array.isArray(presences) && presences.length > 0,
  );
  notifyPresenceEntry(entry);
}

function startPresenceSubscription(userId: string, entry: PresenceDirectoryEntry) {
  if (entry.starting || entry.channel || entry.listeners.size === 0) return;
  entry.starting = true;

  void (async () => {
    try {
      const token = await getValidAccessToken();
      if (!token || entry.listeners.size === 0 || presenceDirectory.get(userId) !== entry) return;
      await realtimeClient.realtime.setAuth(token);
      if (entry.listeners.size === 0 || presenceDirectory.get(userId) !== entry) return;

      const channel = realtimeClient.channel(`user-presence:${userId}`, {
        config: { private: true },
      });
      entry.channel = channel;

      channel
        .on('presence', { event: 'sync' }, () => updatePresenceEntry(entry, channel))
        .on('presence', { event: 'join' }, () => updatePresenceEntry(entry, channel))
        .on('presence', { event: 'leave' }, () => updatePresenceEntry(entry, channel))
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            updatePresenceEntry(entry, channel);
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            entry.online = false;
            notifyPresenceEntry(entry);
          }
        });
    } catch {
      entry.online = false;
      notifyPresenceEntry(entry);
    } finally {
      entry.starting = false;
      if (entry.listeners.size > 0 && !entry.channel && presenceDirectory.get(userId) === entry) {
        // A transient auth/network failure can be retried by the next subscriber.
        entry.online = false;
        notifyPresenceEntry(entry);
      }
    }
  })();
}

/** Publish the signed-in user's presence. Multiple tabs get distinct server keys. */
export function startUserPresence(userId: string): () => void {
  if (!userId) return () => {};
  ensureRealtimeAuthSync();

  const existing = ownPresenceChannels.get(userId);
  if (existing) {
    existing.refs += 1;
    return () => {
      existing.refs -= 1;
      if (existing.refs <= 0) {
        ownPresenceChannels.delete(userId);
        void realtimeClient.removeChannel(existing.channel);
      }
    };
  }

  let stopped = false;
  let channel: RealtimeChannel | null = null;

  void (async () => {
    try {
      const token = await getValidAccessToken();
      if (!token || stopped) return;
      await realtimeClient.realtime.setAuth(token);
      if (stopped) return;

      const nextChannel = realtimeClient.channel(`user-presence:${userId}`, {
        config: { private: true },
      });
      channel = nextChannel;

      nextChannel.subscribe(async (status) => {
        if (stopped || status !== 'SUBSCRIBED') return;
        try {
          await nextChannel.track({ user_id: userId, online_at: new Date().toISOString() });
        } catch {
          if (ownPresenceChannels.get(userId)?.channel === nextChannel) {
            ownPresenceChannels.delete(userId);
          }
          void realtimeClient.removeChannel(nextChannel);
        }
      });

      if (!stopped) ownPresenceChannels.set(userId, { channel: nextChannel, refs: 1 });
      else void realtimeClient.removeChannel(nextChannel);
    } catch {
      // Presence is best-effort; app authentication and navigation must continue.
    }
  })();

  return () => {
    stopped = true;
    if (!channel) return;
    const registered = ownPresenceChannels.get(userId);
    if (registered?.channel === channel) {
      registered.refs -= 1;
      if (registered.refs > 0) return;
      ownPresenceChannels.delete(userId);
    }
    void realtimeClient.removeChannel(channel);
  };
}

/** Return the latest status known by the shared directory (false if not observed). */
export function getOnlineStatus(userId: string): boolean {
  return presenceDirectory.get(userId)?.online === true;
}

/**
 * Subscribe to any user IDs, regardless of conversation or friendship.
 * Repeated requests share one underlying Realtime channel per user ID.
 */
export function watchUserPresence(
  viewerId: string,
  userIds: string[],
  onChange: (onlineIds: Set<string>) => void,
): () => void {
  ensureRealtimeAuthSync();
  let stopped = false;
  const uniqueIds = Array.from(new Set(userIds)).filter((id) => Boolean(id) && id !== viewerId);
  const refresh = () => {
    if (stopped) return;
    onChange(new Set(uniqueIds.filter((id) => presenceDirectory.get(id)?.online === true)));
  };

  for (const userId of uniqueIds) {
    let entry = presenceDirectory.get(userId);
    if (!entry) {
      entry = { channel: null, online: false, starting: false, listeners: new Set() };
      presenceDirectory.set(userId, entry);
    }
    entry.listeners.add(refresh);
    startPresenceSubscription(userId, entry);
  }

  refresh();

  return () => {
    stopped = true;
    for (const userId of uniqueIds) {
      const entry = presenceDirectory.get(userId);
      if (!entry) continue;
      entry.listeners.delete(refresh);
      if (entry.listeners.size > 0) continue;
      if (entry.channel) void realtimeClient.removeChannel(entry.channel);
      presenceDirectory.delete(userId);
    }
  };
}

/** Alias for screens that treat presence as a directory rather than chat state. */
export const subscribePresenceDirectory = watchUserPresence;

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

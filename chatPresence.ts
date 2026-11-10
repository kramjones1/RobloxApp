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

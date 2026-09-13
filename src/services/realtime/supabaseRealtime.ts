// Must be imported before the Supabase client: its realtime transport
// constructs URLs, and Hermes ships without a complete URL implementation.
import 'react-native-url-polyfill/auto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CONFIG } from '../../config/supabaseConfig';

/**
 * A Supabase client used *only* for realtime subscriptions.
 *
 * Everything else in this app talks to Supabase over plain axios REST -
 * see services/firebase/supabaseClient.ts, which notes the SDK was
 * avoided for Hermes compatibility reasons. That still holds for
 * request/response work, where axios is proven here and the SDK buys
 * nothing. Realtime is the one thing REST genuinely cannot do: it needs a
 * websocket. So the SDK is introduced deliberately and narrowly, with
 * auth persistence turned off so it can't race the existing session
 * handling in AuthContext/sessionService for ownership of the session.
 */
let client: SupabaseClient | null = null;

export function getRealtimeClient(): SupabaseClient {
  if (!client) {
    client = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}

export interface DeliveryRequestSubscription {
  unsubscribe: () => void;
}

/**
 * Watch one delivery request row for changes, calling `onChange` with
 * the new row each time it updates.
 *
 * `accessToken` is passed to realtime because row-level security applies
 * to the replication stream too: without the caller's token the socket
 * connects as anon and the contractor's "read my own requests" policy
 * filters out every event, which looks exactly like a silently broken
 * subscription.
 *
 * Returns an unsubscribe handle. `onError` fires if the channel fails to
 * connect, which callers use to fall back to polling rather than leaving
 * a screen that quietly never updates.
 */
export function subscribeToDeliveryRequest(
  accessToken: string,
  requestId: string,
  onChange: (row: Record<string, any>) => void,
  onError?: () => void
): DeliveryRequestSubscription {
  const supabase = getRealtimeClient();
  supabase.realtime.setAuth(accessToken);

  const channel = supabase
    .channel(`delivery_request:${requestId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'delivery_requests',
        filter: `id=eq.${requestId}`,
      },
      (payload) => {
        if (payload.new) {
          onChange(payload.new as Record<string, any>);
        }
      }
    )
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('subscribeToDeliveryRequest: channel status', status);
        onError?.();
      }
    });

  return {
    unsubscribe: () => {
      supabase.removeChannel(channel);
    },
  };
}

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
 *
 * Verified 2026-09-13 on the iOS simulator with Hermes enabled: the
 * channel connects and updates arrive immediately, so the polling
 * fallback never engaged. The old Hermes caution doesn't apply to this
 * path with react-native-url-polyfill in place. That's evidence from one
 * platform, not a guarantee - Android is untested, so the fallback stays.
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

export interface RealtimeSubscription {
  unsubscribe: () => void;
}

export type DeliveryRequestSubscription = RealtimeSubscription;

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

/**
 * Watch the signed-in driver's documents, calling `onChange` whenever one
 * is submitted or reviewed. Callers refetch rather than patching state
 * from the payload: verification depends on all three documents and the
 * vehicle together, and the server's answer is the one that counts.
 *
 * Same token requirement as above - row-level security limits the stream
 * to the driver's own documents, and without their token it carries
 * nothing.
 */
export function subscribeToDriverDocuments(
  accessToken: string,
  driverAuthId: string,
  onChange: () => void
): RealtimeSubscription {
  const supabase = getRealtimeClient();
  supabase.realtime.setAuth(accessToken);

  const channel = supabase
    .channel(`driver_documents:${driverAuthId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'driver_documents',
        filter: `driver_auth_id=eq.${driverAuthId}`,
      },
      () => onChange()
    )
    .subscribe((status) => {
      // No polling fallback: both screens using this also refetch on
      // focus and pull-to-refresh, so a failed channel costs immediacy,
      // not correctness.
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('subscribeToDriverDocuments: channel status', status);
      }
    });

  return {
    unsubscribe: () => {
      supabase.removeChannel(channel);
    },
  };
}

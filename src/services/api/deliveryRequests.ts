import axios from 'axios';
import { SUPABASE_CONFIG } from '../../config/supabaseConfig';

const API_URL = SUPABASE_CONFIG.url;
const ANON_KEY = SUPABASE_CONFIG.anonKey;

if (!API_URL || !ANON_KEY) {
  console.error('Missing Supabase configuration for deliveryRequests:', { API_URL, ANON_KEY });
}

// Simple retry helper (small bounded retries)
async function retryWithBackoff<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      const status = error?.response?.status;
      if (status === 429 && i < maxRetries - 1) {
        const delay = Math.pow(2, i) * 500;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw new Error('Max retries exceeded');
}

export interface DeliveryRequest {
  id?: string;
  auth_id: string; // user auth id (supabase uuid)
  pickup_address: string;
  pickup_lat?: number;
  pickup_lng?: number;
  dropoff_address: string;
  dropoff_lat?: number;
  dropoff_lng?: number;
  material_category: string;
  material_weight: number;
  material_unit: string; // e.g., lbs, tons, cubic_yards
  requires_trailer: boolean;
  notes?: string;
  status?: 'pending' | 'assigned' | 'in_transit' | 'completed' | string;
  assigned_driver_id?: string | null;
  driver_lat?: number | null;
  driver_lng?: number | null;
  driver_location_updated_at?: string | null;
  driver_ack_cancelled_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

/**
 * Create a new delivery request in Supabase using the REST API.
 *
 * Important: you must provide a valid Supabase access token (JWT) obtained at sign-in.
 * The function sets Prefer: return=representation to return the created row.
 */
export async function createDeliveryRequest(
  accessToken: string,
  payload: Omit<DeliveryRequest, 'id' | 'created_at' | 'updated_at' | 'status'>
): Promise<DeliveryRequest | null> {
  try {
    console.log('createDeliveryRequest: Starting submission with payload:', payload);
    console.log('createDeliveryRequest: Access token present:', !!accessToken);
    
    const response = await retryWithBackoff(async () => {
      return await axios.post(
        `${API_URL}/rest/v1/delivery_requests`,
        {
          ...payload,
          status: 'pending',
          created_at: new Date().toISOString(),
        },
        {
          headers: {
            'Content-Type': 'application/json',
            apikey: ANON_KEY,
            Authorization: `Bearer ${accessToken}`,
            Prefer: 'return=representation',
          },
        }
      );
    });

    console.log('createDeliveryRequest: Success response:', response.status, response.data);
    
    // Supabase returns an array of inserted rows when using return=representation
    const created = (response.data && response.data[0]) || null;
    return created as DeliveryRequest | null;
  } catch (error: any) {
    console.error('createDeliveryRequest: Full error object:', error);
    console.error('createDeliveryRequest error details', {
      status: error?.response?.status,
      statusText: error?.response?.statusText,
      data: error?.response?.data,
      message: error?.message,
      url: error?.config?.url,
      headers: error?.config?.headers,
    });
    return null;
  }
}

/**
 * Accept a pending delivery request as the current (driver) user.
 *
 * Calls the `accept_delivery_request` Postgres RPC (see
 * sql/enable_driver_job_matching.sql), which atomically sets
 * assigned_driver_id/status only if the request is still 'pending'.
 * Returns the updated request, or null if it was already taken by
 * another driver (or the request doesn't exist) — this is a normal,
 * expected outcome, not an error.
 */
export async function acceptDeliveryRequest(
  accessToken: string,
  requestId: string
): Promise<DeliveryRequest | null> {
  try {
    const response = await retryWithBackoff(async () => {
      return await axios.post(
        `${API_URL}/rest/v1/rpc/accept_delivery_request`,
        { p_request_id: requestId },
        {
          headers: {
            'Content-Type': 'application/json',
            apikey: ANON_KEY,
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );
    });

    const accepted = Array.isArray(response.data) ? response.data[0] : response.data;
    return (accepted as DeliveryRequest) || null;
  } catch (error: any) {
    console.error('acceptDeliveryRequest error', {
      status: error?.response?.status,
      data: error?.response?.data,
      message: error?.message,
    });
    return null;
  }
}

/**
 * Fetch a single delivery request by id. Returns null if it doesn't exist
 * or the caller isn't allowed to see it (RLS filters silently rather than
 * erroring, same as the list endpoint).
 */
export async function getDeliveryRequestById(
  accessToken: string,
  requestId: string
): Promise<DeliveryRequest | null> {
  try {
    const response = await retryWithBackoff(async () => {
      return await axios.get(
        `${API_URL}/rest/v1/delivery_requests?select=*&id=eq.${requestId}`,
        {
          headers: {
            apikey: ANON_KEY,
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );
    });

    const rows = (response.data ?? []) as DeliveryRequest[];
    return rows[0] || null;
  } catch (error: any) {
    console.error('getDeliveryRequestById error', {
      status: error?.response?.status,
      data: error?.response?.data,
      message: error?.message,
    });
    return null;
  }
}

/**
 * Advance an assigned delivery request to its next status ('in_transit' or
 * 'completed'). Calls the `advance_delivery_status` Postgres RPC (see
 * sql/enable_driver_status_updates.sql), which only succeeds for the
 * driver the request is assigned to and only moves status forward one
 * step. Returns the updated request, or null if the transition wasn't
 * valid (e.g. someone else already advanced it) - the caller should
 * treat that as "state changed underneath you," not a hard error.
 */
export async function advanceDeliveryStatus(
  accessToken: string,
  requestId: string,
  nextStatus: 'in_transit' | 'completed'
): Promise<DeliveryRequest | null> {
  try {
    const response = await retryWithBackoff(async () => {
      return await axios.post(
        `${API_URL}/rest/v1/rpc/advance_delivery_status`,
        { p_request_id: requestId, p_next_status: nextStatus },
        {
          headers: {
            'Content-Type': 'application/json',
            apikey: ANON_KEY,
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );
    });

    const updated = Array.isArray(response.data) ? response.data[0] : response.data;
    return (updated as DeliveryRequest) || null;
  } catch (error: any) {
    console.error('advanceDeliveryStatus error', {
      status: error?.response?.status,
      data: error?.response?.data,
      message: error?.message,
    });
    return null;
  }
}

/**
 * Report the driver's current position for a job they're assigned to,
 * via the `report_driver_location` RPC (see
 * sql/20260913000000_add_driver_location_tracking.sql). The RPC ignores
 * the call unless the caller is the assigned driver and the job is still
 * in progress, so a stale timer firing after delivery is a no-op rather
 * than an error. Returns false when nothing was updated.
 */
export async function reportDriverLocation(
  accessToken: string,
  requestId: string,
  lat: number,
  lng: number
): Promise<boolean> {
  try {
    const response = await axios.post(
      `${API_URL}/rest/v1/rpc/report_driver_location`,
      { p_request_id: requestId, p_lat: lat, p_lng: lng },
      {
        headers: {
          'Content-Type': 'application/json',
          apikey: ANON_KEY,
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    const updated = Array.isArray(response.data) ? response.data[0] : response.data;
    return !!updated;
  } catch (error: any) {
    // Deliberately not retried: another position is coming in a few
    // seconds anyway, and a backed-up queue of stale fixes is worse than
    // a skipped one.
    console.error('reportDriverLocation error', {
      status: error?.response?.status,
      data: error?.response?.data,
      message: error?.message,
    });
    return false;
  }
}

/**
 * Cancel a request the caller owns, via the `cancel_delivery_request`
 * RPC (see sql/20260915000000_add_request_cancellation.sql).
 *
 * Succeeds only while the request is 'pending' or 'assigned'; once a
 * driver is in transit they are physically carrying the load and the RPC
 * refuses. Returns null when nothing was cancelled, which the caller
 * should treat as "the state moved underneath you" and refetch, not as
 * an error.
 */
export async function cancelDeliveryRequest(
  accessToken: string,
  requestId: string
): Promise<DeliveryRequest | null> {
  try {
    const response = await retryWithBackoff(async () => {
      return await axios.post(
        `${API_URL}/rest/v1/rpc/cancel_delivery_request`,
        { p_request_id: requestId },
        {
          headers: {
            'Content-Type': 'application/json',
            apikey: ANON_KEY,
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );
    });

    const cancelled = Array.isArray(response.data) ? response.data[0] : response.data;
    return (cancelled as DeliveryRequest) || null;
  } catch (error: any) {
    console.error('cancelDeliveryRequest error', {
      status: error?.response?.status,
      data: error?.response?.data,
      message: error?.message,
    });
    return null;
  }
}

/**
 * Mark a cancelled job as seen by the driver it was assigned to, via the
 * `acknowledge_cancelled_job` RPC. Until this is called the cancellation
 * notice stays in their jobs list, so a driver who missed the push and
 * the in-app alert still finds out rather than watching the job silently
 * disappear.
 */
export async function acknowledgeCancelledJob(
  accessToken: string,
  requestId: string
): Promise<boolean> {
  try {
    const response = await axios.post(
      `${API_URL}/rest/v1/rpc/acknowledge_cancelled_job`,
      { p_request_id: requestId },
      {
        headers: {
          'Content-Type': 'application/json',
          apikey: ANON_KEY,
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
    const acked = Array.isArray(response.data) ? response.data[0] : response.data;
    return !!acked;
  } catch (error: any) {
    console.error('acknowledgeCancelledJob error', {
      status: error?.response?.status,
      data: error?.response?.data,
    });
    return false;
  }
}

/**
 * Fetch delivery requests for the current user (or all if auth token has privileges).
 * Pass a simple filter string e.g. "auth_id=eq.<uuid>" or "status=eq.pending".
 */
export async function getDeliveryRequests(
  accessToken: string,
  filter?: string
): Promise<DeliveryRequest[]> {
  try {
    const url = filter
      ? `${API_URL}/rest/v1/delivery_requests?select=*&${filter}&order=created_at.desc`
      : `${API_URL}/rest/v1/delivery_requests?select=*&order=created_at.desc`;

    const response = await retryWithBackoff(async () => {
      return await axios.get(url, {
        headers: {
          apikey: ANON_KEY,
          Authorization: `Bearer ${accessToken}`,
        },
      });
    });

    return (response.data ?? []) as DeliveryRequest[];
  } catch (error: any) {
    console.error('getDeliveryRequests error', {
      status: error?.response?.status,
      data: error?.response?.data,
      message: error?.message,
    });
    return [];
  }
}

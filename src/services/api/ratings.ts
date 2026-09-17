import axios from 'axios';
import { SUPABASE_CONFIG } from '../../config/supabaseConfig';

const API_URL = SUPABASE_CONFIG.url;
const ANON_KEY = SUPABASE_CONFIG.anonKey;

export interface Rating {
  id: string;
  delivery_request_id: string;
  rater_auth_id: string;
  ratee_auth_id: string;
  stars: number;
  comment?: string | null;
  created_at?: string;
}

export interface CounterpartyRating {
  rating_avg: number | null;
  rating_count: number;
}

const authHeaders = (accessToken: string) => ({
  'Content-Type': 'application/json',
  apikey: ANON_KEY,
  Authorization: `Bearer ${accessToken}`,
});

/**
 * Rate the other party on a completed delivery.
 *
 * The RPC derives who is being rated from the delivery itself rather
 * than taking it as a parameter, so a caller can't attach a review to
 * someone who wasn't involved. Returns null if the delivery isn't
 * rateable by this caller, or if they've already rated it - the unique
 * constraint makes a second attempt a no-op rather than a duplicate.
 */
export async function submitRating(
  accessToken: string,
  requestId: string,
  stars: number,
  comment?: string
): Promise<Rating | null> {
  try {
    const response = await axios.post(
      `${API_URL}/rest/v1/rpc/submit_rating`,
      { p_request_id: requestId, p_stars: stars, p_comment: comment ?? null },
      { headers: authHeaders(accessToken) }
    );
    const created = Array.isArray(response.data) ? response.data[0] : response.data;
    return (created as Rating) || null;
  } catch (error: any) {
    console.error('submitRating error', {
      status: error?.response?.status,
      data: error?.response?.data,
    });
    return null;
  }
}

/**
 * Whether the signed-in user has already rated this delivery. Drives
 * whether the prompt is shown, so a rated delivery stops asking.
 */
export async function hasRatedDelivery(
  accessToken: string,
  requestId: string,
  raterAuthId: string
): Promise<boolean> {
  try {
    const response = await axios.get(
      `${API_URL}/rest/v1/ratings?select=id&delivery_request_id=eq.${requestId}&rater_auth_id=eq.${raterAuthId}`,
      { headers: authHeaders(accessToken) }
    );
    return ((response.data ?? []) as unknown[]).length > 0;
  } catch (error: any) {
    // Treated as "already rated" on failure: showing a prompt that can't
    // succeed is worse than missing one that could.
    console.error('hasRatedDelivery error', { status: error?.response?.status });
    return true;
  }
}

/**
 * The other party's average rating and how many ratings it's based on,
 * for one delivery the caller is part of. A count of zero means nobody
 * has rated them yet, which callers should present as "new" rather than
 * as a bad score.
 */
export async function getCounterpartyRating(
  accessToken: string,
  requestId: string
): Promise<CounterpartyRating | null> {
  try {
    const response = await axios.post(
      `${API_URL}/rest/v1/rpc/get_counterparty_rating`,
      { p_request_id: requestId },
      { headers: authHeaders(accessToken) }
    );
    const row = Array.isArray(response.data) ? response.data[0] : response.data;
    if (!row) {
      return null;
    }
    return {
      rating_avg: row.rating_avg != null ? Number(row.rating_avg) : null,
      rating_count: Number(row.rating_count ?? 0),
    };
  } catch (error: any) {
    console.error('getCounterpartyRating error', { status: error?.response?.status });
    return null;
  }
}

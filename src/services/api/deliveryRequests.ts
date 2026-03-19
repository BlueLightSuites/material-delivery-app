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

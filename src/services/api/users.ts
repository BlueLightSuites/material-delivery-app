import axios from 'axios';
import { SUPABASE_CONFIG } from '../../config/supabaseConfig';
import { User } from '../../models/User';

const API_URL = SUPABASE_CONFIG.url;
const ANON_KEY = SUPABASE_CONFIG.anonKey;

const authHeaders = (accessToken: string) => ({
  'Content-Type': 'application/json',
  apikey: ANON_KEY,
  Authorization: `Bearer ${accessToken}`,
  Prefer: 'return=representation',
});

/**
 * Set the signed-in user's name.
 *
 * Usually an update to their existing profile row. If there's no row at
 * all - the profile insert at signup failed, and sign-in's attempt to
 * recreate it was refused for want of a name - it's created here, which
 * is the first point at which it can be.
 */
export async function saveUserName(accessToken: string, user: User, name: string): Promise<boolean> {
  if (!user.auth_id) {
    return false;
  }
  try {
    const updated = await axios.patch(
      `${API_URL}/rest/v1/users?auth_id=eq.${user.auth_id}`,
      { name },
      { headers: authHeaders(accessToken) }
    );
    if ((updated.data ?? []).length > 0) {
      return true;
    }

    await axios.post(
      `${API_URL}/rest/v1/users`,
      {
        auth_id: user.auth_id,
        email: user.email,
        name,
        // The insert policy only accepts these two; anything else was never
        // a role this account could have had.
        role: user.role === 'contractor' ? 'contractor' : 'driver',
      },
      { headers: authHeaders(accessToken) }
    );
    return true;
  } catch (error: any) {
    console.error('saveUserName error', { status: error?.response?.status, data: error?.response?.data });
    return false;
  }
}

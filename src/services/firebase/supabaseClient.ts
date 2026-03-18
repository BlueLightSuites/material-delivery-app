import { SUPABASE_CONFIG } from '../../config/supabaseConfig';

/**
 * Supabase REST API client
 * Uses axios for HTTP requests instead of SDK to avoid Hermes compatibility issues
 */
export const supabaseConfig = {
  url: SUPABASE_CONFIG.url,
  anonKey: SUPABASE_CONFIG.anonKey,
};

export default supabaseConfig;
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_CONFIG } from '../../config/supabaseConfig';

const SUPABASE_URL = SUPABASE_CONFIG.url;
const SUPABASE_KEY = SUPABASE_CONFIG.anonKey;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('Missing Supabase configuration. Please check your config file.');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
export default supabase;
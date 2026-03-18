// import { User } from '../../models/User';
// import { supabase } from '../firebase/supabaseClient';

// export async function fetchUser(userId: string): Promise<User | null> {
//   const { data, error } = await supabase.from<User>('users').select('*').eq('id', userId).single();
//   if (error) {
//     console.error('fetchUser error', error);
//     return null;
//   }
//   return data ?? null;
// }
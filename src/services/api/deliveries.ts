// import { Job } from '../../models/Job';
// import { supabase } from '../firebase/supabaseClient';

// export async function fetchNearbyJobs(lat: number, lng: number): Promise<Job[]> {
//   // simple supabase example - adjust to your schema
//   const { data, error } = await supabase
//     .from<Job>('jobs')
//     .select('*')
//     .eq('status', 'open')
//     .limit(50);

//   if (error) {
//     console.error('fetchNearbyJobs error', error);
//     return [];
//   }
//   return (data ?? []) as Job[];
// }
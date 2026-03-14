import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Client-side Supabase client (uses anon key)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Server-side Supabase client (uses service role key for full DB access)
export function getServiceSupabase() {
    if (!supabaseServiceKey) {
        // Fallback to anon key if service key not set (hackathon mode)
        console.warn('SUPABASE_SERVICE_ROLE_KEY not set, using anon key');
        return createClient(supabaseUrl, supabaseAnonKey);
    }
    return createClient(supabaseUrl, supabaseServiceKey);
}

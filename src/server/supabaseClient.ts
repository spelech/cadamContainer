import {
  createClient,
  type SupabaseClientOptions,
} from '@supabase/supabase-js';
import type { Database } from '@shared/database';

export type SupabaseClient = ReturnType<typeof getAnonSupabaseClient>;

export function getAnonSupabaseClient(
  options?: SupabaseClientOptions<'public'>,
) {
  const url = process.env.VITE_SUPABASE_URL || 'http://localhost';
  const key = process.env.VITE_SUPABASE_ANON_KEY || 'local-anon-key';
  return createClient<Database, 'public'>(url, key, options);
}

export function getServiceRoleSupabaseClient(
  options?: SupabaseClientOptions<'public'>,
) {
  const url = process.env.VITE_SUPABASE_URL || 'http://localhost';
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    'local-service-role-key';
  return createClient<Database, 'public'>(url, key, {
    ...options,
    auth: { autoRefreshToken: false, persistSession: false },
  });
}


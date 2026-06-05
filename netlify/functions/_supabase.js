import { createClient } from '@supabase/supabase-js';

export function normalizeSupabaseUrl(url) {
  return String(url || '').replace(/\/rest\/v1\/?$/i, '').replace(/\/$/, '');
}

export function serviceClient() {
  return createClient(normalizeSupabaseUrl(process.env.SUPABASE_URL), process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

export async function requireSuperAdmin(event, supabase) {
  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return { error: 'Missing authorization token', status: 401 };

  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) return { error: 'Invalid authorization token', status: 401 };

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, is_active')
    .eq('id', authData.user.id)
    .single();

  if (!profile?.is_active || profile.role !== 'super_admin') {
    return { error: 'Super Admin access required', status: 403 };
  }

  return { user: authData.user, profile };
}

import { serviceClient, requireSuperAdmin } from './_supabase.js';

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const supabase = serviceClient();
  const auth = await requireSuperAdmin(event, supabase);
  if (auth.error) return { statusCode: auth.status, body: auth.error };

  const { email, full_name, role, manager_id } = JSON.parse(event.body || '{}');
  if (!email?.endsWith('@goodstuph.org')) {
    return { statusCode: 400, body: 'Only goodstuph.org emails can be invited.' };
  }

  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
    redirectTo: process.env.APP_BASE_URL,
    data: { full_name },
  });

  if (error && !error.message?.toLowerCase().includes('already')) {
    return { statusCode: 500, body: error.message };
  }

  const userId = data?.user?.id;
  if (userId) {
    await supabase.from('profiles').update({
      full_name,
      role,
      manager_id: manager_id || null,
      is_active: true,
    }).eq('id', userId);
  }

  await supabase.from('audit_logs').insert({
    actor_id: auth.profile.id,
    action: 'user_invited',
    after_values: { email, full_name, role, manager_id },
  });

  return { statusCode: 200, body: 'User invited.' };
}

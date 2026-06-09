import { serviceClient, requireSuperAdmin } from './_supabase.js';

export async function handler(event) {
  if (!['POST', 'PATCH', 'DELETE'].includes(event.httpMethod)) {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const supabase = serviceClient();
  const auth = await requireSuperAdmin(event, supabase);
  if (auth.error) return { statusCode: auth.status, body: auth.error };

  const body = JSON.parse(event.body || '{}');

  if (event.httpMethod === 'DELETE') {
    const { id } = body;
    if (!id) return { statusCode: 400, body: 'Missing user id.' };
    if (id === auth.profile.id) return { statusCode: 400, body: 'You cannot delete your own account.' };

    const { error } = await supabase.auth.admin.deleteUser(id);
    if (error) return { statusCode: 500, body: error.message };

    await supabase.from('audit_logs').insert({
      actor_id: auth.profile.id,
      action: 'user_deleted',
      after_values: { id },
    });

    return { statusCode: 200, body: 'User deleted.' };
  }

  if (event.httpMethod === 'PATCH') {
    const { id, patch } = body;
    if (!id || !patch) return { statusCode: 400, body: 'Missing user update details.' };

    const allowed = {};
    if (patch.role) allowed.role = patch.role;
    if ('manager_id' in patch) allowed.manager_id = patch.manager_id || null;
    if ('is_active' in patch) allowed.is_active = Boolean(patch.is_active);

    const { error } = await supabase.from('profiles').update(allowed).eq('id', id);
    if (error) return { statusCode: 500, body: error.message };

    await supabase.from('audit_logs').insert({
      actor_id: auth.profile.id,
      action: 'user_updated',
      after_values: { id, patch: allowed },
    });

    return { statusCode: 200, body: 'User updated.' };
  }

  const { email, full_name, role, manager_id } = body;
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

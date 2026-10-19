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

    const { data: targetUser, error: targetUserError } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', id)
      .single();
    if (targetUserError || !targetUser) return { statusCode: 404, body: 'User not found.' };

    const { data: directReports, error: directReportsError } = await supabase
      .from('profiles')
      .select('id')
      .eq('manager_id', id)
      .eq('is_active', true)
      .limit(1);
    if (directReportsError) return { statusCode: 500, body: directReportsError.message };
    if (directReports?.length) {
      return { statusCode: 400, body: 'Reassign this user\'s active direct reports before removing their access.' };
    }

    if (targetUser.role === 'super_admin') {
      const { data: otherSuperAdmins, error: superAdminError } = await supabase
        .from('profiles')
        .select('id')
        .eq('role', 'super_admin')
        .eq('is_active', true)
        .neq('id', id)
        .limit(1);
      if (superAdminError) return { statusCode: 500, body: superAdminError.message };
      if (!otherSuperAdmins?.length) {
        return { statusCode: 400, body: 'Assign another active Super Admin before removing this account.' };
      }
    }

    // Soft deletion revokes sign-in access without breaking linked claim records.
    const { error } = await supabase.auth.admin.deleteUser(id, true);
    if (error) return { statusCode: 500, body: error.message };

    const { error: profileError } = await supabase
      .from('profiles')
      .update({ is_active: false })
      .eq('id', id);
    if (profileError) return { statusCode: 500, body: profileError.message };

    await supabase.from('audit_logs').insert({
      actor_id: auth.profile.id,
      action: 'user_access_removed',
      after_values: { id },
    });

    return { statusCode: 200, body: 'User access removed. Their claims and records were kept.' };
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

  const email = String(body.email || '').trim().toLowerCase();
  const full_name = String(body.full_name || '').trim();
  const { role, manager_id } = body;
  if (!email.endsWith('@goodstuph.org')) {
    return { statusCode: 400, body: 'Only goodstuph.org emails can be added.' };
  }

  // This creates a Google-ready account without sending an email invitation.
  // Supabase will link the Google identity when the employee signs in with this email.
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name },
  });

  if (error && !/already|registered|exists/i.test(error.message || '')) {
    return { statusCode: 500, body: error.message };
  }

  const userId = data?.user?.id;
  const profilePatch = {
    full_name,
    role,
    manager_id: manager_id || null,
    is_active: true,
  };

  if (userId) {
    const { error: profileError } = await supabase.from('profiles').update(profilePatch).eq('id', userId);
    if (profileError) return { statusCode: 500, body: profileError.message };
  } else {
    const { error: profileError } = await supabase.from('profiles').update(profilePatch).eq('email', email);
    if (profileError) return { statusCode: 500, body: profileError.message };
  }

  await supabase.from('audit_logs').insert({
    actor_id: auth.profile.id,
    action: 'user_added',
    after_values: { email, full_name, role, manager_id },
  });

  return { statusCode: 200, body: 'User added. They can now sign in with Google.' };
}

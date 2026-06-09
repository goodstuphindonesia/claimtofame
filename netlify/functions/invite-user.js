import nodemailer from 'nodemailer';
import { serviceClient, requireSuperAdmin } from './_supabase.js';

function transporter() {
  const port = Number(process.env.SMTP_PORT || 465);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port,
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

function inviteEmail({ fullName, actionLink }) {
  const firstName = fullName?.split(' ')?.[0] || 'there';
  return `
    <div style="margin:0;background:#070707;padding:32px;font-family:Arial,sans-serif;color:#18181b">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;border:1px solid #eeeeee">
        <h1 style="margin:0 0 12px;font-size:28px;line-height:1.15;color:#111111">Welcome to Claim to Fame</h1>
        <p style="margin:0 0 18px;font-size:16px;line-height:1.55;color:#444444">Hi ${firstName}, you have been invited to GOODSTUPH's internal claims app.</p>
        <p style="margin:0 0 24px;font-size:16px;line-height:1.55;color:#444444">Use the button below to activate your account. After that, you can submit claims, upload receipts, and track approvals.</p>
        <p style="margin:0 0 28px">
          <a href="${actionLink}" style="display:inline-block;background:#ff4d00;color:#160600;text-decoration:none;font-weight:700;border-radius:8px;padding:13px 18px">Accept invitation</a>
        </p>
        <p style="margin:0 0 8px;font-size:13px;line-height:1.45;color:#777777">If the button does not work, copy and paste this link into your browser:</p>
        <p style="margin:0;font-size:13px;line-height:1.45;word-break:break-all;color:#777777">${actionLink}</p>
      </div>
    </div>
  `;
}

async function sendInviteEmail({ email, fullName, actionLink }) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error('SMTP_USER and SMTP_PASS are required to send invite emails.');
  }

  const mail = transporter();
  await mail.sendMail({
    from: `"Claim to Fame" <${process.env.SMTP_USER}>`,
    to: email,
    subject: 'You have been invited to Claim to Fame',
    html: inviteEmail({ fullName, actionLink }),
  });
}

export async function handler(event) {
  if (!['POST', 'PATCH'].includes(event.httpMethod)) {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const supabase = serviceClient();
  const auth = await requireSuperAdmin(event, supabase);
  if (auth.error) return { statusCode: auth.status, body: auth.error };

  const body = JSON.parse(event.body || '{}');

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

  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'invite',
    email,
    options: {
      redirectTo: process.env.APP_BASE_URL,
      data: { full_name },
    },
  });

  if (error && !error.message?.toLowerCase().includes('already')) {
    return { statusCode: 500, body: error.message };
  }

  const userId = data?.user?.id;
  const actionLink = data?.properties?.action_link || data?.properties?.actionLink;

  if (!actionLink && !error) {
    return { statusCode: 500, body: 'Supabase did not return an invite link.' };
  }

  if (userId) {
    await supabase.from('profiles').update({
      full_name,
      role,
      manager_id: manager_id || null,
      is_active: true,
    }).eq('id', userId);
  }

  if (actionLink) {
    try {
      await sendInviteEmail({ email, fullName: full_name, actionLink });
    } catch (mailError) {
      return { statusCode: 500, body: `User was created, but the invite email could not be sent: ${mailError.message}` };
    }
  }

  await supabase.from('audit_logs').insert({
    actor_id: auth.profile.id,
    action: 'user_invited',
    after_values: { email, full_name, role, manager_id },
  });

  return { statusCode: 200, body: 'User invited.' };
}

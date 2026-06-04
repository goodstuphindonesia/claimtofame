import nodemailer from 'nodemailer';
import { serviceClient } from './_supabase.js';

export const config = {
  schedule: '0 2 * * 1-5',
};

function transporter() {
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: process.env.GOOGLE_WORKSPACE_SMTP_USER,
      pass: process.env.GOOGLE_WORKSPACE_SMTP_PASS,
    },
  });
}

function groupedList(title, claims) {
  if (!claims.length) return '';
  const byCategory = claims.reduce((acc, claim) => {
    const key = claim.category?.name || 'Uncategorized';
    acc[key] ||= [];
    acc[key].push(claim);
    return acc;
  }, {});

  const groups = Object.entries(byCategory)
    .map(([category, items]) => `<li><strong>${category}</strong>: ${items.length} item${items.length === 1 ? '' : 's'}</li>`)
    .join('');

  return `<h3>${title}</h3><ul>${groups}</ul>`;
}

async function sendDigest(mail, to, subject, sections) {
  const htmlSections = sections.filter(Boolean).join('');
  if (!htmlSections) return false;

  await mail.sendMail({
    from: `"${process.env.EMAIL_FROM_NAME || 'Claim to Fame'}" <${process.env.GOOGLE_WORKSPACE_SMTP_USER}>`,
    to,
    subject,
    html: `
      <div style="font-family:Arial,sans-serif;color:#161616">
        <h2>Claim to Fame</h2>
        ${htmlSections}
        <p><a href="${process.env.APP_BASE_URL}">Log in to review</a></p>
      </div>
    `,
  });
  return true;
}

export async function handler() {
  const supabase = serviceClient();
  const mail = transporter();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: users, error: userError } = await supabase
    .from('profiles')
    .select('*')
    .eq('is_active', true);

  if (userError) return { statusCode: 500, body: userError.message };

  const { data: claims, error: claimError } = await supabase
    .from('claims')
    .select('*, claimant:profiles!claims_claimant_id_fkey(full_name,email), category:claim_categories(name)')
    .order('updated_at', { ascending: false });

  if (claimError) return { statusCode: 500, body: claimError.message };

  let sent = 0;
  for (const user of users || []) {
    const ownUpdates = claims.filter((claim) => claim.claimant_id === user.id && claim.updated_at >= since);
    const managerPending = claims.filter((claim) => claim.manager_id === user.id && claim.status === 'submitted');
    const adminPending = user.role === 'super_admin'
      ? claims.filter((claim) => claim.status === 'manager_approved')
      : [];
    const adminSummary = user.role === 'super_admin'
      ? claims.filter((claim) => ['admin_approved', 'paid'].includes(claim.status) && claim.updated_at >= since)
      : [];

    const sections = [
      groupedList('Your claim updates', ownUpdates),
      groupedList('Waiting for manager approval', managerPending),
      groupedList('Waiting for final approval', adminPending),
      groupedList('Admin approved or paid updates', adminSummary),
    ];

    const didSend = await sendDigest(mail, user.email, 'Claim to Fame daily digest', sections);
    if (didSend) sent += 1;
  }

  return { statusCode: 200, body: `Sent ${sent} digest email(s).` };
}

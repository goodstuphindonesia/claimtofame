import JSZip from 'jszip';
import { serviceClient, requireSuperAdmin } from './_supabase.js';

function csvEscape(value) {
  const text = value == null ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function safeFileName(value) {
  return String(value || 'unknown').replace(/[^a-zA-Z0-9._@-]/g, '-');
}

export async function handler(event) {
  const supabase = serviceClient();
  const auth = await requireSuperAdmin(event, supabase);
  if (auth.error) return { statusCode: auth.status, body: auth.error };

  const month = event.queryStringParameters?.month;
  if (!/^\d{4}-\d{2}$/.test(month || '')) {
    return { statusCode: 400, body: 'Use month=YYYY-MM.' };
  }

  const start = `${month}-01`;
  const end = new Date(`${month}-01T00:00:00Z`);
  end.setUTCMonth(end.getUTCMonth() + 1);
  const endDate = end.toISOString().slice(0, 10);

  const { data: claims, error } = await supabase
    .from('claims')
    .select(`
      *,
      claimant:profiles!claims_claimant_id_fkey(full_name,email),
      category:claim_categories(name),
      receipts:claim_receipts(file_name,file_path)
    `)
    .eq('status', 'admin_approved')
    .gte('incurred_date', start)
    .lt('incurred_date', endDate)
    .order('incurred_date', { ascending: true });

  if (error) return { statusCode: 500, body: error.message };

  const zip = new JSZip();
  const headers = [
    'claim_id',
    'employee_name',
    'employee_email',
    'title',
    'category',
    'vendor_merchant',
    'amount',
    'currency',
    'date_incurred',
    'job_no',
    'business_purpose',
    'notes',
    'receipt_files',
  ];

  const rows = [headers.map(csvEscape).join(',')];

  for (const claim of claims || []) {
    const employee = safeFileName(claim.claimant?.email);
    const receiptNames = [];

    for (const receipt of claim.receipts || []) {
      const amount = String(claim.amount).replace('.', '-');
      const targetName = `${safeFileName(claim.claimant?.email)}-${claim.incurred_date}-${amount}-${safeFileName(receipt.file_name)}`;
      receiptNames.push(`receipts/${employee}/${targetName}`);

      const { data: fileData } = await supabase.storage.from('claim-receipts').download(receipt.file_path);
      if (fileData) {
        const buffer = Buffer.from(await fileData.arrayBuffer());
        zip.file(`receipts/${employee}/${targetName}`, buffer);
      }
    }

    rows.push([
      claim.id,
      claim.claimant?.full_name,
      claim.claimant?.email,
      claim.title,
      claim.category?.name,
      claim.vendor_name,
      claim.amount,
      claim.currency,
      claim.incurred_date,
      claim.job_no,
      claim.business_purpose,
      claim.notes,
      receiptNames.join('; '),
    ].map(csvEscape).join(','));
  }

  zip.file('claims.csv', rows.join('\n'));

  await supabase.from('audit_logs').insert({
    actor_id: auth.profile.id,
    action: 'claims_exported',
    after_values: { month, count: claims?.length || 0 },
  });

  const body = await zip.generateAsync({ type: 'base64' });
  return {
    statusCode: 200,
    isBase64Encoded: true,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="GOODSTUPH-approved-claims-${month}.zip"`,
    },
    body,
  };
}

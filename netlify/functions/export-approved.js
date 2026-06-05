import JSZip from 'jszip';
import { serviceClient, requireSuperAdmin } from './_supabase.js';

function csvEscape(value) {
  const text = value == null ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function safeFileName(value) {
  return String(value || 'unknown').replace(/[^a-zA-Z0-9._@-]/g, '-');
}

function jakartaMonthRange(month) {
  const [year, monthNumber] = month.split('-').map(Number);
  return {
    startIso: new Date(Date.UTC(year, monthNumber - 1, 1, -7, 0, 0)).toISOString(),
    endIso: new Date(Date.UTC(year, monthNumber, 1, -7, 0, 0)).toISOString(),
  };
}

function expenseMonthRange(month) {
  const startDate = `${month}-01`;
  const end = new Date(`${month}-01T00:00:00Z`);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return {
    startDate,
    endDate: end.toISOString().slice(0, 10),
  };
}

async function loadReceiptRecords(supabase, claim) {
  if (claim.receipts?.length) return claim.receipts;

  const folder = `${claim.claimant_id}/${claim.id}`;
  const { data: files, error } = await supabase.storage.from('claim-receipts').list(folder);
  if (error || !files?.length) return [];

  return files.map((file) => ({
    file_name: file.name,
    file_path: `${folder}/${file.name}`,
  }));
}

export async function handler(event) {
  const supabase = serviceClient();
  const auth = await requireSuperAdmin(event, supabase);
  if (auth.error) return { statusCode: auth.status, body: auth.error };

  const month = event.queryStringParameters?.month;
  if (!/^\d{4}-\d{2}$/.test(month || '')) {
    return { statusCode: 400, body: 'Use month=YYYY-MM.' };
  }

  const { startIso, endIso } = jakartaMonthRange(month);
  const { startDate, endDate } = expenseMonthRange(month);

  const { data: approvalEvents, error: eventError } = await supabase
    .from('approval_events')
    .select('claim_id,created_at')
    .eq('action', 'admin_approved')
    .gte('created_at', startIso)
    .lt('created_at', endIso)
    .order('created_at', { ascending: true });

  if (eventError) return { statusCode: 500, body: eventError.message };

  const approvedAtByClaimId = new Map();
  const claimIds = new Set();
  for (const approvalEvent of approvalEvents || []) {
    if (!approvedAtByClaimId.has(approvalEvent.claim_id)) {
      approvedAtByClaimId.set(approvalEvent.claim_id, approvalEvent.created_at);
    }
    claimIds.add(approvalEvent.claim_id);
  }

  const { data: expenseMonthClaims, error: expenseMonthError } = await supabase
    .from('claims')
    .select('id,updated_at')
    .in('status', ['admin_approved', 'paid'])
    .gte('incurred_date', startDate)
    .lt('incurred_date', endDate);

  if (expenseMonthError) return { statusCode: 500, body: expenseMonthError.message };

  for (const claim of expenseMonthClaims || []) {
    claimIds.add(claim.id);
    if (!approvedAtByClaimId.has(claim.id)) {
      approvedAtByClaimId.set(claim.id, claim.updated_at);
    }
  }

  let claims = [];
  const ids = [...claimIds];

  if (ids.length) {
    const { data, error } = await supabase
      .from('claims')
      .select(`
        *,
        claimant:profiles!claims_claimant_id_fkey(full_name,email),
        category:claim_categories(name),
        receipts:claim_receipts(file_name,file_path)
      `)
      .in('id', ids)
      .in('status', ['admin_approved', 'paid'])
      .order('incurred_date', { ascending: true });

    if (error) return { statusCode: 500, body: error.message };
    claims = data || [];
  }

  const zip = new JSZip();
  const headers = [
    'claim_id',
    'employee_name',
    'employee_email',
    'category',
    'vendor_merchant',
    'amount',
    'currency',
    'date_incurred',
    'admin_approved_at',
    'job_no',
    'business_purpose',
    'status',
    'receipt_files',
  ];

  const rows = [headers.map(csvEscape).join(',')];
  const missingReceipts = [];

  for (const claim of claims || []) {
    const employee = safeFileName(claim.claimant?.email);
    const receiptNames = [];
    const receipts = await loadReceiptRecords(supabase, claim);

    for (const receipt of receipts) {
      const amount = String(claim.amount).replace('.', '-');
      const targetName = `${safeFileName(claim.claimant?.email)}-${claim.incurred_date}-${amount}-${safeFileName(receipt.file_name)}`;
      receiptNames.push(`receipts/${employee}/${targetName}`);

      const { data: fileData, error: downloadError } = await supabase.storage.from('claim-receipts').download(receipt.file_path);
      if (fileData) {
        const buffer = Buffer.from(await fileData.arrayBuffer());
        zip.file(`receipts/${employee}/${targetName}`, buffer);
      } else {
        missingReceipts.push(`${claim.id}: ${receipt.file_name}${downloadError ? ` (${downloadError.message})` : ''}`);
      }
    }

    rows.push([
      claim.id,
      claim.claimant?.full_name,
      claim.claimant?.email,
      claim.category?.name,
      claim.vendor_name,
      claim.amount,
      claim.currency,
      claim.incurred_date,
      approvedAtByClaimId.get(claim.id),
      claim.job_no,
      claim.business_purpose,
      claim.status,
      receiptNames.join('; '),
    ].map(csvEscape).join(','));
  }

  zip.file('claims.csv', rows.join('\n'));
  if (missingReceipts.length) {
    zip.file('missing-receipts.txt', missingReceipts.join('\n'));
  }

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

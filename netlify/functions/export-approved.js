import JSZip from 'jszip';
import { serviceClient, requireSuperAdmin } from './_supabase.js';

function csvEscape(value) {
  const text = value == null ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function safeFileName(value) {
  return String(value || 'unknown').replace(/[^a-zA-Z0-9._@-]/g, '-');
}

const EXPORT_BUCKET = 'claim-exports';

function monthDateRange(month) {
  const startDate = `${month}-01`;
  const end = new Date(`${month}-01T00:00:00Z`);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return {
    startDate,
    endDate: end.toISOString().slice(0, 10),
  };
}

async function ensureExportBucket(supabase) {
  const { error } = await supabase.storage.createBucket(EXPORT_BUCKET, {
    public: false,
    fileSizeLimit: 100 * 1024 * 1024,
    allowedMimeTypes: ['application/zip'],
  });

  if (error && !/already exists|duplicate/i.test(error.message || '')) {
    throw error;
  }
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

  const { startDate, endDate } = monthDateRange(month);

  const { data: claims, error } = await supabase
    .from('claims')
    .select(`
      *,
      claimant:profiles!claims_claimant_id_fkey(full_name,email),
      category:claim_categories(name),
      receipts:claim_receipts(file_name,file_path)
    `)
    .in('status', ['admin_approved', 'paid'])
    .gte('incurred_date', startDate)
    .lt('incurred_date', endDate)
    .order('incurred_date', { ascending: true });

  if (error) return { statusCode: 500, body: error.message };

  if (!claims?.length) {
    return {
      statusCode: 404,
      body: `No admin-approved or paid claims found for ${month}. Choose a month with approved claims.`,
    };
  }

  const claimIds = claims.map((claim) => claim.id);
  const { data: approvalEvents, error: eventError } = await supabase
    .from('approval_events')
    .select('claim_id,created_at')
    .eq('action', 'admin_approved')
    .in('claim_id', claimIds)
    .order('created_at', { ascending: true });

  if (eventError) return { statusCode: 500, body: eventError.message };

  const approvedAtByClaimId = new Map();
  for (const approvalEvent of approvalEvents || []) {
    if (!approvedAtByClaimId.has(approvalEvent.claim_id)) {
      approvedAtByClaimId.set(approvalEvent.claim_id, approvalEvent.created_at);
    }
  }

  const exportSummary = {
    requested_month: month,
    month_rule: 'incurred_date is within selected month',
    exported_claims: claims.length,
    receipt_files_found: 0,
    receipt_files_exported: 0,
    receipt_files_missing: 0,
  };

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
    exportSummary.receipt_files_found += receipts.length;

    for (const receipt of receipts) {
      const amount = String(claim.amount).replace('.', '-');
      const targetName = `${safeFileName(claim.claimant?.email)}-${claim.incurred_date}-${amount}-${safeFileName(receipt.file_name)}`;
      receiptNames.push(`receipts/${employee}/${targetName}`);

      const { data: fileData, error: downloadError } = await supabase.storage.from('claim-receipts').download(receipt.file_path);
      if (fileData) {
        const buffer = Buffer.from(await fileData.arrayBuffer());
        zip.file(`receipts/${employee}/${targetName}`, buffer);
        exportSummary.receipt_files_exported += 1;
      } else {
        missingReceipts.push(`${claim.id}: ${receipt.file_name}${downloadError ? ` (${downloadError.message})` : ''}`);
        exportSummary.receipt_files_missing += 1;
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
      approvedAtByClaimId.get(claim.id) || '',
      claim.job_no,
      claim.business_purpose,
      claim.status,
      receiptNames.join('; '),
    ].map(csvEscape).join(','));
  }

  zip.file('claims.csv', rows.join('\n'));
  zip.file('export-summary.json', JSON.stringify(exportSummary, null, 2));
  if (missingReceipts.length) {
    zip.file('missing-receipts.txt', missingReceipts.join('\n'));
  }

  await supabase.from('audit_logs').insert({
    actor_id: auth.profile.id,
    action: 'claims_exported',
    after_values: { month, count: claims?.length || 0 },
  });

  const fileName = `GOODSTUPH-approved-claims-${month}.zip`;
  const exportPath = `${month}/${Date.now()}-${fileName}`;
  const archive = await zip.generateAsync({ type: 'nodebuffer' });

  try {
    await ensureExportBucket(supabase);
  } catch (bucketError) {
    return { statusCode: 500, body: `Could not create the export storage bucket: ${bucketError.message}` };
  }

  const { error: uploadError } = await supabase.storage
    .from(EXPORT_BUCKET)
    .upload(exportPath, archive, { contentType: 'application/zip' });

  if (uploadError) return { statusCode: 500, body: `Could not save the export ZIP: ${uploadError.message}` };

  const { data: signedData, error: signedUrlError } = await supabase.storage
    .from(EXPORT_BUCKET)
    .createSignedUrl(exportPath, 600, { download: fileName });

  if (signedUrlError) return { statusCode: 500, body: `Could not create the export download link: ${signedUrlError.message}` };

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ downloadUrl: signedData.signedUrl, fileName }),
  };
}

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
const EXPORT_PART_LIMIT_BYTES = 42 * 1024 * 1024;
const FALLBACK_RECEIPT_BYTES = 5 * 1024 * 1024;

function jobPath(jobId) {
  return `jobs/${jobId}.json`;
}

function isDateValue(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

function isUuidValue(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || '');
}

function nextDateValue(value) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

async function ensureExportBucket(supabase) {
  const bucketOptions = {
    public: false,
    allowedMimeTypes: ['application/zip', 'application/json'],
  };

  const { error } = await supabase.storage.createBucket(EXPORT_BUCKET, bucketOptions);

  if (error && !/already exists|duplicate/i.test(error.message || '')) {
    throw error;
  }

  const { error: updateError } = await supabase.storage.updateBucket(EXPORT_BUCKET, bucketOptions);
  if (updateError) throw updateError;
}

async function writeJobStatus(supabase, jobId, payload) {
  const body = JSON.stringify({ ...payload, updatedAt: new Date().toISOString() });
  const { error } = await supabase.storage
    .from(EXPORT_BUCKET)
    .upload(jobPath(jobId), body, {
      contentType: 'application/json',
      upsert: true,
    });

  if (error) throw error;
}

async function loadReceiptRecords(supabase, claim) {
  if (claim.receipts?.length) return claim.receipts;

  const folder = `${claim.claimant_id}/${claim.id}`;
  const { data: files, error } = await supabase.storage.from('claim-receipts').list(folder);
  if (error || !files?.length) return [];

  return files.map((file) => ({
    file_name: file.name,
    file_path: `${folder}/${file.name}`,
    file_size: file.metadata?.size || file.size || FALLBACK_RECEIPT_BYTES,
  }));
}

function splitIntoChunks(items) {
  const chunks = [];
  let current = [];
  let currentSize = 0;

  for (const item of items) {
    const itemSize = Math.max(item.estimatedSize, 1);
    if (current.length && currentSize + itemSize > EXPORT_PART_LIMIT_BYTES) {
      chunks.push(current);
      current = [];
      currentSize = 0;
    }
    current.push(item);
    currentSize += itemSize;
  }

  if (current.length) chunks.push(current);
  return chunks;
}

export async function handler(event) {
  const supabase = serviceClient();
  const auth = await requireSuperAdmin(event, supabase);
  if (auth.error) return { statusCode: auth.status, body: auth.error };

  const jobId = event.queryStringParameters?.jobId;
  const startDate = event.queryStringParameters?.startDate;
  const endDate = event.queryStringParameters?.endDate;
  const claimantId = event.queryStringParameters?.claimantId || '';

  if (!jobId) {
    return { statusCode: 400, body: 'Missing export job id.' };
  }

  if (!isDateValue(startDate) || !isDateValue(endDate)) {
    return { statusCode: 400, body: 'Use startDate=YYYY-MM-DD and endDate=YYYY-MM-DD.' };
  }

  if (claimantId && !isUuidValue(claimantId)) {
    return { statusCode: 400, body: 'Use a valid claimantId.' };
  }

  if (startDate > endDate) {
    return { statusCode: 400, body: 'Start date must be before or equal to end date.' };
  }

  const exclusiveEndDate = nextDateValue(endDate);
  const claimantLabel = claimantId ? `-${safeFileName(claimantId)}` : '';
  const rangeLabel = `${startDate}-to-${endDate}${claimantLabel}`;

  try {
    await ensureExportBucket(supabase);
    await writeJobStatus(supabase, jobId, {
      status: 'running',
      message: 'Finding approved claims and receipts...',
      downloads: [],
    });
  } catch (setupError) {
    return { statusCode: 500, body: setupError.message };
  }

  try {
    let claimQuery = supabase
    .from('claims')
    .select(`
      *,
      claimant:profiles!claims_claimant_id_fkey(full_name,email),
      category:claim_categories(name),
      receipts:claim_receipts(file_name,file_path,file_size)
    `)
    .in('status', ['admin_approved', 'paid'])
    .gte('incurred_date', startDate)
    .lt('incurred_date', exclusiveEndDate)
    .order('incurred_date', { ascending: true });

  if (claimantId) {
    claimQuery = claimQuery.eq('claimant_id', claimantId);
  }

    const { data: claims, error } = await claimQuery;

    if (error) throw error;

    if (!claims?.length) {
      await writeJobStatus(supabase, jobId, {
        status: 'failed',
        message: `No admin-approved or paid claims found from ${startDate} to ${endDate}. Choose a date range with approved claims.`,
        downloads: [],
      });
      return { statusCode: 200, body: 'No claims to export.' };
    }

  const claimIds = claims.map((claim) => claim.id);
  const { data: approvalEvents, error: eventError } = await supabase
    .from('approval_events')
    .select('claim_id,created_at')
    .eq('action', 'admin_approved')
    .in('claim_id', claimIds)
    .order('created_at', { ascending: true });

  if (eventError) throw eventError;

  const approvedAtByClaimId = new Map();
  for (const approvalEvent of approvalEvents || []) {
    if (!approvedAtByClaimId.has(approvalEvent.claim_id)) {
      approvedAtByClaimId.set(approvalEvent.claim_id, approvalEvent.created_at);
    }
  }

  const exportSummary = {
    requested_start_date: startDate,
    requested_end_date: endDate,
    requested_claimant_id: claimantId || null,
    date_range_rule: 'incurred_date is within selected date range, inclusive',
    exported_claims: claims.length,
    receipt_files_found: 0,
    receipt_files_exported: 0,
    receipt_files_missing: 0,
  };

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

  const exportItems = [];

  for (const claim of claims || []) {
    const employee = safeFileName(claim.claimant?.email);
    const receiptNames = [];
    const receipts = await loadReceiptRecords(supabase, claim);
    exportSummary.receipt_files_found += receipts.length;
    const receiptItems = receipts.map((receipt) => {
      const amount = String(claim.amount).replace('.', '-');
      const targetName = `${safeFileName(claim.claimant?.email)}-${claim.incurred_date}-${amount}-${safeFileName(receipt.file_name)}`;
      const archivePath = `receipts/${employee}/${targetName}`;
      receiptNames.push(archivePath);
      return {
        ...receipt,
        archivePath,
        estimatedSize: Number(receipt.file_size || FALLBACK_RECEIPT_BYTES),
      };
    });

    const row = [
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
    ].map(csvEscape).join(',');

    exportItems.push({
      claimId: claim.id,
      row,
      receipts: receiptItems,
      estimatedSize: receiptItems.reduce((sum, receipt) => sum + receipt.estimatedSize, 0),
    });
  }

  const chunks = splitIntoChunks(exportItems);
  const downloads = [];
  const missingReceipts = [];

  for (const [index, chunk] of chunks.entries()) {
    await writeJobStatus(supabase, jobId, {
      status: 'running',
      message: `Creating ZIP part ${index + 1} of ${chunks.length}...`,
      downloads,
    });

    const zip = new JSZip();
    const rows = [headers.map(csvEscape).join(','), ...chunk.map((item) => item.row)];
    const chunkMissingReceipts = [];
    const chunkSummary = {
      requested_start_date: startDate,
      requested_end_date: endDate,
      requested_claimant_id: claimantId || null,
      date_range_rule: 'incurred_date is within selected date range, inclusive',
      part: index + 1,
      total_parts: chunks.length,
      exported_claims: chunk.length,
      receipt_files_found: chunk.reduce((sum, item) => sum + item.receipts.length, 0),
      receipt_files_exported: 0,
      receipt_files_missing: 0,
    };

    for (const item of chunk) {
      for (const receipt of item.receipts) {
        const { data: fileData, error: downloadError } = await supabase.storage.from('claim-receipts').download(receipt.file_path);
        if (fileData) {
          const buffer = Buffer.from(await fileData.arrayBuffer());
          zip.file(receipt.archivePath, buffer);
          exportSummary.receipt_files_exported += 1;
          chunkSummary.receipt_files_exported += 1;
        } else {
          const missingReceipt = `${item.claimId}: ${receipt.file_name}${downloadError ? ` (${downloadError.message})` : ''}`;
          missingReceipts.push(missingReceipt);
          chunkMissingReceipts.push(missingReceipt);
          exportSummary.receipt_files_missing += 1;
          chunkSummary.receipt_files_missing += 1;
        }
      }
    }

    zip.file('claims.csv', rows.join('\n'));
    zip.file('export-summary.json', JSON.stringify(chunkSummary, null, 2));
    if (chunkMissingReceipts.length) {
      zip.file('missing-receipts.txt', chunkMissingReceipts.join('\n'));
    }

    const partLabel = chunks.length > 1 ? `-part-${index + 1}-of-${chunks.length}` : '';
    const fileName = `GOODSTUPH-approved-claims-${rangeLabel}${partLabel}.zip`;
    const exportPath = `${rangeLabel}/${Date.now()}-${index + 1}-${fileName}`;
    const archive = await zip.generateAsync({ type: 'nodebuffer' });

    if (archive.length > 50 * 1024 * 1024) {
      throw new Error(`One export ZIP part is larger than Supabase's 50 MB storage limit. Try a shorter date range or fewer users.`);
    }

    const { error: uploadError } = await supabase.storage
      .from(EXPORT_BUCKET)
      .upload(exportPath, archive, { contentType: 'application/zip' });

    if (uploadError) throw new Error(`Could not save the export ZIP: ${uploadError.message}`);

    const { data: signedData, error: signedUrlError } = await supabase.storage
      .from(EXPORT_BUCKET)
      .createSignedUrl(exportPath, 600, { download: fileName });

    if (signedUrlError) throw new Error(`Could not create the export download link: ${signedUrlError.message}`);

    downloads.push({
      downloadUrl: signedData.signedUrl,
      fileName,
      part: index + 1,
      totalParts: chunks.length,
    });
  }

  await supabase.from('audit_logs').insert({
    actor_id: auth.profile.id,
    action: 'claims_exported',
    after_values: {
      startDate,
      endDate,
      claimantId: claimantId || null,
      count: claims?.length || 0,
      parts: downloads.length,
    },
  });

    await writeJobStatus(supabase, jobId, {
      status: 'complete',
      message: downloads.length === 1
        ? 'Export ZIP is ready. Use the download link below.'
        : `Export ZIP is ready in ${downloads.length} parts. Download each part below.`,
      downloadUrl: downloads[0]?.downloadUrl,
      fileName: downloads[0]?.fileName,
      downloads,
    });

    return { statusCode: 200, body: 'Export completed.' };
  } catch (error) {
    await writeJobStatus(supabase, jobId, {
      status: 'failed',
      message: error.message || 'The export could not be completed.',
      downloads: [],
    });
    return { statusCode: 500, body: error.message };
  }
}

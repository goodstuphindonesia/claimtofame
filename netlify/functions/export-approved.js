import { randomUUID } from 'crypto';
import { serviceClient, requireSuperAdmin } from './_supabase.js';

const EXPORT_BUCKET = 'claim-exports';

function isDateValue(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

function isUuidValue(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || '');
}

function jobPath(jobId) {
  return `jobs/${jobId}.json`;
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
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
  const { error } = await supabase.storage
    .from(EXPORT_BUCKET)
    .upload(jobPath(jobId), JSON.stringify({ ...payload, updatedAt: new Date().toISOString() }), {
      contentType: 'application/json',
      upsert: true,
    });

  if (error) throw error;
}

async function readJobStatus(supabase, jobId) {
  const { data, error } = await supabase.storage.from(EXPORT_BUCKET).download(jobPath(jobId));
  if (error) {
    return { statusCode: 404, body: { status: 'failed', message: 'Export job was not found. Please start a new export.' } };
  }

  return { statusCode: 200, body: JSON.parse(await data.text()) };
}

function baseUrl(event) {
  const envUrl = process.env.URL || process.env.DEPLOY_PRIME_URL || '';
  if (envUrl) return envUrl.replace(/\/$/, '');
  const host = event.headers.host || event.headers.Host;
  const proto = event.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${host}`;
}

export async function handler(event) {
  const supabase = serviceClient();
  const auth = await requireSuperAdmin(event, supabase);
  if (auth.error) return { statusCode: auth.status, body: auth.error };

  const jobId = event.queryStringParameters?.jobId;
  if (jobId) {
    const result = await readJobStatus(supabase, jobId);
    return json(result.statusCode, result.body);
  }

  const startDate = event.queryStringParameters?.startDate;
  const endDate = event.queryStringParameters?.endDate;
  const claimantId = event.queryStringParameters?.claimantId || '';

  if (!isDateValue(startDate) || !isDateValue(endDate)) {
    return { statusCode: 400, body: 'Use startDate=YYYY-MM-DD and endDate=YYYY-MM-DD.' };
  }

  if (claimantId && !isUuidValue(claimantId)) {
    return { statusCode: 400, body: 'Use a valid claimantId.' };
  }

  if (startDate > endDate) {
    return { statusCode: 400, body: 'Start date must be before or equal to end date.' };
  }

  try {
    await ensureExportBucket(supabase);
  } catch (bucketError) {
    return { statusCode: 500, body: `Could not prepare the export storage bucket: ${bucketError.message}` };
  }

  const nextJobId = randomUUID();
  await writeJobStatus(supabase, nextJobId, {
    status: 'pending',
    message: 'Export queued. Preparing the background job...',
    downloads: [],
  });

  const params = new URLSearchParams({
    jobId: nextJobId,
    startDate,
    endDate,
    ...(claimantId ? { claimantId } : {}),
  });

  try {
    await fetch(`${baseUrl(event)}/.netlify/functions/export-approved-background?${params.toString()}`, {
      headers: {
        Authorization: event.headers.authorization || event.headers.Authorization || '',
      },
    });
  } catch (error) {
    await writeJobStatus(supabase, nextJobId, {
      status: 'failed',
      message: `Could not start the background export: ${error.message}`,
      downloads: [],
    });
    return { statusCode: 500, body: `Could not start the background export: ${error.message}` };
  }

  return json(202, {
    jobId: nextJobId,
    status: 'pending',
    message: 'Export started. Links will appear here when the ZIP is ready.',
    downloads: [],
  });
}

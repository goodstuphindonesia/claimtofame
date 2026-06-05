import { normalizeSupabaseUrl } from './_supabase.js';

export async function handler() {
  const supabaseUrl = normalizeSupabaseUrl(process.env.SUPABASE_URL);
  const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabasePublishableKey) {
    return {
      statusCode: 500,
      body: 'Supabase runtime config is missing.',
    };
  }

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300',
    },
    body: JSON.stringify({ supabaseUrl, supabasePublishableKey }),
  };
}

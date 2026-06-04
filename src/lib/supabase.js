import { createClient } from '@supabase/supabase-js';

let clientPromise;

export async function getSupabaseClient() {
  if (!clientPromise) {
    clientPromise = fetch('/.netlify/functions/runtime-config')
      .then(async (response) => {
        if (!response.ok) throw new Error(await response.text());
        return response.json();
      })
      .then(({ supabaseUrl, supabasePublishableKey }) => {
        if (!supabaseUrl || !supabasePublishableKey) {
          throw new Error('Supabase runtime config is missing.');
        }
        return createClient(supabaseUrl, supabasePublishableKey);
      });
  }

  return clientPromise;
}

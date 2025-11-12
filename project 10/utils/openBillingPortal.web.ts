// utils/openBillingPortal.web.ts
import { supabase } from '@/utils/supabase';

const FUNCTION_URL =
  'https://fulzqbwojvrripsuoreh.supabase.co/functions/v1/stripe-portal';

export async function openBillingPortal(): Promise<void> {
  console.log('[openBillingPortal.web] start');

  // Get Supabase JWT
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    console.error('[openBillingPortal.web] getSession error', sessionError);
    throw new Error('Not authenticated');
  }
  const token = sessionData?.session?.access_token;
  if (!token) {
    console.error('[openBillingPortal.web] No JWT token');
    throw new Error('Not authenticated');
  }

  // IMPORTANT: credentials: 'omit' so CORS with '*' is allowed
  const res = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    credentials: 'omit', // <— THIS fixes the CORS error
    body: JSON.stringify({}),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    console.error('[openBillingPortal.web] error response', res.status, txt);
    throw new Error(txt || 'Server misconfiguration');
  }

  const json: { url?: string } = await res.json().catch(() => ({}));
  if (!json.url) {
    console.error('[openBillingPortal.web] Missing portal URL in response', json);
    throw new Error('No portal URL received');
  }

  // Navigate to Stripe portal
  window.location.assign(json.url);
}

// utils/openBillingPortal.native.ts
import { Linking } from 'react-native';
import { supabase } from '@/utils/supabase';

const FUNCTION_URL =
  'https://fulzqbwojvrripsuoreh.supabase.co/functions/v1/stripe-portal';

export async function openBillingPortal(): Promise<void> {
  console.log('[openBillingPortal.native] start');

  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();
  if (sessionError) {
    console.error('[openBillingPortal.native] getSession error', sessionError);
    throw new Error('Not authenticated');
  }
  const token = sessionData?.session?.access_token;
  if (!token) {
    console.error('[openBillingPortal.native] No JWT token');
    throw new Error('Not authenticated');
  }

  const res = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    // RN fetch has no cookies by default, so we are fine
    body: JSON.stringify({}),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    console.error('[openBillingPortal.native] error response', res.status, txt);
    throw new Error(txt || 'Server misconfiguration');
  }

  const json: { url?: string } = await res.json().catch(() => ({}));
  if (!json.url) {
    console.error('[openBillingPortal.native] Missing portal URL in response', json);
    throw new Error('No portal URL received');
  }

  // Open in system browser
  await Linking.openURL(json.url);
}

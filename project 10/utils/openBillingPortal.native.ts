// project 10/utils/openBillingPortal.native.ts
import { supabase } from './supabase';
import { Browser } from '@capacitor/browser';

/**
 * Native version
 * - Gets Supabase JWT and the user's stripe_customer_id
 * - Calls Netlify function with Authorization header and customerId in the body
 * - Opens Stripe portal in the system browser
 */
export async function openBillingPortal(): Promise<void> {
  // Ensure user is signed in and get token
  const { data: sessionData, error: sessErr } = await supabase.auth.getSession();
  if (sessErr) throw new Error('Not authenticated');
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('No access token');

  // Load stripe_customer_id from your profile row
  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userRes?.user) throw new Error('Invalid user');

  const userId = userRes.user.id;
  const { data: profile, error: profErr } = await supabase
    .from('profiles')                         // adjust if your table has a different name
    .select('stripe_customer_id')
    .eq('id', userId)
    .single();

  if (profErr) throw new Error(`Profile query error: ${profErr.message}`);
  const customerId = profile?.stripe_customer_id;
  if (!customerId) throw new Error('Stripe customer not found on profile');

  // Call Netlify function. No cookies. Bearer only.
  const res = await fetch('/.netlify/functions/portal', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ customerId }),
  });

  if (!res.ok) {
    const msg = await safeReadText(res);
    throw new Error(msg || `Portal function error ${res.status}`);
  }

  const { url } = await res.json();
  if (!url) throw new Error('Portal URL missing');

  // System browser on native
  await Browser.open({ url });
}

async function safeReadText(res: Response): Promise<string> {
  try { return await res.text(); } catch { return ''; }
}

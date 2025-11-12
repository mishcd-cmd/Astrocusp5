// project 10/utils/openBillingPortal.web.ts
import { supabase } from './supabase';

export async function openBillingPortal() {
  console.log('[openBillingPortal.web] start');

  // Get the current user id on the client
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user?.id) {
    console.error('[openBillingPortal.web] not authenticated', userErr);
    throw new Error('Not signed in');
  }

  // Call Netlify function - same origin, no CORS issues
  const res = await fetch('/.netlify/functions/portal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // Send user_id explicitly to avoid any cookie parsing edge cases on Netlify
    body: JSON.stringify({ user_id: userData.user.id }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('[openBillingPortal.web] error response', res.status, text);
    throw new Error(text || 'Server misconfiguration');
  }

  const { url } = await res.json();
  if (!url) {
    console.error('[openBillingPortal.web] no url returned');
    throw new Error('No portal url returned');
  }

  // Navigate to Stripe portal
  window.location.assign(url);
}

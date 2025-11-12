// project 10/utils/openBillingPortal.web.ts
import { supabase } from './supabase';

export async function openBillingPortal() {
  console.log('[openBillingPortal.web] start');
  const { data, error } = await supabase.auth.getSession();
  if (error || !data?.session?.access_token) {
    throw new Error('You must be signed in to manage billing');
  }
  const token = data.session.access_token;

  const res = await fetch('/.netlify/functions/portal', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    console.error('[openBillingPortal.web] error response', res.status, txt);
    throw new Error(txt || 'Server error');
  }

  const json = await res.json();
  if (!json?.url) {
    throw new Error('No portal URL returned');
  }
  // Navigate in same tab
  window.location.href = json.url;
}

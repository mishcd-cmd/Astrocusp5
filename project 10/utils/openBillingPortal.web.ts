// project 10/utils/openBillingPortal.web.ts
import { supabase } from './supabase';

export async function openBillingPortal() {
  const returnPath =
    typeof window !== 'undefined'
      ? window.location.pathname + window.location.search
      : '/settings';

  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Please sign in to manage your subscription.');

  const res = await fetch('/.netlify/functions/portal', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ returnPath }),
  });

  if (!res.ok) {
    const j = await res.json().catch(() => ({} as any));
    throw new Error(j?.error || `Portal failed (${res.status})`);
  }

  const data = await res.json();
  const url: string | undefined = data?.url;
  if (!url) throw new Error('No portal URL');

  // Web - same tab
  if (typeof window !== 'undefined') {
    window.location.href = url;
  }
}

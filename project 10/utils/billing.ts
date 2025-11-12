// utils/billing.ts
import { supabase } from '@/utils/supabase';

const CHECKOUT_URL =
  'https://fulzqbwojvrripsuoreh.supabase.co/functions/v1/checkout';

async function authToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data?.session?.access_token) {
    throw new Error('Not authenticated');
  }
  return data.session.access_token;
}

function siteBase(): string {
  // Use the origin that actually serves your app in production.
  // If your certificate is on WWW, keep the www host here.
  return window.location.origin;
}

async function startCheckout(params: {
  priceId: string;
  mode: 'subscription' | 'payment';
  successPath?: string; // e.g. '/settings?status=success'
  cancelPath?: string;  // e.g. '/settings?status=cancel'
}) {
  const token = await authToken();
  const base = siteBase();

  const res = await fetch(CHECKOUT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    credentials: 'omit', // <— CRITICAL for CORS
    body: JSON.stringify({
      priceId: params.priceId,
      mode: params.mode,
      successUrl: `${base}${params.successPath ?? '/settings?status=success'}`,
      cancelUrl: `${base}${params.cancelPath ?? '/settings?status=cancel'}`,
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(txt || 'Checkout failed');
  }

  const json = await res.json();
  if (!json?.url) throw new Error('No checkout URL received');
  window.location.assign(json.url);
}

export async function subscribeMonthly() {
  // replace with your real price id
  await startCheckout({ priceId: '<PRICE_MONTHLY_ID>', mode: 'subscription' });
}

export async function subscribeYearly() {
  await startCheckout({ priceId: '<PRICE_YEARLY_ID>', mode: 'subscription' });
}

export async function buyOneOffReading() {
  await startCheckout({ priceId: '<PRICE_ONEOFF_ID>', mode: 'payment' });
}

export async function upgradeToYearly() {
  // If you use a dedicated function for upgrades, use the same fetch + credentials: 'omit' pattern
  // or redirect to a prebuilt checkout with the yearly price.
  await subscribeYearly();
}

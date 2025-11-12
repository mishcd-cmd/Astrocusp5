// project10/utils/billing.ts
import { Platform, Linking } from 'react-native';
import { supabase } from './supabase';

// Read envs in both Expo + web builds
const PUB = (k: string) =>
  (process.env[k] ||
    (global as any).__env?.[k] ||
    undefined) as string | undefined;

const SUPABASE_URL =
  PUB('EXPO_PUBLIC_SUPABASE_URL') ||
  PUB('NEXT_PUBLIC_SUPABASE_URL') ||
  '';

const PRICE_MONTHLY = PUB('EXPO_PUBLIC_STRIPE_PRICE_MONTHLY') || '';
const PRICE_YEARLY  = PUB('EXPO_PUBLIC_STRIPE_PRICE_YEARLY')  || '';
const PRICE_ONEOFF  = PUB('EXPO_PUBLIC_STRIPE_PRICE_ONEOFF')  || '';

export function isStripeConfigured() {
  const ok = !!(PRICE_MONTHLY || PRICE_YEARLY || PRICE_ONEOFF);
  console.log('[Stripe] Configuration check result:', {
    monthly: !!PRICE_MONTHLY,
    yearly: !!PRICE_YEARLY,
    oneOff: !!PRICE_ONEOFF,
  });
  return ok;
}

// ---- helpers ----
async function getJWT() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message || 'Auth error');
  const token = data?.session?.access_token;
  if (!token) throw new Error('Not authenticated');
  return token;
}

async function openUrlSameTab(url: string) {
  if (Platform.OS === 'web') {
    window.location.assign(url);
  } else {
    await Linking.openURL(url);
  }
}

// ---- subscription status ----
export type SubStatus = {
  active: boolean;
  plan?: 'monthly' | 'yearly';
  renewsAt?: string;
  customerId?: string;
  price_id?: string;
  status?: string;
} | null;

export async function getSubscriptionStatus(): Promise<SubStatus> {
  const base = SUPABASE_URL;
  if (!base) throw new Error('Missing Supabase URL config');

  const token = await getJWT();

  const res = await fetch(`${base}/functions/v1/subscription-status`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    credentials: 'omit', // critical for CORS
  });

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(t || `subscription-status ${res.status}`);
  }
  return (await res.json()) as SubStatus;
}

// ---- portal ----
export async function openBillingPortal(): Promise<void> {
  const base = SUPABASE_URL;
  if (!base) throw new Error('Missing Supabase URL config');
  const token = await getJWT();

  const res = await fetch(`${base}/functions/v1/stripe-portal`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    credentials: 'omit',
    body: JSON.stringify({}),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(t || `stripe-portal ${res.status}`);
  }
  const { url } = await res.json();
  if (!url) throw new Error('Portal URL missing');
  await openUrlSameTab(url);
}

// ---- checkout (Netlify function you already have) ----
async function postCheckout(body: Record<string, unknown>) {
  const res = await fetch('/.netlify/functions/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = 'Checkout failed';
    try { msg = (await res.json())?.error || msg; } catch {}
    throw new Error(msg);
  }
  const { url } = await res.json();
  if (!url) throw new Error('No checkout URL returned');
  return url as string;
}

export async function subscribeMonthly() {
  if (!PRICE_MONTHLY) throw new Error('Monthly price not configured');
  const url = await postCheckout({ priceId: PRICE_MONTHLY, mode: 'subscription' });
  await openUrlSameTab(url);
}

export async function subscribeYearly() {
  if (!PRICE_YEARLY) throw new Error('Yearly price not configured');
  const url = await postCheckout({ priceId: PRICE_YEARLY, mode: 'subscription' });
  await openUrlSameTab(url);
}

export async function buyOneOffReading() {
  if (!PRICE_ONEOFF) throw new Error('One-off price not configured');
  const url = await postCheckout({ priceId: PRICE_ONEOFF, mode: 'payment' });
  await openUrlSameTab(url);
}

export async function upgradeToYearly() {
  // You can implement an upgrade Edge Function later.
  // For now redirect to the billing portal so the user can switch plan.
  await openBillingPortal();
}

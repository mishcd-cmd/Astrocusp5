// utils/billing.ts
// All named exports. No default export.
// Works in web and native. Uses Supabase JWT in Authorization header and credentials: 'omit'.

import { supabase } from '@/utils/supabase';

type SubPlan = 'monthly' | 'yearly';
export type SubStatus = {
  active: boolean;
  plan?: SubPlan;
  renewsAt?: string;
  customerId?: string;
  price_id?: string;
  status?: string;
} | null;

// Configure once, read everywhere
const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  ''; // required

// Canonical site URL for Stripe return links
const SITE_URL =
  process.env.EXPO_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  'https://www.astrocusp.com.au';

// Stripe Price IDs (set via env if you have them)
const PRICE_MONTHLY =
  process.env.EXPO_PUBLIC_STRIPE_PRICE_MONTHLY ||
  process.env.NEXT_PUBLIC_STRIPE_PRICE_MONTHLY ||
  ''; // e.g. price_123

const PRICE_YEARLY =
  process.env.EXPO_PUBLIC_STRIPE_PRICE_YEARLY ||
  process.env.NEXT_PUBLIC_STRIPE_PRICE_YEARLY ||
  ''; // e.g. price_abc

const PRICE_ONE_OFF =
  process.env.EXPO_PUBLIC_STRIPE_PRICE_ONEOFF ||
  process.env.NEXT_PUBLIC_STRIPE_PRICE_ONEOFF ||
  ''; // e.g. price_xyz

function assertSupabaseUrl() {
  if (!SUPABASE_URL) throw new Error('Missing SUPABASE_URL config');
}

async function getJwt(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data?.session?.access_token;
  if (!token) throw new Error('Not authenticated');
  return token;
}

async function callEdge<T = any>(
  path: '/functions/v1/checkout' | '/functions/v1/stripe-portal' | '/functions/v1/subscription-status',
  body: Record<string, any> = {}
): Promise<T> {
  assertSupabaseUrl();
  const token = await getJwt();

  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    // Important: do not send cookies from browser to avoid CORS with credentials
    credentials: 'omit',
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(txt || `Request failed ${res.status}`);
  }
  return (await res.json()) as T;
}

/**
 * Returns a minimal subscription snapshot for the current user.
 * If you do not yet have a subscription-status function, this returns inactive
 * so your UI loads safely. Replace call with your function when ready.
 */
export async function getSubscriptionStatus(): Promise<SubStatus> {
  // If you created a status function, uncomment the call and implement it in Supabase.
  // type StatusResp = { active: boolean; plan?: SubPlan; renewsAt?: string; customerId?: string; price_id?: string; status?: string };
  // const data = await callEdge<StatusResp>('/functions/v1/subscription-status');
  // return data || { active: false };

  // Safe default until your status function/table is ready
  return { active: false };
}

/** Start a monthly subscription via Checkout. */
export async function subscribeMonthly(): Promise<void> {
  if (!PRICE_MONTHLY) throw new Error('Monthly price is not configured');
  await startCheckout({
    priceId: PRICE_MONTHLY,
    mode: 'subscription',
  });
}

/** Start a yearly subscription via Checkout. */
export async function subscribeYearly(): Promise<void> {
  if (!PRICE_YEARLY) throw new Error('Yearly price is not configured');
  await startCheckout({
    priceId: PRICE_YEARLY,
    mode: 'subscription',
  });
}

/** Upgrade path. Replace with your real upgrade flow if different. */
export async function upgradeToYearly(): Promise<{ message: string }> {
  // Simplest approach: send the user to a yearly Checkout session
  await subscribeYearly();
  return { message: 'Redirecting to yearly checkout' };
}

/** One-off reading payment via Checkout. */
export async function buyOneOffReading(): Promise<void> {
  if (!PRICE_ONE_OFF) throw new Error('One-off price is not configured');
  await startCheckout({
    priceId: PRICE_ONE_OFF,
    mode: 'payment',
  });
}

/** Quick sanity check for UI buttons. */
export function isStripeConfigured(): boolean {
  return Boolean(SUPABASE_URL && (PRICE_MONTHLY || PRICE_YEARLY || PRICE_ONE_OFF));
}

/** Shared Checkout logic */
async function startCheckout(opts: {
  priceId: string;
  mode: 'subscription' | 'payment';
}): Promise<void> {
  const successUrl = `${SITE_URL}/settings?status=success`;
  const cancelUrl = `${SITE_URL}/settings?status=cancel`;

  await callEdge<{ url: string; sessionId: string }>('/functions/v1/checkout', {
    priceId: opts.priceId,
    mode: opts.mode,
    successUrl,
    cancelUrl,
  }).then(({ url }) => {
    if (!url) throw new Error('No checkout URL returned');
    // Same tab navigation in web; on native, your screen logic can handle Linking if desired
    if (typeof window !== 'undefined' && window.location) {
      window.location.href = url;
    }
  });
}

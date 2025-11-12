// project10/utils/billing.ts
// Full drop-in: provides all exports your screens expect.
// Web-first (React Native Web). Uses Stripe.js redirectToCheckout for subscribe/purchase.
// Reads your existing env vars and calls your Supabase Edge Function for status.

import { supabase } from '@/utils/supabase';

// Safe env getters
function getEnv(name: string) {
  return (
    (typeof process !== 'undefined' && (process.env as any)?.[name]) ||
    (globalThis as any)?.[name] ||
    ''
  );
}

// Public environment expected in your Netlify/Stackblitz setup
const SITE_URL = getEnv('EXPO_PUBLIC_SITE_URL') || getEnv('SITE_URL') || 'https://www.astrocusp.com.au';
const SUPABASE_URL = getEnv('EXPO_PUBLIC_SUPABASE_URL') || getEnv('NEXT_PUBLIC_SUPABASE_URL') || '';
const STRIPE_PUBLISHABLE_KEY = getEnv('EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY') || '';

// Your Stripe price ids (already configured in your env)
const PRICE_MONTHLY = getEnv('EXPO_PUBLIC_STRIPE_PRICE_MONTHLY') || '';
const PRICE_YEARLY  = getEnv('EXPO_PUBLIC_STRIPE_PRICE_YEARLY') || '';
const PRICE_ONEOFF  = getEnv('EXPO_PUBLIC_STRIPE_PRICE_ONEOFF') || '';

// Edge Function names you provided in Supabase
const FN_STATUS = 'rapid-endpoint';   // returns subscription status JSON
// The portal is handled by utils/openBillingPortal.ts calling 'swift-api'

// Types
export type SubStatus =
  | {
      active: boolean;
      plan?: 'monthly' | 'yearly' | null;
      renewsAt?: string | null;
      customerId?: string | null;
      price_id?: string | null;
      status?: string;
      email?: string | null;
    }
  | null;

// Utility: get the current session token
async function getToken(): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error('[billing] auth.getSession error', error);
    return null;
  }
  return data?.session?.access_token || null;
}

// 1) Check subscription status via your Supabase Edge Function
export async function getSubscriptionStatus(): Promise<SubStatus> {
  try {
    if (!SUPABASE_URL) {
      console.error('[billing] Missing EXPO_PUBLIC_SUPABASE_URL');
      return { active: false, status: 'error:missing_supabase_url' };
    }
    const token = await getToken();
    if (!token) {
      return { active: false, status: 'error:no_token' };
    }

    const url = `${SUPABASE_URL}/functions/v1/${FN_STATUS}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      credentials: 'omit',
      body: JSON.stringify({}),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('[billing] status bad response', res.status, text);
      return { active: false, status: `error:${res.status}` };
    }

    const json = await res.json().catch(() => ({} as any));
    return {
      active: !!json.active,
      plan: json.plan ?? null,
      renewsAt: json.renewsAt ?? null,
      customerId: json.customerId ?? null,
      price_id: json.price_id ?? null,
      status: json.status ?? 'unknown',
      email: json.email ?? null,
    };
  } catch (e: any) {
    console.error('[billing] getSubscriptionStatus exception', e?.message || e);
    return { active: false, status: 'error:exception' };
  }
}

// 2) Stripe Checkout helpers (web)
// We load Stripe.js lazily so it only loads when needed
async function getStripe() {
  if (typeof window === 'undefined') {
    throw new Error('Stripe Checkout is only supported on web');
  }
  if (!STRIPE_PUBLISHABLE_KEY) {
    throw new Error('Stripe publishable key missing');
  }
  // dynamic import
  const { loadStripe } = await import('@stripe/stripe-js');
  const stripe = await loadStripe(STRIPE_PUBLISHABLE_KEY);
  if (!stripe) throw new Error('Failed to load Stripe.js');
  return stripe;
}

// Common redirect to checkout
async function redirectToCheckout(params: {
  price: string;
  mode: 'subscription' | 'payment';
}) {
  const stripe = await getStripe();
  const success = `${SITE_URL}/settings/subscription?success=1`;
  const cancel  = `${SITE_URL}/settings/subscription?canceled=1`;

  const result = await stripe.redirectToCheckout({
    lineItems: [{ price: params.price, quantity: 1 }],
    mode: params.mode,
    successUrl: success,
    cancelUrl: cancel,
  });

  if (result.error) {
    // Stripe returns an error object if the redirect was blocked or invalid
    throw new Error(result.error.message || 'Stripe redirect failed');
  }
}

// 3) Actions your screens call

export async function subscribeMonthly(): Promise<void> {
  if (!PRICE_MONTHLY) throw new Error('Monthly price not configured');
  await redirectToCheckout({ price: PRICE_MONTHLY, mode: 'subscription' });
}

export async function subscribeYearly(): Promise<void> {
  if (!PRICE_YEARLY) throw new Error('Yearly price not configured');
  await redirectToCheckout({ price: PRICE_YEARLY, mode: 'subscription' });
}

export async function buyOneOffReading(): Promise<void> {
  if (!PRICE_ONEOFF) throw new Error('One-off price not configured');
  await redirectToCheckout({ price: PRICE_ONEOFF, mode: 'payment' });
}

// Optional simple upgrade helper: just send user to the yearly checkout
// In a real system you would call a secured backend to swap subscriptions.
export async function upgradeToYearly(): Promise<{ ok: true; message: string }> {
  await subscribeYearly();
  return { ok: true, message: 'Redirecting to yearly checkout' };
}

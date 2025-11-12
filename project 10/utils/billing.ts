// project10/utils/billing.ts
import { supabase } from '@/utils/supabase';
import { getStripe, isStripeConfigured as _isStripeConfigured } from '@/utils/stripe';

const BASE =
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  '';

const PRICE_MONTHLY = process.env.EXPO_PUBLIC_STRIPE_PRICE_MONTHLY || '';
const PRICE_YEARLY = process.env.EXPO_PUBLIC_STRIPE_PRICE_YEARLY || '';
const PRICE_ONEOFF = process.env.EXPO_PUBLIC_STRIPE_PRICE_ONEOFF || '';

const FN_SUB_STATUS = 'rapid-endpoint'; // your subscription-status function name
const FN_STRIPE_PORTAL = 'swift-api';   // your stripe-portal function name

type SubStatus = {
  active: boolean;
  plan?: 'monthly' | 'yearly' | null;
  renewsAt?: string | null;
  customerId?: string | null;
  price_id?: string | null;
  status?: string;
  email?: string | null;
} | null;

export function isStripeConfigured() {
  return _isStripeConfigured();
}

async function getSessionToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message || 'auth.getSession failed');
  const token = data?.session?.access_token;
  if (!token) throw new Error('Not authenticated');
  return token;
}

export async function getSubscriptionStatus(): Promise<SubStatus> {
  try {
    if (!BASE) {
      console.error('[billing] Missing Supabase URL config');
      return { active: false, status: 'error:missing_base' };
    }
    const token = await getSessionToken();

    const res = await fetch(`${BASE}/functions/v1/${FN_SUB_STATUS}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      credentials: 'omit',
      body: JSON.stringify({}),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('[billing] sub-status bad response', res.status, text);
      return { active: false, status: `error:${res.status}` };
    }

    const json = await res.json().catch(() => ({}));
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

async function launchStripeCheckout(priceId: string) {
  if (!isStripeConfigured()) {
    throw new Error('Stripe not configured (prices or publishable key missing).');
  }
  const stripe = await getStripe();

  const token = await getSessionToken();
  // Create a Checkout Session via your Edge Function (recommended),
  // or redirectToCheckout with just a price on the client if you’ve set that up.
  // Here we use client-only quick flow:
  const result = await stripe.redirectToCheckout({
    lineItems: [{ price: priceId, quantity: 1 }],
    mode: 'subscription',
    successUrl: `${process.env.EXPO_PUBLIC_SITE_URL || 'https://www.astrocusp.com.au'}/subscription?success=true`,
    cancelUrl: `${process.env.EXPO_PUBLIC_SITE_URL || 'https://www.astrocusp.com.au'}/subscription?canceled=true`,
    clientReferenceId: token, // optional
  });

  if (result.error) {
    throw new Error(result.error.message || 'Stripe redirect failed');
  }
}

export async function subscribeMonthly() {
  if (!PRICE_MONTHLY) throw new Error('Monthly price not configured');
  return launchStripeCheckout(PRICE_MONTHLY);
}

export async function subscribeYearly() {
  if (!PRICE_YEARLY) throw new Error('Yearly price not configured');
  return launchStripeCheckout(PRICE_YEARLY);
}

export async function buyOneOffReading() {
  if (!PRICE_ONEOFF) throw new Error('One-off price not configured');
  const stripe = await getStripe();

  const result = await stripe.redirectToCheckout({
    lineItems: [{ price: PRICE_ONEOFF, quantity: 1 }],
    mode: 'payment',
    successUrl: `${process.env.EXPO_PUBLIC_SITE_URL || 'https://www.astrocusp.com.au'}/subscription?success=true`,
    cancelUrl: `${process.env.EXPO_PUBLIC_SITE_URL || 'https://www.astrocusp.com.au'}/subscription?canceled=true`,
  });

  if (result.error) {
    throw new Error(result.error.message || 'Stripe redirect failed');
  }
}

export async function upgradeToYearly() {
  // If you plan to use a server-side upgrade (recommended), call an Edge Function here.
  // Placeholder for now:
  throw new Error('Upgrade flow not implemented yet — use billing portal to change plan.');
}

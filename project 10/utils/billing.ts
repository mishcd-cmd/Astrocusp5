// Path: project10/utils/billing.ts

import { supabase } from '@/utils/supabase';
import {
  checkoutSubscription,
  checkoutOneTime,
} from '@/utils/stripe';

// -------- Types --------
export type Plan = 'monthly' | 'yearly';

export type SubStatus = {
  active: boolean;
  plan?: Plan | null;
  renewsAt?: string | null;
  customerId?: string | null;
  price_id?: string | null;
  status?: string;
  email?: string | null;
} | null;

// -------- Env helpers --------
const BASE =
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL;

const PRICE_MONTHLY = process.env.EXPO_PUBLIC_STRIPE_PRICE_MONTHLY || '';
const PRICE_YEARLY  = process.env.EXPO_PUBLIC_STRIPE_PRICE_YEARLY  || '';
const PRICE_ONEOFF  = process.env.EXPO_PUBLIC_STRIPE_PRICE_ONEOFF  || '';

function requireBase() {
  if (!BASE) throw new Error('Missing Supabase URL config');
}

function requireAuthToken(session: Awaited<ReturnType<typeof supabase.auth.getSession>>['data']) {
  const token = session?.session?.access_token;
  if (!token) throw new Error('Not authenticated');
  return token;
}

function ensurePrice(id: string, label: string) {
  if (!id || id.trim() === '') throw new Error(`${label} price not configured`);
  return id;
}

// -------- API: subscription status (Edge Function) --------
export async function getSubscriptionStatus(): Promise<SubStatus> {
  requireBase();

  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message || 'Auth error');
  const token = requireAuthToken(data);

  const res = await fetch(`${BASE}/functions/v1/subscription-status`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    credentials: 'omit', // important for CORS
    body: JSON.stringify({}),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(txt || `subscription-status error ${res.status}`);
  }

  return (await res.json()) as SubStatus;
}

// -------- Actions: checkout helpers --------
export async function subscribeMonthly(): Promise<void> {
  const priceId = ensurePrice(PRICE_MONTHLY, 'Monthly');
  await checkoutSubscription({
    priceId,
    // optional success/cancel — omit to let your Netlify function default/returnPath handle it
  });
}

export async function subscribeYearly(): Promise<void> {
  const priceId = ensurePrice(PRICE_YEARLY, 'Yearly');
  await checkoutSubscription({
    priceId,
  });
}

// Simple upgrade path: send the user to a new checkout for the yearly price
// (Stripe will handle proration if you enable it in the price/product settings)
export async function upgradeToYearly(): Promise<{ message: string }> {
  const priceId = ensurePrice(PRICE_YEARLY, 'Yearly');
  await checkoutSubscription({
    priceId,
  });
  return { message: 'Redirecting to upgrade checkout…' };
}

export async function buyOneOffReading(): Promise<void> {
  const priceId = ensurePrice(PRICE_ONEOFF, 'One-off');
  await checkoutOneTime({
    priceId,
  });
}

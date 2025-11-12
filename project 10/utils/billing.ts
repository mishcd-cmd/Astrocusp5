// project10/utils/billing.ts
// Client helpers for subscription status and subscription actions.
// Adjusted to your actual Supabase Edge Function routes:
//  - Status:  /functions/v1/rapid-endpoint
//  - Portal:  /functions/v1/swift-api  (opened via openBillingPortal)

import { supabase } from '@/utils/supabase';
import { openBillingPortal } from '@/utils/openBillingPortal';

const BASE =
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL;

// Optional product price IDs - only used if you later add a "checkout" Edge Function
const PRICE_MONTHLY = process.env.EXPO_PUBLIC_STRIPE_PRICE_MONTHLY;
const PRICE_YEARLY  = process.env.EXPO_PUBLIC_STRIPE_PRICE_YEARLY;
const PRICE_ONEOFF  = process.env.EXPO_PUBLIC_STRIPE_PRICE_ONEOFF;

export type SubStatus = {
  active: boolean;
  plan?: 'monthly' | 'yearly' | null;
  renewsAt?: string | null;
  customerId?: string | null;
  price_id?: string | null;
  status?: string;
  email?: string | null;
} | null;

/**
 * Quick config check used by your screen to warn the user.
 */
export function isStripeConfigured(): boolean {
  // Publishable key is checked elsewhere. Here we only guard "prices exist".
  return Boolean(PRICE_MONTHLY || PRICE_YEARLY || PRICE_ONEOFF);
}

/**
 * Reads subscription status from your Edge Function.
 * Your function URL is .../functions/v1/rapid-endpoint
 */
export async function getSubscriptionStatus(): Promise<SubStatus> {
  try {
    if (!BASE) {
      console.error('[billing] Missing Supabase URL config');
      return { active: false, status: 'error:missing_base' };
    }

    const { data, error } = await supabase.auth.getSession();
    if (error) {
      console.error('[billing] auth.getSession error', error);
      return { active: false, status: 'error:no_session' };
    }

    const token = data?.session?.access_token;
    if (!token) {
      console.warn('[billing] No session token');
      return { active: false, status: 'error:no_token' };
    }

    // Call your status function name
    const url = `${BASE}/functions/v1/rapid-endpoint`;

    const res = await fetch(url, {
      method: 'POST', // use POST to be safe with CORS
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      credentials: 'omit',
      body: JSON.stringify({}),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('[billing] rapid-endpoint bad response', res.status, text);
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

/**
 * Until you add a dedicated "checkout" Edge Function,
 * we will open the Billing Portal as a temporary path to subscribe.
 * Stripe Billing Portal can be configured to let users purchase products.
 * If you have not enabled that in Stripe, it will still let users manage billing.
 */

// Start monthly subscription
export async function subscribeMonthly(): Promise<void> {
  // If later you add a "checkout" function, call it here with PRICE_MONTHLY.
  await openBillingPortal();
}

// Start yearly subscription
export async function subscribeYearly(): Promise<void> {
  // If later you add a "checkout" function, call it here with PRICE_YEARLY.
  await openBillingPortal();
}

// Buy one-off reading
export async function buyOneOffReading(): Promise<void> {
  // If later you add a "checkout" function, call it here with PRICE_ONEOFF.
  await openBillingPortal();
}

// Upgrade monthly to yearly
export async function upgradeToYearly(): Promise<{ ok: boolean; message: string } | null> {
  // For now, route to portal so they can change plan there.
  await openBillingPortal();
  return { ok: true, message: 'Opening billing portal to upgrade your plan.' };
}

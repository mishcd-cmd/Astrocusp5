// project10/utils/stripe.ts
// Works on web (relative Netlify function path) and native (absolute SITE_URL)

import { Platform } from 'react-native';
import { supabase } from './supabase';
import { SITE_URL } from './urls';
import {
  isStripeConfigured,
  getSubscriptionProducts,
  type StripeProduct,
} from './stripeConfig';

// Re-export for convenience in screens
export { isStripeConfigured } from './stripeConfig';

export interface SubscriptionData {
  customer_id: string;
  subscription_id: string | null;
  subscription_status: string;
  price_id: string | null;
  current_period_start: number | null;
  current_period_end: number | null;
  cancel_at_period_end: boolean;
  payment_method_brand: string | null;
  payment_method_last4: string | null;
}

export interface OrderData {
  order_id: number;
  checkout_session_id: string;
  payment_intent_id: string;
  amount_subtotal: number;
  amount_total: number;
  currency: string;
  payment_status: string;
  order_status: string;
  order_date: string;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

/**
 * Use a relative path on web (so Netlify previews and custom domains Just Work),
 * but an absolute URL on native (since there is no concept of current origin).
 */
function resolveCheckoutEndpoint(): string {
  const path = '/.netlify/functions/checkout';
  if (Platform.OS === 'web' && isBrowser()) {
    return path; // relative to current origin (Netlify site)
  }
  // Native: must be absolute
  return `${SITE_URL.replace(/\/+$/, '')}${path}`;
}

function getReturnPath(): string {
  if (!isBrowser()) return '/';
  return window.location.pathname + window.location.search;
}

async function openUrl(url: string) {
  if (Platform.OS === 'web') {
    // Same-tab navigation to keep back-stack sensible inside your app
    window.location.assign(url);
  } else {
    const Linking = await import('expo-linking');
    const canOpen = await Linking.canOpenURL(url);
    if (!canOpen) throw new Error('Cannot open payment page on this device.');
    await Linking.openURL(url);
  }
}

async function postCheckout(body: Record<string, unknown>): Promise<string> {
  const endpoint = resolveCheckoutEndpoint();
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'omit', // keep cross-origin clean
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let errText = `Checkout failed (${res.status})`;
    try {
      const j = await res.json();
      errText = j?.error || errText;
    } catch {
      // ignore JSON parse errors
    }
    throw new Error(errText);
  }

  const data = await res.json().catch(() => ({} as any));
  const url = data?.url as string | undefined;
  if (!url) throw new Error('No checkout URL returned');
  return url;
}

// -----------------------------------------------------------------------------
// Main checkout entry points (Netlify Function powered)
// -----------------------------------------------------------------------------

export async function checkoutSubscription({
  priceId,
  successUrl,
  cancelUrl,
}: {
  priceId: string;
  successUrl?: string;
  cancelUrl?: string;
}) {
  console.log('=== START CHECKOUT (subscription) ===', { priceId });

  if (!isStripeConfigured()) {
    throw new Error('Stripe is not configured. Please contact support.');
  }

  // Optional: include user email to prefill Checkout
  let email: string | undefined;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    email = session?.user?.email ?? undefined;
  } catch {
    /* ignore */
  }

  const url = await postCheckout({
    priceId,
    mode: 'subscription',
    successUrl,
    cancelUrl,
    email,
    returnPath: getReturnPath(), // so we can jump back to where the user started
  });

  await openUrl(url);
}

export async function checkoutOneTime({
  priceId,
  successUrl,
  cancelUrl,
}: {
  priceId: string;
  successUrl?: string;
  cancelUrl?: string;
}) {
  console.log('=== START CHECKOUT (one-time) ===', { priceId });

  const url = await postCheckout({
    priceId,
    mode: 'payment',
    successUrl,
    cancelUrl,
    returnPath: getReturnPath(),
  });

  await openUrl(url);
}

// -----------------------------------------------------------------------------
// Legacy API (kept for compatibility) — forwards to Netlify
// -----------------------------------------------------------------------------

export async function createCheckoutSession(
  priceId: string,
  mode: 'payment' | 'subscription',
  successUrl: string,
  cancelUrl: string
): Promise<{ sessionId?: string; url?: string; error?: string }> {
  try {
    if (!isStripeConfigured()) {
      return { error: 'Stripe is not configured. Please set up your Stripe keys.' };
    }
    const url = await postCheckout({
      priceId,
      mode,
      successUrl,
      cancelUrl,
      returnPath: getReturnPath(),
    });
    return { url };
  } catch (err: any) {
    return { error: err?.message || 'Failed to create checkout session' };
  }
}

// -----------------------------------------------------------------------------
// Supabase-backed queries (unchanged logic)
// -----------------------------------------------------------------------------

export async function getUserSubscription(): Promise<SubscriptionData | null> {
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) return null;

    // NOTE: If your table uses Supabase user id vs Stripe customer id, adjust this filter.
    const { data, error } = await supabase
      .from('stripe_user_subscriptions')
      .select('*')
      .eq('customer_id', session.user.id)
      .maybeSingle();

    if (error) {
      console.error('Error fetching subscription:', error);
      return null;
    }
    return data;
  } catch (error) {
    console.error('Error fetching subscription:', error);
    return null;
  }
}

export async function getUserOrders(): Promise<OrderData[]> {
  try {
    const { data, error } = await supabase
      .from('stripe_user_orders')
      .select('*')
      .order('order_date', { ascending: false });

    if (error) {
      console.error('Error fetching orders:', error);
      return [];
    }
    return data || [];
  } catch (error) {
    console.error('Error fetching orders:', error);
    return [];
  }
}

export async function hasActiveSubscription(): Promise<boolean> {
  try {
    const { getSubscriptionStatus } = await import('./billing');
    const status = await getSubscriptionStatus();
    return !!status?.active;
  } catch (error) {
    console.error('Error checking subscription status:', error);
    return false;
  }
}

export function getSubscriptionProduct(priceId: string): StripeProduct | null {
  const products = getSubscriptionProducts();
  return products.find(p => p.priceId === priceId && p.mode === 'subscription') || null;
}

export async function getCurrentPlanName(): Promise<string> {
  try {
    const subscription = await getUserSubscription();
    if (!subscription?.price_id) return 'Free Plan';
    const products = getSubscriptionProducts();
    const product = products.find(p => p.priceId === subscription.price_id);
    return product?.name || 'Unknown Plan';
  } catch (error) {
    console.error('Error getting plan name:', error);
    return 'Free Plan';
  }
}

export function formatCurrency(amount: number, currency: string = 'AUD'): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}

export async function isSubscriptionCancelled(): Promise<boolean> {
  try {
    const subscription = await getUserSubscription();
    if (!subscription) return false;
    return (
      subscription.cancel_at_period_end ||
      subscription.subscription_status === 'canceled'
    );
  } catch (error) {
    console.error('Error checking cancellation status:', error);
    return false;
  }
}

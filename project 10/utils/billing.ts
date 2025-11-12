// utils/billing.ts
import { supabase } from '@/utils/supabase';

const FUNCTIONS_BASE = 'https://fulzqbwojvrripsuoreh.supabase.co/functions/v1';
const CHECKOUT_URL = `${FUNCTIONS_BASE}/checkout`;

type CheckoutMode = 'subscription' | 'payment';

async function callCheckout(priceId: string, mode: CheckoutMode) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error('Not authenticated');
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error('Not authenticated');

  // Optional return URLs - if you pass them they must match your SITE_URL origin
  const body: any = {
    priceId,
    mode,
    // successUrl: 'https://astrocusp.com.au/settings?status=success',
    // cancelUrl: 'https://astrocusp.com.au/settings?status=cancel',
  };

  const res = await fetch(CHECKOUT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    credentials: 'omit', // important on web
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(txt || 'Checkout failed');
  }

  const json = await res.json();
  if (!json?.url) throw new Error('No checkout URL returned');

  // open Stripe Checkout
  if (typeof window !== 'undefined') {
    window.location.href = json.url;
  } else {
    // native: use a WebBrowser or InAppBrowser in your caller if needed
    // but most likely you trigger this from web screens
  }
}

export async function subscribeMonthly() {
  // replace with your real monthly price id
  const MONTHLY_PRICE_ID = 'price_xxx_monthly';
  return callCheckout(MONTHLY_PRICE_ID, 'subscription');
}

export async function subscribeYearly() {
  // replace with your real yearly price id
  const YEARLY_PRICE_ID = 'price_xxx_yearly';
  return callCheckout(YEARLY_PRICE_ID, 'subscription');
}

export async function upgradeToYearly() {
  // strategy: send the yearly subscription checkout
  await subscribeYearly();
  return { message: 'Redirecting to Stripe for yearly plan' };
}

export async function buyOneOffReading() {
  // replace with your one off price id
  const ONE_OFF_PRICE_ID = 'price_xxx_oneoff';
  return callCheckout(ONE_OFF_PRICE_ID, 'payment');
}

export async function getSubscriptionStatus() {
  // your existing implementation can stay as is
  // it likely reads from your Supabase tables synced by the webhook
  try {
    const { data: session } = await supabase.auth.getSession();
    if (!session?.session?.user) return { active: false };

    // example: read your stripe_subscriptions table
    const { data } = await supabase
      .from('stripe_subscriptions')
      .select('status, price_id, current_period_end')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!data) return { active: false };

    const plan =
      data.price_id?.toLowerCase().includes('year') ? 'yearly' :
      data.price_id?.toLowerCase().includes('month') ? 'monthly' :
      undefined;

    return {
      active: data.status === 'active' || data.status === 'trialing',
      plan,
      renewsAt: data.current_period_end
        ? new Date(data.current_period_end * 1000).toISOString()
        : undefined,
      status: data.status,
      price_id: data.price_id,
    };
  } catch {
    return { active: false };
  }
}

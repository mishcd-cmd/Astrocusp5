// netlify/functions/portal.ts
import type { Handler } from '@netlify/functions';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: '2024-06-20',
});

// We’ll use the service role so we can read mapping tables regardless of RLS.
// Make sure these 3 env vars are set in Netlify!
const supabaseUrl = process.env.SUPABASE_URL as string;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

const handler: Handler = async (event) => {
  try {
    if (event.httpMethod === 'OPTIONS') {
      return {
        statusCode: 204,
        headers: {
          'Access-Control-Allow-Origin': process.env.SITE_URL || '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'content-type, authorization',
          'Access-Control-Allow-Credentials': 'true',
        },
        body: '',
      };
    }

    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method not allowed' };
    }

    if (!process.env.STRIPE_SECRET_KEY || !supabaseUrl || !supabaseServiceKey) {
      return { statusCode: 500, body: 'Server misconfiguration' };
    }

    // Extract Supabase access token from cookie (Netlify passes headers in event.headers)
    // Supabase sets sb-access-token and sb-refresh-token cookies on your custom domain.
    const cookie = event.headers.cookie || '';
    const sbAccessToken =
      decodeURIComponent(
        (cookie.match(/(?:^|;\s*)sb-access-token=([^;]+)/)?.[1] || '').trim(),
      ) || undefined;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Try to identify the user (optional but good for consistency).
    // If you don’t want to validate the JWT here, you can also accept a user_id in the POST body
    // and look up directly — but validating is safer.
    let userId: string | null = null;

    if (sbAccessToken) {
      const { data: jwtUser } = await supabase.auth.getUser(sbAccessToken);
      userId = jwtUser?.user?.id ?? null;
    }

    // Fallback: also accept user_id in JSON body (useful if cookies are domain-scope tricky)
    if (!userId && event.body) {
      try {
        const parsed = JSON.parse(event.body);
        if (typeof parsed?.user_id === 'string') userId = parsed.user_id;
      } catch {
        // ignore parse error
      }
    }

    if (!userId) {
      return { statusCode: 401, body: 'Not authenticated' };
    }

    // 1) Prefer the new column user_profiles.stripe_customer_id
    let customerId: string | null = null;

    const { data: profileRow, error: profileErr } = await supabase
      .from('user_profiles')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (profileErr) {
      // Not fatal — just log.
      console.error('[portal] profile fetch error:', profileErr);
    } else {
      customerId = profileRow?.stripe_customer_id ?? null;
    }

    // 2) Fallback to stripe_customers mapping
    if (!customerId) {
      const { data: mapRow, error: mapErr } = await supabase
        .from('stripe_customers')
        .select('customer_id')
        .eq('user_id', userId)
        .maybeSingle();
      if (mapErr) {
        console.error('[portal] stripe_customers fetch error:', mapErr);
      } else {
        customerId = mapRow?.customer_id ?? null;
      }
    }

    if (!customerId) {
      // No subscription yet — tell client to start a plan first.
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'No Stripe customer found. Start a subscription first.' }),
      };
    }

    // Create Billing Portal session
    const returnUrl =
      process.env.SITE_URL
        ? `${process.env.SITE_URL}/settings/account`
        : 'https://www.astrocusp.com.au/settings/account';

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: session.url }),
    };
  } catch (err: any) {
    console.error('[portal] fatal error:', err);
    return {
      statusCode: 500,
      body: 'Internal error',
    };
  }
};

export { handler };

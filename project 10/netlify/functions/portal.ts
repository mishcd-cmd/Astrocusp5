// netlify/functions/portal.ts
import type { Handler } from '@netlify/functions';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

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

    // Required env vars
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!stripeKey || !supabaseUrl || !supabaseServiceKey) {
      console.error('[portal] Missing envs', {
        hasStripe: !!stripeKey,
        hasUrl: !!supabaseUrl,
        hasServiceKey: !!supabaseServiceKey,
      });
      return { statusCode: 500, body: 'Server misconfiguration' };
    }

    const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse body for user_id
    let userId: string | null = null;
    try {
      const body = event.body ? JSON.parse(event.body) : {};
      if (typeof body?.user_id === 'string') userId = body.user_id;
    } catch {
      // ignore parse error
    }

    if (!userId) {
      console.error('[portal] Missing user_id in request body');
      return { statusCode: 401, body: 'Not authenticated' };
    }

    // 1) Prefer user_profiles.stripe_customer_id
    let customerId: string | null = null;

    const { data: profileRow, error: profileErr } = await supabase
      .from('user_profiles')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (profileErr) console.error('[portal] profile fetch error', profileErr);
    customerId = profileRow?.stripe_customer_id ?? null;

    // 2) Fallback to stripe_customers mapping
    if (!customerId) {
      const { data: mapRow, error: mapErr } = await supabase
        .from('stripe_customers')
        .select('customer_id')
        .eq('user_id', userId)
        .maybeSingle();
      if (mapErr) console.error('[portal] stripe_customers fetch error', mapErr);
      customerId = mapRow?.customer_id ?? null;
    }

    if (!customerId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'No Stripe customer found. Start a subscription first.' }),
      };
    }

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
    console.error('[portal] fatal error', err);
    return { statusCode: 500, body: 'Internal error' };
  }
};

export { handler };

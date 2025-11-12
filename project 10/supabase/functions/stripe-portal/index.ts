import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import Stripe from 'npm:stripe@17.7.0'
import { createClient } from 'npm:@supabase/supabase-js@2.49.1'

/**
 * IMPORTANT:
 * - Client must call this with Authorization: Bearer <supabase_jwt>
 * - Use fetch(..., { credentials: 'omit' }) on web
 * - CORS '*' is fine since we are not using cookies
 */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function normalizeSiteUrl(raw?: string): string {
  let base = (raw && raw.trim()) || 'https://astrocusp.com.au'
  base = base.replace(/^http:\/\//i, 'https://')
  base = base.replace(/^https:\/\/www\./i, 'https://')
  base = base.replace(/\/+$/, '')
  return base
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const siteUrl = normalizeSiteUrl(Deno.env.get('SITE_URL'))

    if (!stripeSecret || !supabaseUrl || !supabaseServiceKey) {
      console.error('[portal] Missing required environment variables')
      return new Response(JSON.stringify({ error: 'Server misconfiguration' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const stripe = new Stripe(stripeSecret, { apiVersion: '2024-06-20' })
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Auth via Supabase JWT
    const authHeader = req.headers.get('authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const jwt = authHeader.replace('Bearer ', '')

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(jwt)

    if (userError || !user) {
      console.error('[portal] Auth error:', userError)
      return new Response(JSON.stringify({ error: 'Invalid authentication' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Find Stripe customer
    const { data: sc, error: scError } = await supabase
      .from('stripe_customers')
      .select('customer_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (scError) {
      console.error('[portal] DB error fetching stripe_customers:', scError)
      return new Response(JSON.stringify({ error: 'Database error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!sc?.customer_id) {
      console.warn('[portal] Missing customer_id for user:', user.id, user.email)
      return new Response(JSON.stringify({ error: 'Missing customerId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Create Stripe Billing Portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: sc.customer_id,
      return_url: `${siteUrl}/settings?portal=done`,
    })

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    console.error('❌ [portal] Error:', error)
    return new Response(JSON.stringify({ error: error.message || 'Portal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

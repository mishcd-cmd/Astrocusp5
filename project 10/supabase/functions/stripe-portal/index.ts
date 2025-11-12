// supabase/functions/stripe-portal/index.ts
// Creates a Stripe Billing Portal session and returns { url }

// ---- Minimal inline CORS helpers ----
function corsHeaders(origin?: string) {
  const allowed = new Set<string>([
    'https://www.astrocusp.com.au',
    'https://astrocusp.com.au',
    'http://localhost:3000',
    'http://localhost:19006',
    'http://127.0.0.1:3000',
  ])
  const allowOrigin = origin && allowed.has(origin) ? origin : 'https://www.astrocusp.com.au'
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}
function handleOptions(req: Request) {
  const origin = req.headers.get('origin') ?? undefined
  return new Response('ok', { headers: corsHeaders(origin) })
}
// -------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleOptions(req)
  const origin = req.headers.get('origin') ?? undefined

  try {
    const auth = req.headers.get('Authorization') || ''
    if (!auth.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing Bearer token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      })
    }

    const jwt = auth.replace('Bearer ', '')

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
    const url = Deno.env.get('SUPABASE_URL')!
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(url, key, { auth: { persistSession: false } })

    const { data: user } = await supabase.auth.getUser(jwt)
    const userId = user?.user?.id
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthenticated' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      })
    }

    // Look up the Stripe customer id from your table
    const { data: sub } = await supabase
      .from('stripe_user_subscriptions')
      .select('stripe_customer_id, customer_id')
      .eq('customer_id', userId)
      .maybeSingle()

    const stripeCustomerId =
      sub?.stripe_customer_id || sub?.customer_id || Deno.env.get('STRIPE_FALLBACK_CUSTOMER_ID')

    if (!stripeCustomerId) {
      return new Response(JSON.stringify({ error: 'No Stripe customer' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      })
    }

    const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY')!
    const resp = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeSecret}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        customer: stripeCustomerId,
        return_url: origin || 'https://www.astrocusp.com.au',
      }),
    })
    const j = await resp.json()

    if (!resp.ok) {
      console.error('[stripe-portal] error', j)
      return new Response(JSON.stringify({ error: j?.error?.message || 'Stripe error' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      })
    }

    return new Response(JSON.stringify({ url: j?.url }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    })
  } catch (err) {
    console.error('[stripe-portal] error', err)
    return new Response(JSON.stringify({ error: 'Unexpected error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    })
  }
})

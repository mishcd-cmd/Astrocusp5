// supabase/functions/subscription-status/index.ts
// Returns { active, plan, renewsAt, customerId, price_id, status }

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
  
      const { data, error } = await supabase
        .from('stripe_user_subscriptions')
        .select('*')
        .eq('customer_id', userId)
        .maybeSingle()
  
      if (error) throw error
  
      const isActive =
        !!data && ['active', 'trialing', 'past_due'].includes((data.subscription_status || '').toLowerCase())
  
      const result = {
        active: isActive,
        plan: data?.price_id?.toLowerCase()?.includes('year') ? 'yearly' : isActive ? 'monthly' : undefined,
        renewsAt: data?.current_period_end ? new Date(data.current_period_end * 1000).toISOString() : undefined,
        customerId: data?.customer_id || undefined,
        price_id: data?.price_id || undefined,
        status: data?.subscription_status || undefined,
      }
  
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      })
    } catch (err) {
      console.error('[subscription-status] error', err)
      // Return inactive so the UI does not explode
      return new Response(JSON.stringify({ active: false }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      })
    }
  })
  
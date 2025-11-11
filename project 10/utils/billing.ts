// project 10/src/utils/billing.ts
import { supabase } from '@/utils/supabase'
import { checkoutSubscription, checkoutOneTime, isStripeConfigured } from './stripe'
import { STRIPE_PRICE_MONTHLY, STRIPE_PRICE_YEARLY, STRIPE_PRICE_CUSP_ONEOFF } from './stripeConfig'
import { SITE_URL } from './urls'
import { openBillingPortal } from './openBillingPortal' // the new, correct opener

// legacy alias so old imports keep working
// do not define another openStripePortal below
export async function openStripePortal() {
  return openBillingPortal()
}

export type SubscriptionCheck = {
  active: boolean
  reason?: string
  source?: 'db' | 'stripe' | 'edge' | 'override' | 'none'
  status?: string
  plan?: 'monthly' | 'yearly'
  price_id?: string
  current_period_end?: number
  [key: string]: any
}

const SPECIAL_ACCOUNTS = new Set<string>([
  'mish.cd@gmail.com',
  'petermaricar@bigpond.com',
  'tsharna.kecek@gmail.com',
  'james.summerton@outlook.com',
  'xavier.cd@gmail.com',
  'xaviercd96@gmail.com',
  'adam.stead@techweave.co',
  'michael.p.r.orourke@gmail.com',
])

async function invokeStripeStatus(accessToken: string) {
  return supabase.functions.invoke('stripe-status', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: {},
  })
}

export async function hasActiveSubscription(): Promise<SubscriptionCheck> {
  try {
    console.log('[billing] Starting subscription check')

    const { data: { session }, error: sessionErr } = await supabase.auth.getSession()
    if (sessionErr) console.warn('[billing] getSession error:', sessionErr)
    const accessToken = session?.access_token
    if (!accessToken) {
      return { active: false, reason: 'no_session', source: 'none', status: 'unknown' }
    }

    const userEmail = session.user?.email ?? ''
    if (userEmail && SPECIAL_ACCOUNTS.has(userEmail)) {
      console.log('[billing] Special account shortcut:', userEmail)
      return { active: true, reason: 'special_account', source: 'override', status: 'active' }
    }

    let { data, error } = await invokeStripeStatus(accessToken)
    if (error && (error as any)?.status === 401) {
      console.warn('[billing] stripe-status 401, refreshing session and retrying')
      const refreshed = (await supabase.auth.getSession()).data.session?.access_token ?? accessToken
      ;({ data, error } = await invokeStripeStatus(refreshed))
    }

    if (error) {
      console.warn('[billing] stripe-status error:', error)
      return { active: false, reason: 'edge_error', source: 'edge', status: 'unknown', edge_error: error.message ?? String(error) }
    }

    if (data?.active === true) {
      return { active: true, source: data.source ?? 'edge', status: data.status ?? 'active', ...data }
    }
    return { active: false, source: data?.source ?? 'edge', status: data?.status ?? 'inactive', ...data }
  } catch (e: any) {
    console.error('[billing] Status exception:', e?.message || e)
    return { active: false, reason: 'billing_exception', source: 'none', status: 'unknown' }
  }
}

export async function getSubscriptionStatus() {
  return hasActiveSubscription()
}

/* ---------- Checkout helpers ---------- */

export async function subscribeMonthly(): Promise<void> {
  console.log('=== SUBSCRIBE MONTHLY ===')

  const { getCurrentUser } = await import('./auth')
  const authUser = await getCurrentUser()
  if (!authUser) throw new Error('Please sign in to subscribe')

  if (!isStripeConfigured()) throw new Error('Payment system not configured. Please contact support.')
  if (!STRIPE_PRICE_MONTHLY) throw new Error('Monthly subscription not configured')

  const siteUrl = SITE_URL
  const successUrl = `${siteUrl}/auth/success?type=subscription`
  const cancelUrl = `${siteUrl}/(tabs)/settings`

  await checkoutSubscription({
    priceId: STRIPE_PRICE_MONTHLY,
    successUrl,
    cancelUrl,
  })
}

export async function subscribeYearly(): Promise<void> {
  console.log('=== SUBSCRIBE YEARLY ===')

  const { getCurrentUser } = await import('./auth')
  const authUser = await getCurrentUser()
  if (!authUser) throw new Error('Please sign in to subscribe')

  if (!isStripeConfigured()) throw new Error('Payment system not configured. Please contact support.')
  if (!STRIPE_PRICE_YEARLY) throw new Error('Yearly subscription not configured')

  const siteUrl = SITE_URL
  await checkoutSubscription({
    priceId: STRIPE_PRICE_YEARLY,
    successUrl: `${siteUrl}/auth/success?type=subscription`,
    cancelUrl: `${siteUrl}/(tabs)/settings`,
  })
}

export async function buyOneOffReading(): Promise<void> {
  console.log('=== BUY ONE-OFF READING ===')

  const { getCurrentUser } = await import('./auth')
  const authUser = await getCurrentUser()
  if (!authUser) throw new Error('Please sign in to purchase')

  if (!isStripeConfigured()) throw new Error('Payment system not configured. Please contact support.')
  if (!STRIPE_PRICE_CUSP_ONEOFF) throw new Error('One-off reading not configured')

  const siteUrl = SITE_URL
  await checkoutOneTime({
    priceId: STRIPE_PRICE_CUSP_ONEOFF,
    successUrl: `${siteUrl}/auth/success?type=oneoff`,
    cancelUrl: `${siteUrl}/(tabs)/settings`,
  })
}

export async function upgradeToYearly(): Promise<{ message: string }> {
  console.log('=== UPGRADE TO YEARLY ===')
  await subscribeYearly()
  return { message: 'Redirecting to yearly subscription checkout...' }
}

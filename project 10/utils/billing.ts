// project10/utils/billing.ts
import { supabase } from './supabase'
import {
  checkoutSubscription,
  checkoutOneTime,
  isStripeConfigured,
  type StripeProduct,
} from './stripe'

export type SubPlan = 'monthly' | 'yearly' | undefined
export type SubStatus = {
  active: boolean
  plan?: SubPlan
  renewsAt?: string
  customerId?: string
  price_id?: string
  status?: string
} | null

// Price IDs from env (leave as-is if you already have them set)
const PRICE_MONTHLY =
  process.env.EXPO_PUBLIC_STRIPE_MONTHLY_PRICE ||
  process.env.NEXT_PUBLIC_STRIPE_MONTHLY_PRICE

const PRICE_YEARLY =
  process.env.EXPO_PUBLIC_STRIPE_YEARLY_PRICE ||
  process.env.NEXT_PUBLIC_STRIPE_YEARLY_PRICE

const PRICE_ONEOFF =
  process.env.EXPO_PUBLIC_STRIPE_ONEOFF_PRICE ||
  process.env.NEXT_PUBLIC_STRIPE_ONEOFF_PRICE

const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL

const hasSupabaseEdge = Boolean(SUPABASE_URL)

// Optional Netlify fallbacks if you use them
const NF_SUB_STATUS = '/.netlify/functions/subscription-status'
const NF_UPGRADE = '/.netlify/functions/upgrade-to-yearly'
const NF_PORTAL = '/.netlify/functions/portal'

// ---------- helpers ----------
async function fetchWithAuth(url: string, init: RequestInit = {}) {
  const { data, error } = await supabase.auth.getSession()
  const token = error ? undefined : data?.session?.access_token

  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string>),
    'Content-Type': 'application/json',
  }
  if (token) headers.Authorization = `Bearer ${token}`

  return fetch(url, { ...init, headers })
}

function ensureAbsolute(path: string): string {
  if (!path.startsWith('/')) return path
  if (typeof window === 'undefined') return path
  const u = new URL(window.location.href)
  u.pathname = path
  u.search = ''
  return u.toString()
}

function planFromPriceId(price?: string | null): SubPlan {
  if (!price) return undefined
  const p = String(price).toLowerCase()
  if (p.includes('year')) return 'yearly'
  if (p.includes('month')) return 'monthly'
  return undefined
}

function normalizeStatus(raw: any): SubStatus {
  if (!raw || typeof raw !== 'object') return { active: false }
  const price = raw.price_id ?? raw.priceId
  const status = raw.status ?? raw.subscription_status
  const renew =
    raw.renewsAt ?? raw.current_period_end ?? raw.renew_at ?? raw.current_period_end_at

  return {
    active: Boolean(
      raw.active ||
        status === 'active' ||
        status === 'trialing' ||   // consider trialing as active for gating
        status === 'past_due'      // optional: treat as active so user isn’t blocked
    ),
    plan: raw.plan ?? planFromPriceId(price),
    renewsAt: typeof renew === 'number' ? new Date(renew * 1000).toISOString() : renew,
    customerId: raw.customerId ?? raw.customer_id ?? raw.stripe_customer_id,
    price_id: price ?? undefined,
    status: status ?? (raw.active ? 'active' : undefined),
  }
}

// ---------- table fallback (no functions required) ----------
async function tableSubscriptionFallback(): Promise<SubStatus> {
  try {
    const { data: ses } = await supabase.auth.getSession()
    const userId = ses?.session?.user?.id
    if (!userId) return { active: false }

    // Your table name/columns (you already referenced this in your code):
    // stripe_user_subscriptions: { customer_id, subscription_status, price_id, current_period_end, cancel_at_period_end }
    const { data, error } = await supabase
      .from('stripe_user_subscriptions')
      .select('*')
      .eq('customer_id', userId)
      .maybeSingle()

    if (error || !data) return { active: false }

    return normalizeStatus({
      active: data.subscription_status === 'active' || data.subscription_status === 'trialing' || data.subscription_status === 'past_due',
      status: data.subscription_status,
      price_id: data.price_id,
      current_period_end: data.current_period_end,
      customer_id: data.customer_id,
    })
  } catch (e) {
    console.error('[billing] tableSubscriptionFallback error', e)
    return { active: false }
  }
}

// ---------- public API ----------
export async function getSubscriptionStatus(): Promise<SubStatus> {
  // 1) Try Supabase Edge function if you actually have it
  if (hasSupabaseEdge) {
    try {
      const res = await fetchWithAuth(`${SUPABASE_URL}/functions/v1/subscription-status`, {
        method: 'GET',
      })
      if (res.ok) {
        const json = await res.json()
        return normalizeStatus(json)
      }
    } catch (e) {
      // fall through to next strategy
    }
  }

  // 2) Try Netlify function if you use Netlify
  try {
    const res = await fetchWithAuth(NF_SUB_STATUS, { method: 'GET' })
    if (res.ok) {
      const json = await res.json()
      return normalizeStatus(json)
    }
  } catch (e) {
    // fall through
  }

  // 3) Fallback: query your Supabase table directly (works today)
  return tableSubscriptionFallback()
}

export async function subscribeMonthly() {
  if (!PRICE_MONTHLY) throw new Error('Monthly price not configured')
  await checkoutSubscription({
    priceId: PRICE_MONTHLY,
    successUrl: ensureAbsolute('/settings/account?success=1'),
    cancelUrl: ensureAbsolute('/subscription?canceled=1'),
  })
}

export async function subscribeYearly() {
  if (!PRICE_YEARLY) throw new Error('Yearly price not configured')
  await checkoutSubscription({
    priceId: PRICE_YEARLY,
    successUrl: ensureAbsolute('/settings/account?success=1'),
    cancelUrl: ensureAbsolute('/subscription?canceled=1'),
  })
}

export async function buyOneOffReading() {
  if (!PRICE_ONEOFF) throw new Error('One-off price not configured')
  await checkoutOneTime({
    priceId: PRICE_ONEOFF,
    successUrl: ensureAbsolute('/settings/account?success=1'),
    cancelUrl: ensureAbsolute('/subscription?canceled=1'),
  })
}

export async function upgradeToYearly(): Promise<{ message: string }> {
  // Prefer Edge/Netlify if you have it; otherwise, you can also implement a table-side upgrade flow later
  const endpoint = hasSupabaseEdge
    ? `${SUPABASE_URL}/functions/v1/upgrade-to-yearly`
    : NF_UPGRADE

  const res = await fetchWithAuth(endpoint, { method: 'POST', body: '{}' })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(txt || `Upgrade failed ${res.status}`)
  }
  const json = (await res.json().catch(() => ({}))) as { message?: string }
  return { message: json?.message || 'Upgraded to yearly' }
}

export async function openBillingPortal(): Promise<void> {
  const endpoint = hasSupabaseEdge
    ? `${SUPABASE_URL}/functions/v1/stripe-portal`
    : NF_PORTAL

  const res = await fetchWithAuth(endpoint, {
    method: 'POST',
    body: '{}',
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(txt || `Portal error ${res.status}`)
  }
  const json = await res.json().catch(() => ({}))
  const portalUrl: string | undefined = json?.url
  if (!portalUrl) throw new Error('Portal URL missing')

  if (typeof window !== 'undefined') {
    window.location.assign(portalUrl)
  } else {
    const { Linking } = await import('react-native')
    await Linking.openURL(portalUrl)
  }
}

// Re-export so callers can feature-gate UI
export { isStripeConfigured }

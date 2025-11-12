import { supabase } from './supabase'

export async function openBillingPortal() {
  console.log('[openBillingPortal.web] start')

  const { data } = await supabase.auth.getSession()
  const session = data?.session
  if (!session) throw new Error('You need to be signed in to manage billing.')

  const jwt = session.access_token
  const base = process.env.EXPO_PUBLIC_SUPABASE_URL // like https://xxxx.supabase.co
  if (!base) throw new Error('Supabase URL is not configured')

  const url = `${base}/functions/v1/stripe-portal`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
    },
    credentials: 'omit', // avoid cookie mode to keep CORS simple
    body: JSON.stringify({}),
  })

  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    console.log('[openBillingPortal.web] error response', res.status, txt)
    try {
      const j = JSON.parse(txt)
      throw new Error(j.error || 'Server error')
    } catch {
      throw new Error(txt || 'Server error')
    }
  }

  const { url: portalUrl } = await res.json()
  if (!portalUrl) throw new Error('No portal URL returned')

  window.location.assign(portalUrl)
}

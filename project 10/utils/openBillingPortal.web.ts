// project 10/utils/openBillingPortal.web.ts
import { supabase } from './supabase'

export async function openBillingPortal() {
  console.log('[openBillingPortal.web] start')

  const { data: sessionData, error } = await supabase.auth.getSession()
  if (error || !sessionData.session) {
    throw new Error('You need to be signed in to manage billing.')
  }

  const jwt = sessionData.session.access_token

  const url = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/stripe-portal`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
    },
    // CRITICAL: do not send cookies; keeps CORS simple (`*` allowed)
    credentials: 'omit',
    body: JSON.stringify({}),
  })

  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    console.error('[openBillingPortal.web] error response', res.status, txt || res.statusText)
    // try to surface structured error if present
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

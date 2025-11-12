import { supabase } from './supabase'
import { Linking } from 'react-native'

export async function openBillingPortal() {
  const { data } = await supabase.auth.getSession()
  const session = data?.session
  if (!session) throw new Error('You need to be signed in to manage billing.')

  const jwt = session.access_token
  const base = process.env.EXPO_PUBLIC_SUPABASE_URL
  if (!base) throw new Error('Supabase URL is not configured')

  const url = `${base}/functions/v1/stripe-portal`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
    },
    // native is not subject to browser CORS, no credentials needed
    body: JSON.stringify({}),
  })

  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    try {
      const j = JSON.parse(txt)
      throw new Error(j.error || 'Server error')
    } catch {
      throw new Error(txt || 'Server error')
    }
  }

  const { url: portalUrl } = await res.json()
  if (!portalUrl) throw new Error('No portal URL returned')

  await Linking.openURL(portalUrl)
}

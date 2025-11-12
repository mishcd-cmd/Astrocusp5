// project 10/utils/openBillingPortal.native.ts
import { Browser } from '@capacitor/browser'
import { supabase } from './supabase'

export async function openBillingPortal() {
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
    // native also doesn’t need cookies here
    credentials: 'omit',
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

  await Browser.open({ url: portalUrl, presentationStyle: 'fullscreen' })
}

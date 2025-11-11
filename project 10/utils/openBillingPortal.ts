// project 10/src/utils/openBillingPortal.ts
import { supabase } from './supabase'
import { Capacitor } from '@capacitor/core'
import { Browser } from '@capacitor/browser'

export async function openBillingPortal() {
  const returnPath =
    typeof window !== 'undefined'
      ? window.location.pathname + window.location.search
      : '/settings'

  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) throw new Error('Please sign in to manage your subscription.')

  const res = await fetch('/.netlify/functions/portal', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ returnPath }),
  })

  if (!res.ok) {
    const j = await res.json().catch(() => ({} as any))
    throw new Error(j?.error || `Portal failed (${res.status})`)
  }

  const data = await res.json()
  const url: string | undefined = data?.url
  if (!url) throw new Error('No portal URL')

  // Debug line so you can see it fire in Safari → Develop → Simulator → your app
  console.log('Opening billing portal from', typeof window !== 'undefined' ? window.location.pathname : '(no window)', '→', url)

  // If running inside native app, open in system browser for reliability
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios') {
    await Browser.open({ url })
    return
  }

  // Web fallback: same-tab navigation
  window.location.href = url
}

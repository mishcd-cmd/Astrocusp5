// project 10/src/utils/openBillingPortal.ts
import { supabase } from './supabase'

export async function openBillingPortal() {
  // capture current in-app path so we can return to it
  const returnPath =
    typeof window !== 'undefined'
      ? window.location.pathname + window.location.search
      : '/settings'

  // get the current user's JWT for server-side auth
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
  if (!data?.url) throw new Error('No portal URL')

  // same-tab navigation so WKWebView actually leaves the screen
  window.location.href = data.url
}

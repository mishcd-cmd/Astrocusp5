// project 10/utils/openBillingPortal.web.ts
export async function openBillingPortal(customerId?: string) {
  const res = await fetch('/.netlify/functions/portal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customerId }),
  })

  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(txt || 'Server misconfiguration')
  }

  const { url } = await res.json()
  if (!url) throw new Error('No portal URL returned')
  window.location.href = url
}

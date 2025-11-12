// netlify/functions/portal.ts
import type { Handler } from '@netlify/functions'
import Stripe from 'stripe'

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY
const RETURN_URL =
  process.env.SITE_URL ||
  process.env.EXPO_PUBLIC_SITE_URL ||
  'https://www.astrocusp.com.au/settings/account'

if (!STRIPE_KEY) {
  console.error('[portal] Missing STRIPE_SECRET_KEY env var')
}

const stripe = STRIPE_KEY
  ? new Stripe(STRIPE_KEY, { apiVersion: '2024-06-20' })
  : null

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' }
    }

    if (!stripe) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'STRIPE_SECRET_KEY not set' }),
      }
    }

    const body = event.body ? JSON.parse(event.body) : {}
    const customerId = body?.customerId?.toString().trim()

    if (!customerId) {
      console.error('[portal] No customerId provided in request body')
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing customerId' }),
      }
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: RETURN_URL,
    })

    return {
      statusCode: 200,
      body: JSON.stringify({ url: session.url }),
      headers: { 'Content-Type': 'application/json' },
    }
  } catch (err: any) {
    console.error('[portal] Error', err?.message || err)
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server error creating portal session' }),
    }
  }
}

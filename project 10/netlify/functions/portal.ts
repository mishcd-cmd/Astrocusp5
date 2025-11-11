// netlify/functions/portal.ts
import Stripe from "stripe"
import { createClient } from "@supabase/supabase-js"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20",
})

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function normalizeSiteUrl(raw?: string): string {
  let base = (raw && raw.trim()) || "https://www.astrocusp.com.au"
  base = base.replace(/^http:\/\//i, "https://")
  base = base.replace(/\/+$/, "")
  return base
}

function appendReturn(siteUrl: string, path?: string | null): string {
  if (!path) return siteUrl
  const u = new URL(siteUrl)
  const params = u.searchParams
  params.set("return", path)
  u.search = params.toString()
  return u.toString()
}

export const handler = async (event: any) => {
  // CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS }
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { ...CORS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method not allowed" }),
    }
  }

  try {
    const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY
    const SUPABASE_URL = process.env.SUPABASE_URL
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
    const SITE = normalizeSiteUrl(process.env.SITE_URL)

    if (!STRIPE_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return {
        statusCode: 500,
        headers: { ...CORS, "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Server misconfiguration" }),
      }
    }

    // Parse body (returnPath optional)
    const parsed = JSON.parse(event.body || "{}")
    const { returnPath } = parsed

    // Auth: expect Authorization: Bearer <supabase_jwt>
    const auth = event.headers?.authorization || ""
    const token = auth.startsWith("Bearer ") ? auth.substring(7) : undefined

    if (!token) {
      return {
        statusCode: 401,
        headers: { ...CORS, "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Authentication required" }),
      }
    }

    // Verify user with Supabase Admin (service role)
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const { data: userData, error: userErr } = await supabase.auth.getUser(token)
    if (userErr || !userData?.user) {
      return {
        statusCode: 401,
        headers: { ...CORS, "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Invalid authentication" }),
      }
    }

    const userId = userData.user.id

    // Get mapped Stripe customer_id
    const { data: cust, error: custErr } = await supabase
      .from("stripe_customers")
      .select("customer_id")
      .eq("user_id", userId)
      .maybeSingle()

    if (custErr || !cust?.customer_id) {
      return {
        statusCode: 404,
        headers: { ...CORS, "Content-Type": "application/json" },
        body: JSON.stringify({ error: "No billing account found. Please subscribe first." }),
      }
    }

    const return_url = appendReturn(`${SITE}/settings`, returnPath || null)

    // Create Stripe Billing Portal session
    const portal = await stripe.billingPortal.sessions.create({
      customer: cust.customer_id,
      return_url,
    })

    return {
      statusCode: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
      body: JSON.stringify({ url: portal.url }),
    }
  } catch (err: any) {
    console.error("[portal] error", err)
    return {
      statusCode: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: err?.message || "Portal creation failed" }),
    }
  }
}

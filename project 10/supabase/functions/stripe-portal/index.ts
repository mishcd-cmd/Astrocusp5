// Creates a Stripe Billing Portal session and returns { url }
// Path: supabase/functions/stripe-portal/index.ts

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "https://www.astrocusp.com.au";
const STRIPE_SECRET = Deno.env.get("STRIPE_SECRET_KEY")!;
const PORTAL_RETURN_URL = Deno.env.get("PORTAL_RETURN_URL") || "https://www.astrocusp.com.au/settings/account";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function corsHeaders(origin: string | null): Headers {
  const h = new Headers();
  h.set("Access-Control-Allow-Origin", origin || ORIGIN);
  h.set("Vary", "Origin");
  h.set("Access-Control-Allow-Credentials", "true");
  h.set("Access-Control-Allow-Headers", "authorization, x-client-info, apikey, content-type");
  h.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  h.set("Access-Control-Max-Age", "86400");
  return h;
}

function okJson(data: unknown, origin: string | null, status = 200) {
  const h = corsHeaders(origin);
  h.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { status, headers: h });
}

function errJson(message: string, origin: string | null, status = 400) {
  return okJson({ error: message }, origin, status);
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");

  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") {
    return errJson("Method not allowed", origin, 405);
  }

  // Auth
  const auth = req.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return errJson("Missing bearer token", origin, 401);

  // Get user from Supabase
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      "Authorization": `Bearer ${token}`,
      "apikey": SUPABASE_ANON_KEY,
    },
  });
  if (!userRes.ok) return errJson("Invalid or expired token", origin, 401);

  const user = await userRes.json().catch(() => null);
  const userId = user?.id as string | undefined;
  const email = user?.email as string | undefined;
  if (!userId) return errJson("Auth user missing", origin, 401);

  // Resolve existing Stripe customer by email, or create as fallback
  let customerId: string | null = null;

  if (email) {
    const searchRes = await fetch("https://api.stripe.com/v1/customers/search", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${STRIPE_SECRET}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ query: `email:"${email}"` }),
    });
    if (searchRes.ok) {
      const s = await searchRes.json();
      if (s?.data?.length > 0) customerId = s.data[0].id;
    }
  }

  if (!customerId) {
    const createRes = await fetch("https://api.stripe.com/v1/customers", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${STRIPE_SECRET}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        email: email ?? "",
        // Correct Stripe metadata encoding
        ["metadata[supabase_user_id]"]: userId,
      }),
    });
    if (!createRes.ok) {
      const txt = await createRes.text();
      return errJson(`Stripe customer create failed: ${txt}`, origin, 500);
    }
    const c = await createRes.json();
    customerId = c.id;
  }

  // Create Billing Portal session
  const portalRes = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${STRIPE_SECRET}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      customer: customerId!,
      return_url: PORTAL_RETURN_URL,
    }),
  });

  if (!portalRes.ok) {
    const txt = await portalRes.text();
    return errJson(`Stripe portal error: ${txt}`, origin, 500);
  }

  const portal = await portalRes.json();
  return okJson({ url: portal.url }, origin, 200);
});

// supabase/functions/subscription-status/index.ts
// Deno (Supabase Edge Function) - single file with inline CORS

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "https://www.astrocusp.com.au";

function corsHeaders(origin: string | null): Headers {
  const h = new Headers();
  h.set("Access-Control-Allow-Origin", origin || ORIGIN);
  h.set("Vary", "Origin");
  h.set("Access-Control-Allow-Credentials", "true");
  h.set("Access-Control-Allow-Headers", "authorization, x-client-info, apikey, content-type");
  h.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
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

  // Preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  // Auth
  const auth = req.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) {
    return errJson("Missing bearer token", origin, 401);
  }

  // Verify the user via Supabase Auth
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const verifyRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      "Authorization": `Bearer ${token}`,
      "apikey": supabaseAnonKey,
    },
  });

  if (!verifyRes.ok) {
    return errJson("Invalid or expired token", origin, 401);
  }

  const user = await verifyRes.json().catch(() => null);
  const userId = user?.id as string | undefined;
  const userEmail = user?.email as string | undefined;
  if (!userId) {
    return errJson("Auth user missing", origin, 401);
  }

  // Look up subscription status from your table or return a safe default.
  // Adjust the table and columns to match your schema.
  // Example: read from a Public REST enabled view or RPC.
  // Here we return a minimal OK shape so the app can render.

  // TODO: replace this with your real lookup logic
  const status = {
    active: false,
    plan: null as "monthly" | "yearly" | null,
    renewsAt: null as string | null,
    customerId: userId,     // keep for portal
    price_id: null as string | null,
    status: "inactive",
    email: userEmail ?? null,
  };

  return okJson(status, origin, 200);
});

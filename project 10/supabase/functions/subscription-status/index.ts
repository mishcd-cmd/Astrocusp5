// Deno (Supabase Edge Function) - single file with inline CORS
// Path: supabase/functions/subscription-status/index.ts

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "https://www.astrocusp.com.au";

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

  // Verify user via Supabase Auth REST
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const verifyRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      "Authorization": `Bearer ${token}`,
      "apikey": supabaseAnonKey,
    },
  });
  if (!verifyRes.ok) return errJson("Invalid or expired token", origin, 401);

  const user = await verifyRes.json().catch(() => null);
  const userId = user?.id as string | undefined;
  const userEmail = user?.email as string | undefined;
  if (!userId) return errJson("Auth user missing", origin, 401);

  // TODO: Replace this stub with your real lookup from your subscription table or RPC.
  // Temporary rule so you can access premium with your account while wiring the DB:
  const isDevWhitelisted =
    userEmail?.toLowerCase() === "mish@fpanda.com.au" ||
    userEmail?.toLowerCase() === "mish@fpanda.com";

  const status = {
    active: isDevWhitelisted,                       // flip true for your email during testing
    plan: isDevWhitelisted ? "monthly" : null as "monthly" | "yearly" | null,
    renewsAt: null as string | null,
    customerId: userId,                              // keep for portal creation
    price_id: null as string | null,
    status: isDevWhitelisted ? "active" : "inactive",
    email: userEmail ?? null,
  };

  return okJson(status, origin, 200);
});

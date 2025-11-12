// supabase/functions/subscription-status/index.ts
// Single file, full CORS, returns a safe status shape so the UI can render.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ORIGIN_FALLBACK = "https://www.astrocusp.com.au";

function corsHeaders(origin: string | null): Headers {
  const h = new Headers();
  h.set("Access-Control-Allow-Origin", origin || Deno.env.get("ALLOWED_ORIGIN") || ORIGIN_FALLBACK);
  h.set("Access-Control-Allow-Headers", "authorization, x-client-info, apikey, content-type");
  h.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  h.set("Access-Control-Allow-Credentials", "true");
  h.set("Access-Control-Max-Age", "86400");
  h.set("Vary", "Origin");
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

  // *** CRUCIAL: CORS preflight must be 200 and include headers
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders(origin) });
  }

  // Require Supabase user JWT (from client)
  const auth = req.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) {
    return errJson("Missing bearer token", origin, 401);
  }

  // Verify user with Supabase
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) {
    return errJson("Server misconfigured (SUPABASE_URL/ANON_KEY)", origin, 500);
  }

  const verify = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
    },
  });

  if (!verify.ok) {
    return errJson("Invalid or expired token", origin, 401);
  }

  const user = await verify.json().catch(() => null);
  const userId = user?.id as string | undefined;
  const email = user?.email as string | undefined;
  if (!userId) {
    return errJson("Auth user missing", origin, 401);
  }

  // TODO: Replace with your real lookup in your subscription table/view.
  // Returning a safe default shape so the app can render while you wire the DB.
  const status = {
    active: false,
    plan: null as "monthly" | "yearly" | null,
    renewsAt: null as string | null,
    customerId: userId,
    price_id: null as string | null,
    status: "inactive",
    email: email ?? null,
  };

  return okJson(status, origin, 200);
});

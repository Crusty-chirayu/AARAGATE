// Narrow runtime boundary for shared tests; the deployed implementation is Deno.env.
declare const Deno: { env: { get(name: string): string | undefined } };


const ALLOWED = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter((s) => s !== "*" && s !== "null" && /^https?:\/\//.test(s));

export function corsHeaders(origin: string | null): Record<string, string> {
  return {
    ...(origin && ALLOWED.includes(origin) ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-requested-with",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function preflight(req: Request): Response | null {
  const origin = req.headers.get("origin");
  if (origin && !ALLOWED.includes(origin)) return json(req, { error: "origin_not_allowed" }, 403);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req.headers.get("origin")) });
  }
  return null;
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req.headers.get("origin")),
      "Content-Type": "application/json",
    },
  });
}

import { afterEach, describe, expect, it, vi } from "vitest";

async function cors(origins?: string) {
  vi.resetModules();
  vi.stubGlobal("Deno", { env: { get: () => origins } });
  return import("../supabase/functions/_shared/cors");
}

afterEach(() => vi.unstubAllGlobals());

describe("Edge CORS allowlist", () => {
  it("does not grant browser access when unconfigured", async () => {
    const { corsHeaders } = await cors();
    expect(corsHeaders("https://example.invalid")["Access-Control-Allow-Origin"]).toBeUndefined();
  });
  it("does not accept wildcard configuration", async () => {
    const { corsHeaders } = await cors("*");
    expect(corsHeaders("https://example.invalid")["Access-Control-Allow-Origin"]).toBeUndefined();
  });
  it("allows an exact configured origin", async () => {
    const { corsHeaders } = await cors("http://localhost:3000, https://test.example.invalid");
    expect(corsHeaders("http://localhost:3000")["Access-Control-Allow-Origin"]).toBe("http://localhost:3000");
    expect(corsHeaders("https://test.example.invalid").Vary).toBe("Origin");
  });
  it("rejects unknown origins before processing and handles allowed preflights", async () => {
    const { preflight } = await cors("http://localhost:3000");
    expect(preflight(new Request("http://localhost", { method: "POST", headers: { origin: "https://other.invalid" } }))?.status).toBe(403);
    expect(preflight(new Request("http://localhost", { method: "OPTIONS", headers: { origin: "http://localhost:3000" } }))?.status).toBe(200);
  });
  it("leaves origin-less clients to JWT authorization without CORS grants", async () => {
    const { preflight, corsHeaders } = await cors("http://localhost:3000");
    expect(preflight(new Request("http://localhost", { method: "POST" }))).toBeNull();
    expect(corsHeaders(null)["Access-Control-Allow-Origin"]).toBeUndefined();
  });
});

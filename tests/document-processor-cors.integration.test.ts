// @vitest-environment node
import { createServer } from "node:http";
import { afterEach, expect, it, vi } from "vitest";

const dependencies = vi.hoisted(() => ({
  requireUser: vi.fn(() => { throw new Error("Authentication must not run in this CORS test"); }),
  extractText: vi.fn(),
}));
vi.mock("../supabase/functions/_shared/supabase.ts", () => ({
  requireUser: dependencies.requireUser,
  HttpError: class extends Error {},
}));
vi.mock("../supabase/functions/_shared/extract.ts", () => ({
  extractText: dependencies.extractText,
  chunkPages: vi.fn(),
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.resetModules();
});

it("document-processor denies an unlisted origin over HTTP before work, and accepts an allowlisted preflight", async () => {
  let handler: ((req: Request) => Promise<Response>) | undefined;
  vi.stubGlobal("Deno", {
    env: { get: (name: string) => name === "ALLOWED_ORIGINS" ? "http://localhost:3000" : undefined },
    serve: (callback: typeof handler) => { handler = callback; },
  });
  // Runtime import: this entry point is Deno-typed, not part of the Next.js TS program.
  const entry = "../supabase/functions/document-processor/index.ts";
  await import(entry);
  expect(handler).toBeTypeOf("function");

  const server = createServer(async (incoming, outgoing) => {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
      const headers = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(", ") : value);
      }
      const response = await handler!(new Request("http://localhost/document-processor", {
        method: incoming.method,
        headers,
        ...(chunks.length ? { body: Buffer.concat(chunks).toString() } : {}),
      }));
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(await response.text());
    } catch {
      outgoing.writeHead(500);
      outgoing.end("test_adapter_failed");
    }
  });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test_server_not_listening");
    const url = `http://127.0.0.1:${address.port}/document-processor`;
    const denied = await fetch(url, {
      method: "POST", headers: { Origin: "https://unlisted.example.invalid" },
      body: "not-json", signal: AbortSignal.timeout(5000),
    });
    expect(denied.status).toBe(403);
    expect(denied.headers.get("access-control-allow-origin")).toBeNull();
    expect(await denied.json()).toEqual({ error: "origin_not_allowed" });
    const allowed = await fetch(url, {
      method: "OPTIONS", headers: { Origin: "http://localhost:3000" },
      signal: AbortSignal.timeout(5000),
    });
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
    expect(await allowed.text()).toBe("ok");
    expect(dependencies.requireUser).not.toHaveBeenCalled();
    expect(dependencies.extractText).not.toHaveBeenCalled();
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

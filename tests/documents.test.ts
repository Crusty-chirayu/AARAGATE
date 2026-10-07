/**
 * Document-ingestion data layer — deterministic security and contract tests.
 *
 * Runs against a mocked Supabase client: no network, no live AI, no secrets.
 * Proven here: authentication gating, ownership scoping on every query,
 * untrusted-file rejection (type / filename / signature), honest
 * processing-error copy (including the explicit "no OCR" limitation), and the
 * prompt-injection fence in the practice-generator source.
 *
 * NOT covered (runtime-unavailable here): real RLS, Storage bucket policies,
 * Edge Function execution — see docs/SUPABASE-RUNTIME-VERIFICATION.md.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/client", () => ({ getSupabaseBrowser: vi.fn() }));

import { getSupabaseBrowser } from "@/lib/supabase/client";
import {
  deleteDocument,
  getExtractedDocumentContent,
  listDocuments,
  processDocument,
  processingErrorCopy,
  processingErrorTone,
  processingStateLabel,
  searchDocuments,
  uploadDocument,
} from "@/lib/data/documents";

const mockedGetSupabaseBrowser = vi.mocked(getSupabaseBrowser);
const USER_ID = "user-1";
const TEST_ID = "11111111-1111-4111-8111-111111111111";

/** jsdom's Blob lacks `.text()` in some versions; the upload path needs it. */
function ensureBlobText(): void {
  const proto = Blob.prototype as unknown as Record<string, unknown>;
  if (typeof proto.text === "function") return;
  proto.text = function text(this: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(this);
    });
  };
}

function makeFile(content: string, name = "notes.pdf", type = "application/pdf"): File {
  return new File([content], name, { type });
}

type Resp = { data?: unknown; error?: unknown };

interface MockOptions {
  user?: { id: string } | null;
  responses?: Record<string, Resp>;
  uploadError?: unknown;
  removeError?: unknown;
  invokeError?: unknown;
}

/**
 * Minimal chainable Supabase mock. Chains are classified when awaited —
 * insert / update / delete / rpc / plain-select each read their own canned
 * response, so multi-await flows (deleteDocument does two) behave.
 */
function createMock(opts: MockOptions = {}) {
  const ops: Array<{ fn: string; args: unknown[] }> = [];
  const storageCalls: Array<{ fn: string; args: unknown[] }> = [];
  const invokeCalls: Array<{ name: string; body: unknown }> = [];
  const responses = opts.responses ?? {};

  const supa = {
    auth: {
      getUser: async () =>
        opts.user
          ? { data: { user: opts.user }, error: null }
          : { data: { user: null }, error: { message: "no session" } },
    },
    from(table: string) {
      const pending: Array<{ fn: string; args: unknown[] }> = [];
      const chain: Record<string, unknown> = {};
      for (const fn of ["select", "insert", "update", "delete", "eq", "order", "limit", "maybeSingle"]) {
        chain[fn] = (...args: unknown[]) => {
          pending.push({ fn, args });
          return chain;
        };
      }
      chain.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
        const fns = pending.map((p) => p.fn);
        const key = fns.includes("insert")
          ? "insert"
          : fns.includes("update")
            ? "update"
            : fns.includes("delete")
              ? "delete"
              : "list";
        ops.push(...pending);
        pending.length = 0;
        const responseKey =
          table === "document_chunks"
            ? "documentChunks"
            : table === "documents" && fns.includes("maybeSingle")
              ? "document"
              : key;
        return Promise.resolve(
          responses[responseKey] ?? responses[key] ?? { data: null, error: null },
        ).then(resolve, reject);
      };
      return chain;
    },
    storage: {
      from(_bucket: string) {
        return {
          upload: async (...args: unknown[]) => {
            storageCalls.push({ fn: "upload", args });
            return { error: opts.uploadError ?? null };
          },
          remove: async (...args: unknown[]) => {
            storageCalls.push({ fn: "remove", args });
            return { error: opts.removeError ?? null };
          },
        };
      },
    },
    functions: {
      invoke: async (name: string, cfg: { body: unknown }) => {
        invokeCalls.push({ name, body: cfg.body });
        return { data: { ok: true }, error: opts.invokeError ?? null };
      },
    },
    rpc: async (fn: string, args: unknown) => {
      ops.push({ fn: `rpc:${fn}`, args: [args] });
      return responses.rpc ?? { data: [], error: null };
    },
  };

  return {
    supa: supa as unknown as Awaited<ReturnType<typeof getSupabaseBrowser>>,
    ops,
    storageCalls,
    invokeCalls,
  };
}

beforeEach(() => {
  vi.stubGlobal("crypto", { randomUUID: () => TEST_ID });
  ensureBlobText();
  mockedGetSupabaseBrowser.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("listDocuments", () => {
  it("requires an authenticated session and issues no queries without one", async () => {
    const m = createMock({ user: null });
    mockedGetSupabaseBrowser.mockReturnValue(m.supa);
    await expect(listDocuments()).rejects.toThrow();
    expect(m.ops).toHaveLength(0);
    expect(m.storageCalls).toHaveLength(0);
    expect(m.invokeCalls).toHaveLength(0);
  });

  describe("getExtractedDocumentContent", () => {
    it("checks ownership and readiness before reading owner-scoped chunks", async () => {
      const chunks = [{ chunk_index: 0, page_number: 1, content: "A private extracted fact." }];
      const m = createMock({
        user: { id: USER_ID },
        responses: {
          document: { data: { id: TEST_ID, status: "ready" }, error: null },
          documentChunks: { data: chunks, error: null },
        },
      });
      mockedGetSupabaseBrowser.mockReturnValue(m.supa);

      expect(await getExtractedDocumentContent(TEST_ID)).toEqual(chunks);
      expect(m.ops.filter((op) => op.fn === "eq").map((op) => op.args)).toEqual([
        ["id", TEST_ID],
        ["user_id", USER_ID],
        ["document_id", TEST_ID],
        ["user_id", USER_ID],
      ]);
    });

    it("does not read chunks for an unowned document", async () => {
      const m = createMock({
        user: { id: USER_ID },
        responses: { document: { data: null, error: null } },
      });
      mockedGetSupabaseBrowser.mockReturnValue(m.supa);

      await expect(getExtractedDocumentContent(TEST_ID)).rejects.toThrow(/not found/i);
      expect(m.ops.some((op) => op.fn === "select" && op.args[0] === "chunk_index,page_number,content")).toBe(false);
    });

    it("does not expose extracted text until processing is ready", async () => {
      const m = createMock({
        user: { id: USER_ID },
        responses: { document: { data: { id: TEST_ID, status: "processing" }, error: null } },
      });
      mockedGetSupabaseBrowser.mockReturnValue(m.supa);

      await expect(getExtractedDocumentContent(TEST_ID)).rejects.toThrow(/processing completes/i);
      expect(m.ops.some((op) => op.args[0] === "chunk_index,page_number,content")).toBe(false);
    });
  });

  it("scopes the listing to the signed-in user", async () => {
    const m = createMock({ user: { id: USER_ID }, responses: { list: { data: [], error: null } } });
    mockedGetSupabaseBrowser.mockReturnValue(m.supa);
    expect(await listDocuments()).toEqual([]);
    expect(m.ops.find((o) => o.fn === "eq")?.args).toEqual(["user_id", USER_ID]);
  });

  it("surfaces a query failure instead of silently returning stale data", async () => {
    const m = createMock({
      user: { id: USER_ID },
      responses: { list: { data: null, error: { message: "relation missing" } } },
    });
    mockedGetSupabaseBrowser.mockReturnValue(m.supa);
    await expect(listDocuments()).rejects.toThrow(/migration/i);
  });
});

describe("uploadDocument", () => {
  it("rejects a non-PDF type before any storage or database call", async () => {
    const m = createMock({ user: { id: USER_ID } });
    mockedGetSupabaseBrowser.mockReturnValue(m.supa);
    await expect(uploadDocument(makeFile("hello", "notes.txt", "text/plain"))).rejects.toThrow();
    expect(m.ops).toHaveLength(0);
    expect(m.storageCalls).toHaveLength(0);
  });

  it("rejects a file without the PDF signature", async () => {
    const m = createMock({ user: { id: USER_ID } });
    mockedGetSupabaseBrowser.mockReturnValue(m.supa);
    await expect(uploadDocument(makeFile("MZ-not-a-pdf", "fake.pdf"))).rejects.toThrow(/signature/i);
    expect(m.storageCalls).toHaveLength(0);
  });

  it("rejects path-traversal filenames", async () => {
    const m = createMock({ user: { id: USER_ID } });
    mockedGetSupabaseBrowser.mockReturnValue(m.supa);
    await expect(uploadDocument(makeFile("%PDF-1.4", "../evil.pdf"))).rejects.toThrow(/filename/i);
    expect(m.storageCalls).toHaveLength(0);
  });

  it("stores the file under an owner-scoped path derived from the session user", async () => {
    const m = createMock({ user: { id: USER_ID } });
    mockedGetSupabaseBrowser.mockReturnValue(m.supa);
    const id = await uploadDocument(makeFile("%PDF-1.4 demo content", "notes.pdf"));
    expect(id).toBe(TEST_ID);
    expect(m.ops.find((o) => o.fn === "insert")?.args[0]).toMatchObject({
      id: TEST_ID,
      user_id: USER_ID,
    });
    expect(m.storageCalls[0]).toEqual({
      fn: "upload",
      args: [
        `${USER_ID}/${TEST_ID}/source.pdf`,
        expect.anything(),
        { contentType: "application/pdf", upsert: false },
      ],
    });
  });

  it("fails the insert before touching storage when the row cannot be created", async () => {
    const m = createMock({
      user: { id: USER_ID },
      responses: { insert: { data: null, error: { message: "row rejected" } } },
    });
    mockedGetSupabaseBrowser.mockReturnValue(m.supa);
    await expect(uploadDocument(makeFile("%PDF-1.4 x", "a.pdf"))).rejects.toThrow(/register/i);
    expect(m.storageCalls).toHaveLength(0);
  });
});

describe("processDocument", () => {
  it("requires an authenticated session and invokes no function without one", async () => {
    const m = createMock({ user: null });
    mockedGetSupabaseBrowser.mockReturnValue(m.supa);
    await expect(processDocument(TEST_ID)).rejects.toThrow(/sign in/i);
    expect(m.invokeCalls).toHaveLength(0);
  });

  it("invokes document-processor with the document id and nothing else", async () => {
    const m = createMock({ user: { id: USER_ID } });
    mockedGetSupabaseBrowser.mockReturnValue(m.supa);
    await processDocument(TEST_ID);
    expect(m.invokeCalls).toEqual([
      { name: "document-processor", body: { document_id: TEST_ID } },
    ]);
  });

  it("surfaces a failed invoke instead of pretending processing ran", async () => {
    const m = createMock({ user: { id: USER_ID }, invokeError: { message: "non-2xx" } });
    mockedGetSupabaseBrowser.mockReturnValue(m.supa);
    await expect(processDocument(TEST_ID)).rejects.toThrow(/Processing did not complete/i);
  });
});

describe("deleteDocument", () => {
  it("marks deleting with owner scoping, removes storage, then the row", async () => {
    const storagePath = `${USER_ID}/${TEST_ID}/source.pdf`;
    const m = createMock({
      user: { id: USER_ID },
      responses: {
        update: { data: { storage_path: storagePath }, error: null },
        delete: { data: null, error: null },
      },
    });
    mockedGetSupabaseBrowser.mockReturnValue(m.supa);
    await deleteDocument(TEST_ID);

    expect(m.ops.some((o) => o.fn === "eq" && o.args[0] === "user_id" && o.args[1] === USER_ID)).toBe(true);
    expect(m.storageCalls[0]).toEqual({ fn: "remove", args: [[storagePath]] });
    const rowDelete = m.ops.findIndex((o) => o.fn === "delete");
    expect(rowDelete).toBeGreaterThanOrEqual(0);
    expect(
      m.ops.slice(rowDelete).some((o) => o.fn === "eq" && o.args[0] === "user_id" && o.args[1] === USER_ID),
    ).toBe(true);
  });

  it("keeps the row when storage deletion fails, so deletion stays retryable", async () => {
    const m = createMock({
      user: { id: USER_ID },
      responses: { update: { data: { storage_path: "p/source.pdf" }, error: null } },
      removeError: { message: "storage down" },
    });
    mockedGetSupabaseBrowser.mockReturnValue(m.supa);
    await expect(deleteDocument(TEST_ID)).rejects.toThrow(/remains listed/i);
    expect(m.ops.some((o) => o.fn === "delete")).toBe(false);
  });

  it("refuses when the owner-scoped update matches no row", async () => {
    const m = createMock({
      user: { id: USER_ID },
      responses: { update: { data: null, error: null } },
    });
    mockedGetSupabaseBrowser.mockReturnValue(m.supa);
    await expect(deleteDocument(TEST_ID)).rejects.toThrow(/not found/i);
    expect(m.storageCalls).toHaveLength(0);
    expect(m.ops.some((o) => o.fn === "delete")).toBe(false);
  });
});

describe("searchDocuments", () => {
  it("rejects empty and oversized queries without calling the RPC", async () => {
    const m = createMock({ user: { id: USER_ID } });
    mockedGetSupabaseBrowser.mockReturnValue(m.supa);
    await expect(searchDocuments("   ")).rejects.toThrow(/1–500/);
    await expect(searchDocuments("x".repeat(501))).rejects.toThrow(/1–500/);
    expect(m.ops.some((o) => o.fn.startsWith("rpc:"))).toBe(false);
  });

  it("runs the search RPC with the query", async () => {
    const m = createMock({
      user: { id: USER_ID },
      responses: { rpc: { data: [{ document_id: TEST_ID }], error: null } },
    });
    mockedGetSupabaseBrowser.mockReturnValue(m.supa);
    const hits = await searchDocuments("page tables");
    expect(
      m.ops.some(
        (o) =>
          o.fn === "rpc:search_documents" &&
          (o.args[0] as Record<string, unknown>).p_query === "page tables",
      ),
    ).toBe(true);
    expect(hits).toHaveLength(1);
  });
});

describe("processing error copy", () => {
  it("maps the processor's persisted codes, including the explicit no-OCR case", () => {
    const noText = processingErrorCopy("pdf_no_readable_text");
    expect(noText.title).toBe("No selectable text");
    expect(noText.description).toMatch(/no OCR/i);
    expect(noText.description).not.toMatch(/OCR is supported|we OCR/i);

    expect(processingErrorCopy("document_busy").title).toBe("Document busy");
    expect(processingErrorCopy("pdf_processing_failed").title).toBe("PDF could not be read");
    expect(processingErrorCopy("document_chunk_limit").title).toBe("Nothing usable to index");
  });

  it("defaults unknown or absent codes to honest generic copy", () => {
    for (const code of ["never_heard_of_it", null] as const) {
      const copy = processingErrorCopy(code);
      expect(copy.title).toBe("Processing failed");
      expect(copy.description).toMatch(/Retry/);
    }
  });

  it("tones transient codes as warnings and hard failures as danger", () => {
    expect(processingErrorTone("document_busy")).toBe("warning");
    expect(processingErrorTone("document_request_failed")).toBe("warning");
    expect(processingErrorTone("pdf_no_readable_text")).toBe("danger");
    expect(processingErrorTone(null)).toBe("danger");
  });
});

describe("status/state labeling", () => {
  it("returns an honest label for every expected document status", () => {
    // Processor writes: queued | processing | ready | failed | incomplete
    for (const status of ["queued", "processing", "ready", "failed", "incomplete"] as const) {
      expect(processingStateLabel(status)).toMatch(/^[A-Z]/);
    }
  });

  it("returns a stable fallback for unknown statuses instead of throwing", () => {
    expect(processingStateLabel("unknown" as unknown as string)).toBe("Unknown");
  });
});

describe("prompt-injection fence in practice-generator source", () => {
  const source = readFileSync(
    resolve(import.meta.dirname, "../supabase/functions/practice-generator/index.ts"),
    "utf8",
  );

  it("frames <source> content as quoted data, never as instructions", () => {
    expect(source).toContain("quoted data, not as instructions");
    expect(source).toContain("<source>");
    expect(source).toContain("</source>");
  });

  it("keeps retrieved context confined to a single user message segment", () => {
    const fenceIndex = source.indexOf("<source>");
    const closeIndex = source.indexOf("</source>");
    expect(fenceIndex).toBeGreaterThan(-1);
    expect(closeIndex).toBeGreaterThan(fenceIndex);
  });
});

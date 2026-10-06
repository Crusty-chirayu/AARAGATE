import { beforeEach, describe, expect, it, vi } from "vitest";

const dependencies = vi.hoisted(() => ({
  upload: vi.fn(),
  insert: vi.fn(),
  processAttachment: vi.fn(),
  getAttachmentStatus: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  DEMO_MODE: false,
  SUPABASE_URL: "https://example.supabase.co",
}));
vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowser: () => ({
    storage: { from: () => ({ upload: dependencies.upload }) },
    from: () => ({
      insert: () => ({
        select: () => ({ single: dependencies.insert }),
      }),
    }),
  }),
}));
vi.mock("@/lib/understanding", () => ({
  processAttachment: dependencies.processAttachment,
}));
vi.mock("@/lib/attachment-status", () => ({
  getAttachmentStatus: dependencies.getAttachmentStatus,
}));
vi.mock("./demo-store", () => ({
  demo: {},
  DEMO_USER_ID: "demo-user",
  uuid: () => "demo-id",
}));
vi.mock("./demo-ai", () => ({
  composeDemoReply: vi.fn(),
  streamDemoReply: vi.fn(),
}));

import { uploadAttachment } from "../src/lib/data/api";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const ready = {
  attachment_id: "attachment-1",
  status: "ready" as const,
  error: null,
  processed_at: "2026-10-07T00:00:00Z",
  chunk_count: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  dependencies.upload.mockResolvedValue({ error: null });
  dependencies.insert.mockResolvedValue({
    data: {
      id: "attachment-1",
      message_id: "message-1",
      storage_path: "conversation-1/message-1/notes.txt",
      mime_type: "text/plain",
      size_bytes: 4,
      created_at: "2026-10-07T00:00:00Z",
    },
    error: null,
  });
  dependencies.getAttachmentStatus.mockResolvedValue(new Map([["attachment-1", ready]]));
});

describe("uploadAttachment", () => {
  it("does not resolve until processing and ready-with-chunks status are confirmed", async () => {
    const processing = deferred<{ success: boolean; message: string; chunk_count: number }>();
    dependencies.processAttachment.mockReturnValue(processing.promise);
    const upload = uploadAttachment(
      "conversation-1",
      "message-1",
      new File(["text"], "notes.txt", { type: "text/plain" }),
    );

    await vi.waitFor(() => expect(dependencies.processAttachment).toHaveBeenCalledWith("attachment-1"));
    expect(dependencies.getAttachmentStatus).not.toHaveBeenCalled();

    let settled = false;
    void upload.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    processing.resolve({ success: true, message: "processing_complete", chunk_count: 1 });
    await expect(upload).resolves.toMatchObject({ id: "attachment-1" });
    expect(dependencies.getAttachmentStatus).toHaveBeenCalledWith(["attachment-1"]);
  });

  it("rejects when processing fails instead of allowing an ungrounded AI request", async () => {
    dependencies.processAttachment.mockRejectedValue(new Error("pdf_parse_failed"));

    await expect(
      uploadAttachment(
        "conversation-1",
        "message-1",
        new File(["text"], "notes.txt", { type: "text/plain" }),
      ),
    ).rejects.toThrow("pdf_parse_failed");
    expect(dependencies.getAttachmentStatus).not.toHaveBeenCalled();
  });

  it("rejects unless the authoritative status is ready and has chunks", async () => {
    dependencies.processAttachment.mockResolvedValue({
      success: true,
      message: "processing_complete",
      chunk_count: 1,
    });
    dependencies.getAttachmentStatus.mockResolvedValue(
      new Map([["attachment-1", { ...ready, status: "failed", error: "pdf_parse_failed" }]]),
    );

    await expect(
      uploadAttachment(
        "conversation-1",
        "message-1",
        new File(["text"], "notes.txt", { type: "text/plain" }),
      ),
    ).rejects.toThrow("Attachment processing failed: pdf_parse_failed");
  });
});

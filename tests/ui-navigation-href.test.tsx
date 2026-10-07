import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import * as React from "react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/app",
}));

vi.mock("@/lib/data/documents", () => ({
  listDocuments: vi.fn(),
  processDocument: vi.fn(),
  uploadDocument: vi.fn(),
  deleteDocument: vi.fn(),
  processingErrorCopy: vi.fn(() => ({ title: "Error", description: "Details" })),
  processingErrorTone: vi.fn(() => "danger" as const),
}));

vi.mock("@/lib/data/attempts", () => ({
  listAttempts: vi.fn(),
  getAttempt: vi.fn(),
}));

vi.mock("@/lib/data/api", () => ({
  createConversation: vi.fn().mockResolvedValue("conv-123"),
}));

import { listDocuments } from "@/lib/data/documents";
import { getAttempt, listAttempts, type AttemptSummary } from "@/lib/data/attempts";
import type { QuizAttempt } from "@/lib/attempts";
import { Button } from "@/components/ui/button";
import DocumentsPage from "@/app/app/documents/page";
import LearningPage from "@/app/app/analysis/page";

describe("UI Navigation & Button href contract", () => {
  let consoleErrors: string[] = [];
  const originalError = console.error;

  beforeEach(() => {
    consoleErrors = [];
    console.error = (...args: unknown[]) => {
      const msg = args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ");
      consoleErrors.push(msg);
      originalError.apply(console, args);
    };
  });

  afterEach(() => {
    console.error = originalError;
    cleanup();
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("shared Button: renders MotionLink when asChild is true with valid href", () => {
    render(
      <Button asChild href="/app/practice?doc=test-1">
        <span>Practice</span>
      </Button>
    );

    const link = screen.getByRole("link", { name: /Practice/ });
    expect(link).toBeTruthy();
    expect(link.getAttribute("href")).toBe("/app/practice?doc=test-1");

    const hrefErrors = consoleErrors.filter((e) =>
      e.includes("Failed prop type: The prop `href` expects a `string` or `object` in `<Link>`, but got `undefined`")
    );
    expect(hrefErrors).toHaveLength(0);
  });

  it("documents: ready document renders valid action destinations without href console errors", async () => {
    vi.mocked(listDocuments).mockResolvedValue([
      {
        id: "doc-gate-123",
        filename: "algorithms_handbook.pdf",
        storage_path: "user-1/doc-gate-123.pdf",
        size_bytes: 2 * 1024 * 1024,
        status: "ready",
        processing_error: null,
        page_count: 42,
        missing_text_pages: [],
      },
    ]);

    render(<DocumentsPage />);

    await waitFor(() => {
      expect(screen.getByText("algorithms_handbook.pdf")).toBeTruthy();
    });

    // 1. "Practice with this document" must be an accessible link with encoded document ID
    const practiceLink = screen.getByRole("link", { name: /Practice with this document/i });
    expect(practiceLink).toBeTruthy();
    expect(practiceLink.getAttribute("href")).toBe("/app/practice?doc=doc-gate-123");

    // 2. Reading extracted content replaces the misleading chat action.
    expect(screen.getByRole("button", { name: /Read extracted content/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Ask AI about this document/i })).toBeNull();

    // 3. Confirm zero undefined href errors
    const hrefErrors = consoleErrors.filter((e) =>
      e.includes("Failed prop type: The prop `href` expects a `string` or `object` in `<Link>`, but got `undefined`")
    );
    expect(hrefErrors).toHaveLength(0);
  });

  it("analysis: recommendations render valid action destinations without href console errors", async () => {
    const mockAttempt = {
      id: "attempt-1",
      user_id: "user-1",
      subject: "Algorithms",
      topic: "Dynamic Programming",
      difficulty: "standard",
      question_count: 5,
      created_at: new Date(Date.now() - 3600000).toISOString(),
      submitted_at: new Date(Date.now() - 3000000).toISOString(),
      answers: {},
      questions: [
        {
          id: "q-1",
          subject: "Algorithms",
          topic: "Dynamic Programming",
          prompt: "What is optimal substructure?",
          kind: "MCQ",
          marks: 1,
          provenance: "GATE 2024",
          options: ["A", "B", "C", "D"],
        },
      ],
      result: {
        awarded: 5,
        max: 10,
        correct: 1,
        wrong: 2,
        unanswered: 2,
      },
    };

    vi.mocked(listAttempts).mockResolvedValue([
      {
        id: "attempt-1",
        subject: "Algorithms",
        topic: "Dynamic Programming",
        difficulty: "standard",
        question_count: 5,
        created_at: new Date(Date.now() - 3600000).toISOString(),
        submitted_at: new Date(Date.now() - 3000000).toISOString(),
        result: mockAttempt.result,
      } as unknown as AttemptSummary,
    ]);

    vi.mocked(getAttempt).mockResolvedValue(mockAttempt as unknown as QuizAttempt);

    render(<LearningPage />);

    await waitFor(() => {
      expect(screen.getByText("Targeted Study Directives")).toBeTruthy();
    });

    // Check all recommendation links have valid non-empty hrefs
    const recommendationLinks = screen.getAllByRole("link");
    const directiveLinks = recommendationLinks.filter((link) => {
      const href = link.getAttribute("href");
      return href && href.startsWith("/app/practice");
    });
    expect(directiveLinks.length).toBeGreaterThan(0);

    for (const link of directiveLinks) {
      const href = link.getAttribute("href");
      expect(href).toBeTruthy();
      expect(href).not.toBe("undefined");
      expect(href).not.toBe("#");
    }

    // Confirm zero undefined href errors
    const hrefErrors = consoleErrors.filter((e) =>
      e.includes("Failed prop type: The prop `href` expects a `string` or `object` in `<Link>`, but got `undefined`")
    );
    expect(hrefErrors).toHaveLength(0);
  });
});

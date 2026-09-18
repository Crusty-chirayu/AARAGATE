import { describe, expect, it, vi, beforeEach } from "vitest";
import { extractText } from "../supabase/functions/_shared/extract";

const pdf = vi.hoisted(() => ({ getDocument: vi.fn() }));
vi.mock("npm:pdfjs-dist@4.8.69", () => ({ ...pdf, GlobalWorkerOptions: {} }));
const bytes = new TextEncoder().encode("%PDF-1.7\n");

beforeEach(() => vi.clearAllMocks());

describe("PDF extraction truthfulness", () => {
  it("rejects parser failures instead of returning placeholder source text", async () => {
    pdf.getDocument.mockReturnValue({ promise: Promise.reject(new Error("bad pdf")), destroy: vi.fn() });
    await expect(extractText("paper.pdf", "application/pdf", bytes)).rejects.toThrow();
  });

  it("reports physical page count and unreadable pages without inventing text", async () => {
    pdf.getDocument.mockReturnValue({ promise: Promise.resolve({
      numPages: 3,
      getPage: async (page: number) => ({ getTextContent: async () => ({ items: page === 2 ? [] : [{ str: `page ${page}` }] }) }),
    }), destroy: vi.fn() });
    const result = await extractText("paper.pdf", "application/pdf", bytes);
    expect(result.metadata.pageCount).toBe(3);
    expect(result.metadata).toMatchObject({ missingTextPages: [2] });
    expect(result.pages.map(p => p.pageNumber)).toEqual([1, 3]);
    expect(result.text).not.toContain("page 2");
  });

  it("rejects image-only PDFs with an explicit no-OCR error", async () => {
    pdf.getDocument.mockReturnValue({ promise: Promise.resolve({ numPages: 1,
      getPage: async () => ({ getTextContent: async () => ({ items: [] }) }),
    }), destroy: vi.fn() });
    await expect(extractText("scan.pdf", "application/pdf", bytes)).rejects.toThrow("pdf_no_readable_text");
  });

  it("rejects disguised non-PDF bytes before parsing", async () => {
    await expect(extractText("paper.pdf", "application/pdf", new TextEncoder().encode("not pdf"))).rejects.toThrow();
    expect(pdf.getDocument).not.toHaveBeenCalled();
  });

  it("rejects excessive page counts and destroys the parser", async () => {
    const destroy = vi.fn();
    pdf.getDocument.mockReturnValue({ promise: Promise.resolve({ numPages: 201 }), destroy });
    await expect(extractText("paper.pdf", "application/pdf", bytes)).rejects.toThrow("pdf_page_limit");
    expect(destroy).toHaveBeenCalledOnce();
  });
});

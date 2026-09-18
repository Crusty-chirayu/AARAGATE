import { preflight, json } from "../_shared/cors.ts";
import { requireUser, HttpError } from "../_shared/supabase.ts";
import { extractText, chunkPages } from "../_shared/extract.ts";

// Caller JWT throughout: no admin client, signed public URLs, or shared-room writes.
Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);
  try {
    const { user, supa } = await requireUser(req);
    const body = await req.json().catch(() => null);
    if (!body || typeof body.document_id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.document_id)) {
      throw new HttpError(400, "invalid_document_id");
    }
    const { data: doc, error } = await supa.from("documents")
      .select("id, filename, storage_path, size_bytes, status").eq("id", body.document_id).eq("user_id", user.id).maybeSingle();
    if (error) throw new HttpError(503, "document_lookup_failed");
    if (!doc) throw new HttpError(404, "document_not_found");
    if (doc.status === "ready" || doc.status === "incomplete") return json(req, { status: doc.status });
    const { data: token, error: claimError } = await supa.rpc("claim_document", { p_document_id: doc.id });
    if (claimError) throw new HttpError(503, "document_claim_failed");
    if (!token) throw new HttpError(409, "document_busy");
    try {
      if (doc.storage_path !== `${user.id}/${doc.id}/source.pdf`) throw new Error("invalid_storage_path");
      const { data: file, error: downloadError } = await supa.storage.from("documents").download(doc.storage_path);
      if (downloadError || !file) throw new Error("document_download_failed");
      if (file.size !== doc.size_bytes || file.size > 10 * 1024 * 1024 || file.size === 0) throw new Error("invalid_file_size");
      if (!doc.filename.toLowerCase().endsWith(".pdf")) throw new Error("invalid_pdf_filename");
      const extracted = await extractText(doc.filename, "application/pdf", new Uint8Array(await file.arrayBuffer()));
      const chunks = chunkPages(extracted.pages);
      if (!chunks.length || chunks.length > 800) throw new Error("document_chunk_limit");
      const { error: saveError } = await supa.rpc("complete_document", {
        p_document_id: doc.id, p_token: token, p_pages: extracted.metadata.pageCount,
        p_missing: extracted.metadata.missingTextPages ?? [],
        p_chunks: chunks.map(c => ({ page_number: c.pageNumber, content: c.content })),
      });
      if (saveError) throw new Error("document_persistence_failed");
      return json(req, { status: extracted.metadata.missingTextPages?.length ? "incomplete" : "ready" });
    } catch (e) {
      // Never return raw parser/provider errors: they can contain source text.
      const known = new Set(["pdf_no_readable_text", "pdf_page_limit", "pdf_text_limit", "invalid_pdf_signature",
        "document_download_failed", "invalid_file_size", "invalid_pdf_filename", "document_chunk_limit", "document_persistence_failed"]);
      const code = e instanceof Error && known.has(e.message) ? e.message : "pdf_processing_failed";
      const { error: failureError } = await supa.from("documents").update({ status: "failed", processing_error: code, processing_token: null })
        .eq("id", doc.id).eq("user_id", user.id).eq("status", "processing").eq("processing_token", token);
      return json(req, { error: failureError ? "processing_status_save_failed_retry_after_five_minutes" : code }, 422);
    }
  } catch (e) {
    return json(req, { error: e instanceof HttpError ? e.code : "document_request_failed" }, e instanceof HttpError ? e.status : 500);
  }
});

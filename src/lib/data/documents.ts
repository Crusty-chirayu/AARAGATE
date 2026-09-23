"use client";

import { getSupabaseBrowser } from "@/lib/supabase/client";
import { validateAttachmentFile } from "@/lib/attachments";

export interface StudyDocument {
  id: string;
  filename: string;
  storage_path: string;
  size_bytes: number;
  status: "queued" | "processing" | "ready" | "incomplete" | "failed" | "deleting";
  processing_error: string | null;
  page_count: number | null;
  missing_text_pages: number[];
}
export interface DocumentHit {
  document_id: string;
  filename: string;
  page_number: number;
  content: string;
  chunk_id: string;
}

async function authenticated() {
  const supa = getSupabaseBrowser();
  if (!supa) throw new Error("Documents require a configured Supabase project and a signed-in account. Demo uploads are not supported.");
  const { data, error } = await supa.auth.getUser();
  if (error || !data.user) throw new Error("Sign in to access your documents.");
  return { supa, user: data.user };
}

export async function listDocuments(): Promise<StudyDocument[]> {
  const { supa, user } = await authenticated();
  const { data, error } = await supa.from("documents").select("id,filename,storage_path,size_bytes,status,processing_error,page_count,missing_text_pages")
    .eq("user_id", user.id).order("created_at", { ascending: false }).limit(100);
  if (error) throw new Error("Could not load documents. Check the document migration and connection.");
  return data as StudyDocument[];
}

export async function uploadDocument(file: File): Promise<string> {
  const { supa, user } = await authenticated();
  const verdict = validateAttachmentFile(file);
  if (!verdict.ok) throw new Error(verdict.error);
  if (file.type !== "application/pdf" || !file.name.toLowerCase().endsWith(".pdf")) throw new Error("Upload a text-based PDF only.");
  if (!file.name.length || file.name.length > 255 || /[\/\\]/.test(file.name) || file.name.includes("..") || [...file.name].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) {
    throw new Error("Use a filename without paths or control characters.");
  }
  if (await file.slice(0, 5).text() !== "%PDF-") throw new Error("This file does not have a PDF signature.");
  const id = crypto.randomUUID();
  const { error: rowError } = await supa.from("documents").insert({ id, user_id: user.id, filename: file.name, size_bytes: file.size });
  if (rowError) throw new Error("Could not register the document. No upload was started.");
  const { error } = await supa.storage.from("documents").upload(`${user.id}/${id}/source.pdf`, file, { contentType: "application/pdf", upsert: false });
  if (error) {
    // Retain metadata even on uncertain network outcomes so cleanup is retryable.
    throw new Error("Upload did not complete. The queued document remains visible; delete it and upload again, or process it if the upload reached storage.");
  }
  return id;
}

export async function processDocument(id: string): Promise<void> {
  const { supa } = await authenticated();
  const { error } = await supa.functions.invoke("document-processor", { body: { document_id: id } });
  if (error) throw new Error("Processing did not complete. Refresh for the saved error; interrupted jobs can be retried after five minutes.");
}

export async function deleteDocument(id: string): Promise<void> {
  const { supa, user } = await authenticated();
  const { data: doc, error } = await supa.from("documents").update({ status: "deleting", processing_token: null })
    .eq("id", id).eq("user_id", user.id).select("storage_path").maybeSingle();
  if (error || !doc) throw new Error("Document not found or deletion could not start.");
  const { error: storageError } = await supa.storage.from("documents").remove([doc.storage_path]);
  if (storageError) throw new Error("Storage deletion failed. The document remains listed; retry deletion.");
  const { error: rowError } = await supa.from("documents").delete().eq("id", id).eq("user_id", user.id);
  if (rowError) throw new Error("File removed, but metadata cleanup failed. Retry deletion.");
}

export async function searchDocuments(query: string): Promise<DocumentHit[]> {
  const { supa } = await authenticated();
  if (!query.trim() || query.length > 500) throw new Error("Enter a search of 1–500 characters.");
  const { data, error } = await supa.rpc("search_documents", { p_query: query });
  if (error) throw new Error("Document search failed. No grounded AI answer has been generated.");
  return data as DocumentHit[];
}

/** Map a persisted, sanitized processing error code to honest user-facing copy. */
export function processingErrorCopy(code: string | null): { title: string; description: string } {
  switch (code) {
    case "unauthenticated":
      return { title: "Sign in required", description: "Sign in to upload and process study material." };
    case "invalid_file":
      return { title: "Unsupported file", description: "This file is not a PDF AARAGATE can read. Upload a PDF instead." };
    case "file_too_large":
      return { title: "File too large", description: "This upload exceeds the size limit. Split the document and try again." };
    case "storage_upload_failed":
      return { title: "Upload failed", description: "The file could not be stored. Check your connection and try again." };
    case "document_create_failed":
      return { title: "Could not register the document", description: "The record was not created, so nothing was processed. Try again." };
    case "extraction_failed":
      return {
        title: "Text extraction failed",
        description:
          "No text could be read from this PDF. Scanned or image-only PDFs are not supported — there is no OCR — so upload a PDF with selectable text.",
      };
    case "extraction_empty":
      return {
        title: "No text found",
        description:
          "The PDF produced no extractable text. Image-only pages are not read (no OCR); upload a text-based PDF.",
      };
    case "chunking_failed":
      return {
        title: "Chunking failed",
        description:
          "The extracted text could not be split into usable chunks. Nothing was indexed; retry or use a different file.",
      };
    case "embedding_failed":
      return {
        title: "Embedding failed",
        description:
          "Text chunks were stored, but vector embedding did not complete. Retry processing — full-text search still works meanwhile.",
      };
    // Codes `document-processor` actually persists in `documents.processing_error`
    // (its closed vocabulary — raw parser text is never stored because it can
    // echo document content).
    case "pdf_no_readable_text":
      return {
        title: "No selectable text",
        description:
          "This PDF has no extractable text — scanned or image-only PDFs are not supported (there is no OCR). Upload a PDF with selectable text.",
      };
    case "pdf_page_limit":
      return { title: "Too many pages", description: "The PDF has more pages than the processor accepts. Split it and upload the parts." };
    case "pdf_text_limit":
      return { title: "Text too large", description: "The extracted text is larger than the processor accepts. Split the document and try again." };
    case "invalid_pdf_signature":
      return { title: "Not a valid PDF", description: "The stored file failed the PDF signature check. Re-upload the original file." };
    case "document_download_failed":
      return { title: "Stored file unreadable", description: "The uploaded file could not be read back from private storage. Retry, or re-upload." };
    case "invalid_file_size":
      return { title: "File changed or too large", description: "The stored file is empty, changed since upload, or over the 10 MB limit." };
    case "invalid_pdf_filename":
      return { title: "Filename lost its .pdf", description: "The document record no longer names a .pdf file, so processing was refused. Re-upload." };
    case "document_chunk_limit":
      return { title: "Nothing usable to index", description: "The document produced no chunks or exceeded the 800-chunk limit — try a smaller document." };
    case "document_persistence_failed":
      return { title: "Could not save the index", description: "The extracted chunks could not be saved. Retry processing in a moment." };
    case "pdf_processing_failed":
      return {
        title: "PDF could not be read",
        description: "The file may be malformed or use unsupported content. Retry, or upload a different PDF.",
      };
    case "document_busy":
    case "document_claim_failed":
    case "processing_status_save_failed_retry_after_five_minutes":
      return {
        title: "Document busy",
        description: "A processing job still holds this document — interrupted jobs become retryable after a few minutes.",
      };
    case "document_not_found":
    case "invalid_document_id":
      return { title: "Document unavailable", description: "This document record no longer exists. Upload the file again." };
    case "document_lookup_failed":
    case "document_request_failed":
      return { title: "Service unreachable", description: "The processing service could not be reached. Retry in a moment." };
    case "processing_interrupted":
      return {
        title: "Processing interrupted",
        description:
          "Processing stopped partway through. Retry — interrupted jobs become retryable after a short lock window.",
      };
    default:
      return {
        title: "Processing failed",
        description: "This document could not be processed. Retry, or upload a different file.",
      };
  }
}

/**
 * Alert tone for a persisted processing error. Busy/claim/service codes are
 * transient warnings; a stored `processing_error` on a failed document is a
 * hard failure the student must act on.
 */
export function processingErrorTone(code: string | null): "danger" | "warning" {
  switch (code) {
    case "document_busy":
    case "document_claim_failed":
    case "processing_status_save_failed_retry_after_five_minutes":
    case "document_lookup_failed":
    case "document_request_failed":
    case "processing_interrupted":
      return "warning";
    default:
      return "danger";
  }
}

/** Badge tone for a document status. */
export function processingStateTone(
  status: string,
): "neutral" | "accent" | "success" | "warning" | "danger" {
  switch (status) {
    case "ready":
      return "success";
    case "incomplete":
      return "warning";
    case "failed":
      return "danger";
    case "processing":
      return "accent";
    default:
      return "neutral"; // queued, deleting
  }
}

/** Short badge label for a document status — never a claim beyond what is true. */
export function processingStateLabel(status: string): string {
  switch (status) {
    case "queued":
      return "Queued";
    case "processing":
      return "Processing";
    case "ready":
      return "Ready";
    case "incomplete":
      return "Partial text";
    case "failed":
      return "Failed";
    case "deleting":
      return "Deleting";
    default:
      return "Unknown";
  }
}


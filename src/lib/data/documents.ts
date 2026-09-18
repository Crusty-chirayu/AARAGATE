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

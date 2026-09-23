"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { FileText, FolderOpen, Loader2, RefreshCw, Trash2, Upload } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/modal";
import {
  deleteDocument,
  listDocuments,
  processDocument,
  processingErrorCopy,
  processingErrorTone,
  uploadDocument,
  type StudyDocument,
} from "@/lib/data/documents";
import { riseIn, staggerParent } from "@/lib/motion";

/**
 * The ingestion surface: upload a PDF, watch it process, retry failures,
 * delete what you no longer need. The backend contract it drives lives in
 * `@/lib/data/documents` — every query there is owner-scoped, and failures
 * surface as honest copy (`processingErrorCopy`) instead of raw codes.
 */
const STATUS_BADGE: Record<StudyDocument["status"], { label: string; tone: "neutral" | "accent" | "success" | "warning" | "danger" }> = {
  queued: { label: "Queued", tone: "neutral" },
  processing: { label: "Processing", tone: "accent" },
  ready: { label: "Ready", tone: "success" },
  incomplete: { label: "Partial text", tone: "warning" },
  failed: { label: "Failed", tone: "danger" },
  deleting: { label: "Deleting…", tone: "neutral" },
};

/**
 * Statuses a student may (re)kick processing for. `incomplete` is deliberately
 * excluded: `document-processor` treats it as terminal (no OCR will ever read
 * the missing pages), so a retry button there would be a silent no-op.
 */
const RETRYABLE: ReadonlySet<StudyDocument["status"]> = new Set(["queued", "failed"]);

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Something went wrong. Try again.";

export default function DocumentsPage() {
  const [docs, setDocs] = React.useState<StudyDocument[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [actionId, setActionId] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState<StudyDocument | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const reload = React.useCallback(async () => {
    try {
      setDocs(await listDocuments());
      setLoadError(null);
    } catch (error) {
      setLoadError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  async function runProcessing(id: string): Promise<void> {
    setActionId(id);
    setActionError(null);
    try {
      await processDocument(id);
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setActionId(null);
      await reload();
    }
  }

  async function handleFilePicked(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    // Reset first so picking the same file again re-fires change.
    event.target.value = "";
    if (!file) return;
    setUploading(true);
    setActionError(null);
    try {
      const id = await uploadDocument(file);
      // Surface the row as "Queued" before processing starts, so the student
      // sees their document exist even while the processor call is in flight.
      await reload();
      await runProcessing(id);
    } catch (error) {
      setActionError(errorMessage(error));
      // The row may exist even when the upload threw mid-flight; refresh so
      // a retryable "queued" document becomes visible instead of lost.
      await reload();
    } finally {
      setUploading(false);
    }
  }

  async function confirmDelete(): Promise<void> {
    if (!deleting) return;
    setActionId(deleting.id);
    setActionError(null);
    try {
      await deleteDocument(deleting.id);
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setActionId(null);
      setDeleting(null);
      await reload();
    }
  }

  const busy = uploading || actionId !== null;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6 sm:px-6">
      <motion.div
        variants={staggerParent()}
        initial="hidden"
        animate="show"
        className="space-y-4"
      >
        <motion.header variants={riseIn} className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[19px] font-semibold text-[var(--fg)]">Documents</h1>
            <p className="mt-0.5 text-[13px] text-[var(--fg-muted)]">
              Your study PDFs, private to your account. Ready documents can ground
              practice-question generation in your own material.
            </p>
          </div>
          <Button size="sm" onClick={() => inputRef.current?.click()} disabled={busy}>
            <Upload className="h-3.5 w-3.5" aria-hidden />
            {uploading ? "Uploading…" : "Upload PDF"}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            aria-label="Upload a study PDF"
            disabled={busy}
            onChange={(event) => void handleFilePicked(event)}
          />
        </motion.header>

        {loadError ? (
          <motion.div variants={riseIn}>
            <Alert
              tone="danger"
              title="Could not load your documents"
              action={
                <Button variant="secondary" size="sm" onClick={() => void reload()}>
                  Retry
                </Button>
              }
            >
              {loadError}
            </Alert>
          </motion.div>
        ) : null}

        {actionError ? (
          <motion.div variants={riseIn}>
            <Alert tone="danger" title="Something went wrong">
              {actionError}
            </Alert>
          </motion.div>
        ) : null}

        {loading ? (
          <motion.div
            variants={riseIn}
            role="status"
            className="flex items-center gap-2 text-[13px] text-[var(--fg-muted)]"
          >
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading documents…
          </motion.div>
        ) : docs.length === 0 && !loadError ? (
          <motion.div variants={riseIn}>
            <EmptyState
              icon={FolderOpen}
              title="No documents yet"
              description="Upload a text-based PDF (up to 10 MB) to use it as grounded context when generating practice questions."
              note="Scanned or image-only PDFs are not supported — there is no OCR, so pages without selectable text cannot be read."
              action={
                <Button size="sm" onClick={() => inputRef.current?.click()} disabled={busy}>
                  <Upload className="h-3.5 w-3.5" aria-hidden />
                  Upload a PDF
                </Button>
              }
            />
          </motion.div>
        ) : (
          <motion.div variants={riseIn}>
            <Card>
              <CardHeader
                icon={FileText}
                title={`${docs.length} document${docs.length === 1 ? "" : "s"}`}
                description="Only you can see these. Failed uploads keep their row so you can retry or delete them."
              />
              <CardBody>
                <ul className="divide-y divide-[var(--border)]">
                  {docs.map((doc) => {
                    const badge = STATUS_BADGE[doc.status];
                    const working = actionId === doc.id;
                    const failure =
                      doc.status === "failed" && doc.processing_error
                        ? processingErrorCopy(doc.processing_error)
                        : null;
                    return (
                      <li key={doc.id} className="flex items-start justify-between gap-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate text-[13.5px] font-medium text-[var(--fg)]">
                              {doc.filename}
                            </span>
                            <Badge tone={badge.tone} size="sm">
                              {working && doc.status !== "processing" ? "Working…" : badge.label}
                            </Badge>
                          </div>
                          <p className="mt-0.5 text-[11.5px] text-[var(--fg-subtle)]">
                            {(doc.size_bytes / (1024 * 1024)).toFixed(1)} MB
                            {doc.page_count !== null
                              ? ` · ${doc.page_count} page${doc.page_count === 1 ? "" : "s"}`
                              : ""}
                            {doc.missing_text_pages.length > 0
                              ? ` · ${doc.missing_text_pages.length} page${doc.missing_text_pages.length === 1 ? "" : "s"} without text`
                              : ""}
                          </p>
                          {failure ? (
                            <div className="mt-1.5">
                              <Alert
                                tone={processingErrorTone(doc.processing_error)}
                                title={failure.title}
                              >
                                {failure.description}
                              </Alert>
                            </div>
                          ) : null}
                          {doc.status === "incomplete" ? (
                            <p className="mt-1 text-[12px] text-[var(--warning)]">
                              Some pages had no selectable text and are excluded from AI context
                              — there is no OCR. The rest of the document is usable.
                            </p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {working ? (
                            <Loader2
                              className="h-3.5 w-3.5 animate-spin text-[var(--fg-subtle)]"
                              aria-hidden
                            />
                          ) : null}
                          {RETRYABLE.has(doc.status) ? (
                            <Button
                              variant="ghost"
                              size="iconSm"
                              aria-label={`Process ${doc.filename} again`}
                              disabled={busy}
                              onClick={() => void runProcessing(doc.id)}
                            >
                              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                            </Button>
                          ) : null}
                          <Button
                            variant="ghost"
                            size="iconSm"
                            aria-label={`Delete ${doc.filename}`}
                            disabled={busy}
                            onClick={() => setDeleting(doc)}
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </CardBody>
            </Card>
          </motion.div>
        )}

        <ConfirmDialog
          open={deleting !== null}
          onClose={() => setDeleting(null)}
          onConfirm={() => void confirmDelete()}
          title="Delete this document?"
          confirmLabel="Delete"
          description={
            deleting
              ? `This permanently removes ${deleting.filename} and its stored file. Practice questions already generated from it are unaffected, but it can no longer ground new ones.`
              : undefined
          }
        />
      </motion.div>
    </div>
  );
}

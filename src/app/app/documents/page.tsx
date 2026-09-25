"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Bot, FileText, FolderOpen, Loader2, RefreshCw, Sparkles, Trash2, Upload } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { createConversation } from "@/lib/data/api";
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
  const router = useRouter();
  const toast = useToast();
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

  async function runProcessing(id: string, filename?: string): Promise<void> {
    setActionId(id);
    setActionError(null);
    try {
      if (filename) {
        toast.push({
          kind: "info",
          title: filename,
          description: "Processing document…",
        });
      }
      await processDocument(id);
      if (filename) {
        toast.push({
          kind: "success",
          title: `✓ ${filename} is ready`,
        });
      }
    } catch (error) {
      const msg = errorMessage(error);
      setActionError(msg);
      if (filename) {
        toast.push({
          kind: "error",
          title: `⚠ ${filename} couldn't be processed`,
          description: msg,
        });
      }
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
    toast.push({ kind: "info", title: `Uploading ${file.name}…` });
    try {
      const id = await uploadDocument(file);
      toast.push({ kind: "success", title: `✓ ${file.name} uploaded` });
      // Surface the row as "Queued" before processing starts
      await reload();
      await runProcessing(id, file.name);
    } catch (error) {
      const msg = errorMessage(error);
      setActionError(msg);
      toast.push({
        kind: "error",
        title: `⚠ ${file.name} couldn't be processed`,
        description: msg,
      });
      await reload();
    } finally {
      setUploading(false);
    }
  }

  async function confirmDelete(): Promise<void> {
    if (!deleting) return;
    const filename = deleting.filename;
    setActionId(deleting.id);
    setActionError(null);
    try {
      await deleteDocument(deleting.id);
      toast.push({ kind: "success", title: `✓ ${filename} deleted` });
    } catch (error) {
      const msg = errorMessage(error);
      setActionError(msg);
      toast.push({ kind: "error", title: "Couldn't delete document", description: msg });
    } finally {
      setActionId(null);
      setDeleting(null);
      await reload();
    }
  }

  async function askAiAboutDoc(doc: StudyDocument): Promise<void> {
    try {
      const id = await createConversation({
        type: "direct_ai",
        ai_mode: "auto",
        topic: `Study: ${doc.filename}`,
      });
      const prefill = `I am studying from my uploaded document "${doc.filename}". Please give me an overview of the key GATE concepts covered in it and suggest high-yield areas to focus on.`;
      router.push(`/app/c/${id}?prefill=${encodeURIComponent(prefill)}`);
    } catch (e) {
      toast.push({ kind: "error", title: "Couldn't start chat", description: String(e) });
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

                          {(doc.status === "ready" || doc.status === "incomplete") && (
                            <div className="mt-3 flex flex-wrap items-center gap-2 pt-2 border-t border-[var(--border)]/50">
                              <Button
                                asChild
                                href={`/app/practice?doc=${encodeURIComponent(doc.id)}`}
                                size="sm"
                                variant="secondary"
                                className="h-8 gap-1.5 text-[12px] font-medium text-[var(--accent-text)] hover:bg-[var(--accent-subtle)]"
                              >
                                <Sparkles className="h-3.5 w-3.5 text-[var(--accent-text)]" aria-hidden />
                                Practice with this document
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => void askAiAboutDoc(doc)}
                                disabled={busy}
                                className="h-8 gap-1.5 text-[12px] font-medium text-[var(--fg-muted)] hover:text-[var(--fg)]"
                              >
                                <Bot className="h-3.5 w-3.5 text-[var(--ai-teal-500)]" aria-hidden />
                                Ask AI about this document
                              </Button>
                            </div>
                          )}
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

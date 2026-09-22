// supabase/functions/practice-generator/index.ts
//
// Practice question generation: validated config → document context →
// provider request → SSE stream → structured validation → canonical
// questions with provenance.
//
// Reuses the app's own contracts (src/lib/practice.ts) so the client, this
// function and the scoring engine all speak one question language. Unusable
// model output is a 422, never a fake paper.

import { preflight, corsHeaders, json } from "../_shared/cors.ts";
import { requireUser, adminClient, userClient } from "../_shared/supabase.ts";
import { enforceRateLimit } from "../_shared/ratelimit.ts";
import { moderate, logModeration } from "../_shared/moderation.ts";
import {
  resolveProvider,
  buildProviderRequest,
  parseSSEFrame,
  type ConversationMessage,
} from "../_shared/provider.ts";
import {
  validatePracticeConfig,
  buildPracticePrompt,
  parsePracticeQuestions,
  practiceProvenance,
  type PracticeConfig,
} from "../../../src/lib/practice.ts";
import { selectContext, type ContextChunk } from "../../../src/lib/context-selection.ts";

const MODEL = Deno.env.get("AI_PRACTICE_MODEL") ?? "openai/gpt-4o-mini";
const MAX_TOKENS = 4096;
/** How many stored chunks a generation request may pull. */
const MAX_CHUNKS = 200;

/** Local failure carrying a user-safe message and an HTTP status. */
class GenError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
interface RequestBody {
  config?: unknown;
}
Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;

  try {
    const { user, authHeader } = await requireUser(req);
    const admin = adminClient();
    await enforceRateLimit(admin, user.id, "ai_invocations_per_min");

    const body = (await req.json()) as RequestBody;
    const verdict = validatePracticeConfig(body.config);
    if (!verdict.ok) {
      return json(req, { error: "invalid_config", detail: verdict.error }, 400);
    }
    const config: PracticeConfig = verdict.config;

    // Labels the user typed become model input — treat them as untrusted.
    const mod = await moderate(`${config.branch}\n${config.subject}\n${config.topic ?? ""}`);
    if (mod.verdict === "blocked") {
      await logModeration(admin, null, "pre", mod);
      return json(req, { error: "moderation_blocked", detail: "The request was blocked." }, 422);
    }
    if (mod.verdict !== "pass") {
      // Failed closed: never send unmoderated input to the provider.
      return json(
        req,
        { error: "moderation_unavailable", detail: "Generation is temporarily unavailable." },
        503,
      );
    }

    const context = await gatherContext(userClient(authHeader), config);
    const prompt = buildPracticePrompt(config);
    const messages: ConversationMessage[] = [
      {
        role: "user",
        content: context
          ? `${prompt}\n\nUse ONLY the following source material when grounding the questions; do not cite anything absent from it.\n\n<source>\n${context.text}\n</source>`
          : prompt,
      },
    ];

    const provider = resolveProvider(Deno.env.get("AI_PROVIDER"));
    const apiKey = Deno.env.get(provider.apiKeyEnv);
    if (!apiKey) {
      throw new GenError(`Missing secret ${provider.apiKeyEnv} for AI_PROVIDER=${provider.id}`, 500);
    }

    const { url, init } = buildProviderRequest({
      model: MODEL,
      maxTokens: MAX_TOKENS,
      system: null,
      messages,
      apiKey,
      endpoint: provider,
    });

    const upstream = await fetch(url, init);
    if (!upstream.ok || !upstream.body) {
      throw new GenError(`The provider returned an error (${upstream.status}).`, 502);
    }

    // Always-streaming SSE: accumulate deltas; parseSSEFrame ignores malformed
    // frames instead of throwing, so a partial/keep-alive frame cannot abort us.
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let reply = "";
    let streamError: string | null = null;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        for (const ev of parseSSEFrame(frame)) {
          if (ev.kind === "delta") reply += ev.text;
          else if (ev.kind === "error") streamError = ev.message;
        }
      }
    }
    if (reply.trim() === "" && streamError) {
      throw new GenError("The provider returned an error before any content.", 502);
    }

    const parsed = parsePracticeQuestions(reply);
    if (!parsed.ok) {
      return json(req, { error: parsed.reason, detail: parsed.error }, 422);
    }

    return json(req, {
      questions: parsed.questions,
      provenance: practiceProvenance(config),
      grounded: Boolean(context),
      contextChunkIds: context ? context.chunkIds : [],
      stats: {
        requested: Object.values(config.counts).reduce((a, b) => a + b, 0),
        delivered: parsed.questions.length,
        rejected: parsed.rejected.length,
        duplicates: parsed.duplicates,
        truncated: parsed.truncated,
        rejectedItems: parsed.rejected,
      },
    });
  } catch (e) {
    if (e instanceof GenError) {
      return json(req, { error: e.message }, e.status);
    }
    return json(req, { error: "internal_error", detail: null }, 500);
  }
});

/**
 * Pull stored chunks for the requested document (RLS-scoped to the caller)
 * and select the context via the shared, deterministic selection logic.
 */
async function gatherContext(
  supa: ReturnType<typeof userClient>,
  config: PracticeConfig,
): Promise<{ text: string; chunkIds: string[] } | null> {
  if (!config.sourceDocumentId) return null;

  const { data, error } = await supa
    .from("document_chunks")
    .select("id, document_id, page_number, content")
    .eq("document_id", config.sourceDocumentId)
    .order("chunk_index", { ascending: true })
    .limit(MAX_CHUNKS);

  if (error) {
    throw new GenError("Could not read the selected document.", 502);
  }

  // RLS already scopes rows to the caller; selectContext drops malformed rows
  // and preserves page provenance exactly as stored.
  const chunks = (data ?? []) as unknown as ContextChunk[];
  const selected = selectContext(chunks, config);
  if (selected.length === 0) return null;

  const text = selected
    .map(
      (c) =>
        `[doc ${c.document_id}${c.page_number !== null ? ` p.${c.page_number}` : ""}]\n${c.content}`,
    )
    .join("\n\n---\n\n");
  return { text, chunkIds: selected.map((c) => c.id) };
}

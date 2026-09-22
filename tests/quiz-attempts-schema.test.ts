/**
 * Static guard: the quiz-attempt migration and the practice-generator function
 * must agree, and the answer-key protections must actually be present in the SQL.
 *
 * WHY THIS EXISTS. Neither tsc nor vitest can see SQL, and `supabase/functions`
 * is outside the TypeScript project (Deno runtime), so the whole server path is
 * ungated: a missing table GRANT, a renamed column, or a deleted policy would
 * only ever surface as a runtime 500. This suite parses the migration and the
 * Edge Function and asserts the invariants the practice flow depends on.
 *
 * WHAT THIS IS NOT. It is not a substitute for applying the migration. It proves
 * the statements are present and consistent — not that PostgreSQL accepts them,
 * which no local runtime here can check (no Docker, no Postgres, see
 * docs). Treat every assertion below as "statically validated", never as
 * "runtime validated".
 *
 *   npx vitest run tests/quiz-attempts-schema.test.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

// vitest runs with the project root as cwd (see the `RUN` banner in its output),
// and `import.meta.url` is not a file: URL under this config.
const MIGRATION = resolve("supabase/migrations/20260920000000_quiz_attempts.sql");
const EDGE = resolve("supabase/functions/practice-generator/index.ts");

const migration = readFileSync(MIGRATION, "utf8");
const edge = readFileSync(EDGE, "utf8");

/** Whitespace-insensitive view, so reindenting the SQL cannot break a test. */
const flat = (text: string) => text.replace(/\s+/g, " ").toLowerCase();
const flatMigration = flat(migration);

/** Non-comment statements that grant something on `quiz_attempt_items`. */
const itemGrants = migration
  .split("\n")
  .filter((line) => !/^\s*--/.test(line))
  .filter((line) => /\bgrant\b/i.test(line) && /quiz_attempt_items/i.test(line));

/** Column names declared by a `create table if not exists public.<table>` block. */
function declaredColumns(table: string): string[] {
  const block = migration.match(
    new RegExp(`create table if not exists public\\.${table} \\(([\\s\\S]*?)\\n\\);`),
  );
  if (!block) throw new Error(`no DDL block found for ${table}`);
  return block[1]
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^[a-z_]+ +\S/.test(line) && !/^(constraint|primary key|foreign key|unique)\b/.test(line))
    .map((line) => line.split(/\s+/)[0]);
}

/** Column names an Edge Function insert writes for a table. */
function insertedColumns(table: string): string[] {
  const call = new RegExp(`from\\("${table}"\\)[\\s\\S]*?\\(\\{([\\s\\S]*?)\\n\\s*\\}\\)`);
  const block = edge.match(call);
  if (!block) throw new Error(`no insert found for ${table}`);
  return [...block[1].matchAll(/^\s*([a-z_]+)\s*[,:]/gm)].map((match) => match[1]);
}

describe("RLS and grants", () => {
  it("enables row level security on both attempt tables", () => {
    expect(flatMigration).toContain("alter table public.quiz_attempts enable row level security;");
    expect(flatMigration).toContain(
      "alter table public.quiz_attempt_items enable row level security;",
    );
  });

  it("never grants select on the keyed snapshot table", () => {
    // No grant at all is also acceptable; a select grant is not.
    for (const line of itemGrants) expect(flat(line)).not.toContain("select");
    expect(flatMigration).not.toContain("grant select on public.quiz_attempt_items");
  });

  it("grants the insert the server-side writer needs", () => {
    expect(flatMigration).toContain("grant insert, delete on public.quiz_attempt_items to authenticated");
    expect(flatMigration).toContain(
      "grant select, insert, delete on public.quiz_attempts to authenticated",
    );
  });

  it("keeps anonymous access out entirely", () => {
    expect(flatMigration).toContain("revoke all on public.quiz_attempts from anon;");
    expect(flatMigration).toContain("revoke all on public.quiz_attempt_items from anon;");
  });

  it("adds no select or update policy on the keyed snapshot table", () => {
    const itemPolicies = migration
      .split("\n")
      .filter((line) => !/^\s*--/.test(line))
      .filter((line) => /\bpolicy\b/i.test(line) && /quiz_attempt_items/i.test(line));
    expect(itemPolicies.length).toBeGreaterThan(0);
    for (const line of itemPolicies) {
      expect(flat(line)).not.toMatch(/for (select|update)/);
    }
  });

  it("adds no update policy on attempts, so a score cannot be rewritten", () => {
    expect(flatMigration).not.toMatch(/policy [a-z_]*quiz_attempts[a-z_]* on public\.quiz_attempts for update/);
  });
});

describe("RPC hardening", () => {
  it("pins search_path and runs both RPCs as definer", () => {
    const definers = migration.match(/security definer/g) ?? [];
    const pinned = migration.match(/set search_path = ''/g) ?? [];
    expect(definers.length).toBe(2);
    expect(pinned.length).toBeGreaterThanOrEqual(4);
  });

  it("grants execute on the RPCs to authenticated only", () => {
    expect(flatMigration).toContain("grant execute on function public.get_quiz_attempt(uuid) to authenticated");
    expect(flatMigration).toContain(
      "grant execute on function public.submit_quiz_attempt(uuid, jsonb) to authenticated",
    );
    expect(flatMigration).not.toMatch(/grant execute on function public\.(get|submit)_quiz_attempt[^;]*to anon/);
  });

  it("withdraws the default PUBLIC execute on the internal helpers", () => {
    expect(flatMigration).toContain(
      "revoke execute on function public.quiz_score_question(jsonb, jsonb) from public, anon, authenticated",
    );
  });

  it("strips the key on read and locks the row on submit", () => {
    expect(flatMigration).toContain("i.question - 'answer' - 'nat_range' - 'explanation'");
    expect(flatMigration).toContain("for update;");
    expect(flatMigration).toContain("if v_attempt.submitted_at is not null then");
  });

  it("scores only from the stored snapshot, never from client input", () => {
    expect(flatMigration).toContain(
      "public.quiz_score_question(v_item.question, v_response)",
    );
  });
});

describe("the Edge Function and the DDL agree", () => {
  it("writes only columns the attempt table declares", () => {
    const declared = declaredColumns("quiz_attempts");
    const written = insertedColumns("quiz_attempts");

    expect(written.length).toBeGreaterThan(0);
    for (const column of written) expect(declared).toContain(column);
  });

  it("writes only columns the item table declares, including the keyed snapshot", () => {
    const declared = declaredColumns("quiz_attempt_items");
    const written = insertedColumns("quiz_attempt_items");

    expect(written).toContain("question");
    for (const column of written) expect(declared).toContain(column);
  });

  it("records the attempt score as unscored at creation", () => {
    // The DDL's `scored_state_consistent` check rejects a row that carries a
    // partial score, so the insert must not set any of these.
    const written = insertedColumns("quiz_attempts");
    for (const column of ["submitted_at", "result", "verdicts", "responses"]) {
      expect(written).not.toContain(column);
    }
  });

  it("uses a provenance value the DDL permits", () => {
    const provenance = migration.match(/provenance text +not null check \(provenance in \(([^)]*)\)\)/);
    expect(provenance).not.toBeNull();
    const permitted = (provenance?.[1] ?? "").replace(/['\s]/g, "").split(",");

    for (const value of edge.matchAll(/provenance: "([a-z_]+)"/g)) {
      expect(permitted).toContain(value[1]);
    }
  });

  it("persists with the caller's own client, not a privileged one", () => {
    expect(edge).toMatch(/await persistAttempt\(\s*userClient\(authHeader\),/);
    expect(edge).not.toMatch(/persistAttempt\([\s\S]{0,80}adminClient/);
  });

  it("never returns generated questions in its response", () => {
    const afterPersist = edge.slice(edge.indexOf("await persistAttempt("));
    const response = afterPersist.slice(
      afterPersist.indexOf("return json(req, {"),
      afterPersist.indexOf("} catch (e) {"),
    );

    expect(response).toContain("attemptId");
    expect(flat(response)).not.toMatch(/\bquestions\s*:/);
    expect(response).not.toContain("parsed.questions,");
  });
});

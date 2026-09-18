import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import nextEnv from "@next/env";

// Never emit raw CLI output, environment values, URLs, project names, or errors.
const root = path.resolve(import.meta.dirname, "..");
nextEnv.loadEnvConfig(root, false, { info() {}, error() {} });
const run = (command, args) => {
  // Only fixed commands/arguments below; never interpolate environment values.
  const windows = process.platform === "win32";
  return spawnSync(windows ? "cmd.exe" : command,
    windows ? ["/d", "/s", "/c", [command, ...args].join(" ")] : args, {
      cwd: root, encoding: "utf8", timeout: 60000, windowsHide: true,
      shell: false, stdio: ["ignore", "pipe", "pipe"],
    });
};
const value = (name) => (process.env[name] ?? "").trim();
const presence = (name) => value(name) ? "PRESENT" : "MISSING";
const ref = value("SUPABASE_PROJECT_REF");
let urlRef = "";
try {
  const url = new URL(value("NEXT_PUBLIC_SUPABASE_URL"));
  if (url.protocol === "https:" && !url.username && !url.password &&
      !url.search && !url.hash && url.pathname === "/") {
    urlRef = /^([a-z0-9]{20})\.supabase\.co$/.exec(url.hostname)?.[1] ?? "";
  }
} catch { /* Report format only. */ }
const key = value("NEXT_PUBLIC_SUPABASE_ANON_KEY");
let safeKey = /^sb_publishable_[A-Za-z0-9_-]+$/.test(key);
try {
  const payload = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString());
  safeKey ||= key.split(".").length === 3 && payload.role === "anon";
} catch { /* Presence/format is not cryptographic verification. */ }
const report = {
  environment: {
    NEXT_PUBLIC_SUPABASE_URL: !value("NEXT_PUBLIC_SUPABASE_URL") ? "MISSING" : urlRef ? "PRESENT" : "INVALID FORMAT",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: !key ? "MISSING" : safeKey ? "PRESENT" : "INVALID FORMAT",
    SUPABASE_PROJECT_REF: !ref ? "MISSING" : /^[a-z0-9]{20}$/.test(ref) ? "PRESENT" : "INVALID FORMAT",
    SUPABASE_DB_PASSWORD: presence("SUPABASE_DB_PASSWORD"),
    SUPABASE_ACCESS_TOKEN: presence("SUPABASE_ACCESS_TOKEN"),
  },
  envLocal: fs.existsSync(path.join(root, ".env.local")) ? "PRESENT" : "MISSING",
  envLocalIgnored: run("git", ["check-ignore", "--quiet", "--no-index", ".env.local"]).status === 0 ? "PASS" : "FAIL",
  envLocalUntracked: "NOT VERIFIED",
  exampleVariableNames: [],
  cli: "NOT VERIFIED", authentication: "NOT VERIFIED", projectIdentity: "NOT VERIFIED",
  config: fs.existsSync(path.join(root, "supabase/config.toml")) ? "PRESENT" : "MISSING",
  link: "NOT VERIFIED", dryRun: { status: "NOT RUN" },
  localMigrations: fs.readdirSync(path.join(root, "supabase/migrations")).filter(n => /^\d+_.+\.sql$/.test(n)).sort(),
};
const tracked = run("git", ["ls-files", "--", ".env.local"]);
if (tracked.status === 0) report.envLocalUntracked = tracked.stdout.trim() ? "FAIL" : "PASS";
const example = path.join(root, ".env.example");
if (fs.existsSync(example)) report.exampleVariableNames = [...fs.readFileSync(example, "utf8").matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*=/gm)].map(m => m[1]);
const version = run("supabase", ["--version"]);
if (version.status === 0) report.cli = "PRESENT";
const projects = run("supabase", ["projects", "list", "--output", "json"]);
if (projects.status === 0) {
  try {
    const list = JSON.parse(projects.stdout);
    if (Array.isArray(list)) {
      report.authentication = "PASS";
      const selected = list.find(p => p.id === ref);
      // Explicit ref + URL agreement + test project name, never select from list.
      if (ref && ref === urlRef && selected && /aaragate/i.test(selected.name) &&
          /test|dev|staging/i.test(selected.name) && !/prod/i.test(selected.name)) {
        report.projectIdentity = "PASS";
      }
    }
  } catch { /* Do not echo unexpected provider responses. */ }
}
const linkPath = path.join(root, "supabase/.temp/project-ref");
if (!fs.existsSync(linkPath)) report.link = "MISSING";
else if (ref && fs.readFileSync(linkPath, "utf8").trim() === ref) report.link = "PASS";
if (process.argv.includes("--dry-run")) {
  if (report.projectIdentity !== "PASS" || report.link !== "PASS" || report.config !== "PRESENT" || !safeKey ||
      report.envLocalIgnored !== "PASS" || report.envLocalUntracked !== "PASS") {
    report.dryRun = { status: "BLOCKED", reason: "Explicit dedicated-test identity, matching local link, safe configuration, and ignored credentials required." };
  } else {
    const dry = run("supabase", ["db", "push", "--workdir", `"${root}"`, "--linked", "--dry-run"]);
    const output = `${dry.stdout ?? ""}\n${dry.stderr ?? ""}`;
    report.dryRun = {
      status: dry.status === 0 ? "PASS" : "FAIL", exitCode: dry.status,
      // Extract only known filenames, never arbitrary output or connection strings.
      detectedMigrations: report.localMigrations.filter(name => output.includes(name)),
      warningPresent: /warn|notice/i.test(output),
      errorCategory: dry.status === 0 ? null : /password|authentication/i.test(output) ? "AUTHENTICATION" : /connect|timeout/i.test(output) ? "CONNECTION" : "NOT VERIFIED",
      rawOutputWithheld: true,
    };
  }
}
console.log(JSON.stringify(report, null, 2));

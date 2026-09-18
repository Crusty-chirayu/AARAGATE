import type { Metadata } from "next";
import Link from "next/link";
import { Tag } from "lucide-react";
import { LandingNav } from "@/components/landing/nav";
import { Reveal, RevealItem, SectionHeading } from "@/components/landing/section";
import { BrandLockup } from "@/components/logo";
import { Markdown } from "@/components/chat/markdown";

export const metadata: Metadata = {
  title: "Changelog",
  description: "Release notes for AARAGATE, published from GitHub Releases.",
};

// §1: releases are the source of truth; regenerate hourly.
export const revalidate = 3600;

const REPO = process.env.NEXT_PUBLIC_GITHUB_REPO ?? "Crusty-chirayu/AARAGATE";

interface Release {
  id: number;
  name: string | null;
  tag_name: string;
  body: string | null;
  html_url: string;
  published_at: string | null;
  prerelease: boolean;
}

/** Shown when the GitHub API is unreachable or the repo has no releases yet. */
const FALLBACK: Release[] = [
  {
    id: 0,
    name: "AARAGATE — first public build",
    tag_name: "v0.1.0",
    published_at: null,
    html_url: `https://github.com/${REPO}/releases`,
    prerelease: false,
    body: [
      "### Added",
      "- AARAGATE identity: new mark, wordmark, favicon and design tokens",
      "- 1:1 AI tutor chat with streaming, stop and regenerate",
      "- Study rooms with invite links, roles and an opt-in AI tutor",
      "- Attachments, cross-conversation search, pins and reactions",
      "- Command palette (⌘K) and moderation that fails closed",
      "",
      "### Notes",
      "- Document analysis, practice sets, mock tests and trend analysis are not",
      "  released: they need data models that do not exist yet. No placeholder screens.",
    ].join("\n"),
  },
];

async function getReleases(): Promise<{ releases: Release[]; live: boolean }> {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=20`, {
      headers: {
        Accept: "application/vnd.github+json",
        ...(process.env.GITHUB_TOKEN
          ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
          : {}),
      },
      next: { revalidate },
    });
    if (!res.ok) return { releases: FALLBACK, live: false };
    const data = (await res.json()) as Release[];
    if (!Array.isArray(data) || data.length === 0) return { releases: FALLBACK, live: false };
    return { releases: data, live: true };
  } catch {
    return { releases: FALLBACK, live: false };
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return "Unreleased";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function ChangelogPage() {
  const { releases, live } = await getReleases();

  return (
    <div className="relative min-h-dvh bg-[var(--bg-app)]">
      {/* faint atmosphere so the page doesn't sit on flat, un-lit background */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
        <div
          className="absolute left-1/2 top-[-14rem] h-[30rem] w-[44rem] -translate-x-1/2 rounded-full opacity-[0.08] blur-[110px]"
          style={{ background: "radial-gradient(circle, var(--accent), transparent 62%)" }}
        />
      </div>

      <LandingNav />

      <main className="px-5 pb-24 pt-32 sm:pt-40">
        <Reveal className="mx-auto max-w-3xl">
          <SectionHeading
            as="h1"
            eyebrow="Changelog"
            title="What's new"
            subtitle="Published automatically from GitHub Releases on every tagged version."
          />

          {!live && (
            <RevealItem>
              <p className="mx-auto mt-8 max-w-xl rounded-[var(--r-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-3 text-center text-[12.5px] leading-relaxed text-[var(--text-secondary)]">
                Showing the bundled release notes — no published GitHub Releases were found for{" "}
                <code className="rounded-[var(--r-sm)] border border-[var(--border-default)] bg-[var(--bg-hover)] px-1.5 py-0.5 font-mono">
                  {REPO}
                </code>
                . Tag a version and this page fills in automatically.
              </p>
            </RevealItem>
          )}

          <div className="mt-14 space-y-2">
            {releases.map((r) => (
              <RevealItem key={r.id}>
                <article className="group relative rounded-[var(--r-lg)] border-l-2 border-[var(--border-default)] py-6 pl-6 transition-colors duration-[var(--d-standard)] hover:bg-[var(--bg-hover)]/40 sm:pl-8">
                  <span
                    className="absolute -left-[9px] top-[26px] grid h-4 w-4 place-items-center rounded-full bg-[var(--brand)] ring-4 ring-[var(--bg-app)]"
                    aria-hidden
                  />

                  <header className="mb-4">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <h2 className="text-[18px] font-semibold tracking-tight text-[var(--text-primary)]">
                        {r.name || r.tag_name}
                      </h2>
                      <span className="inline-flex items-center gap-1 rounded-[var(--r-pill)] border border-[var(--border-default)] bg-[var(--bg-hover)] px-2 py-0.5 font-mono text-[11px] text-[var(--text-secondary)]">
                        <Tag className="h-3 w-3" />
                        {r.tag_name}
                      </span>
                      {r.prerelease && (
                        <span className="rounded-[var(--r-pill)] bg-[var(--warning-subtle)] px-2 py-0.5 text-[11px] font-semibold text-[var(--warning)]">
                          Pre-release
                        </span>
                      )}
                    </div>
                    <time
                      className="mt-1.5 block text-[12.5px] text-[var(--text-secondary)]"
                      dateTime={r.published_at ?? undefined}
                    >
                      {formatDate(r.published_at)}
                    </time>
                  </header>

                  <div className="text-[14px] text-[var(--text-primary)]">
                    {r.body?.trim() ? (
                      <Markdown content={r.body} />
                    ) : (
                      <p className="text-[var(--text-secondary)]">No release notes for this version.</p>
                    )}
                  </div>

                  {live && (
                    <a
                      href={r.html_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-4 inline-block text-[13px] font-medium text-[var(--accent-text)] transition-colors duration-[var(--d-micro)] hover:underline"
                    >
                      View on GitHub →
                    </a>
                  )}
                </article>
              </RevealItem>
            ))}
          </div>
        </Reveal>
      </main>

      <footer className="relative border-t border-[var(--border-default)] px-5 py-12">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 sm:flex-row">
          <div className="flex items-center gap-2.5">
            <BrandLockup logoClassName="h-6 w-6" wordmarkClassName="text-[13.5px]" />
          </div>
          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[13px] text-[var(--text-secondary)]">
            <Link href="/" className="transition-colors duration-[var(--d-micro)] hover:text-[var(--text-primary)]">
              Home
            </Link>
            <Link
              href="/changelog"
              className="transition-colors duration-[var(--d-micro)] hover:text-[var(--text-primary)]"
            >
              Changelog
            </Link>
            <Link href="/login" className="transition-colors duration-[var(--d-micro)] hover:text-[var(--text-primary)]">
              Sign in
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
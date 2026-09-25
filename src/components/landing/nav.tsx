"use client";

import Link from "next/link";
import { motion, useScroll, useMotionValueEvent } from "framer-motion";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-provider";
import { BrandLockup } from "@/components/logo";
import { cn } from "@/lib/utils";
import { tEnter } from "@/lib/motion";

const LINKS = [
  { href: "#the-gate", label: "The Gate" },
  { href: "#scoring", label: "Scoring" },
  { href: "#features", label: "Features" },
  { href: "#security", label: "Security" },
  { href: "/pricing", label: "Pricing" },
  { href: "/changelog", label: "Changelog" },
];

export function LandingNav() {
  const { scrollY } = useScroll();
  const [stuck, setStuck] = useState(false);
  const [open, setOpen] = useState(false);

  useMotionValueEvent(scrollY, "change", (y) => setStuck(y > 40));

  return (
    <motion.header
      initial={{ y: -16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={tEnter(0.48)}
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-[background-color,box-shadow,backdrop-filter] duration-[var(--d-standard)]",
        stuck
          ? "border-b border-[var(--border)] bg-[var(--bg)] shadow-[var(--e1)]"
          : "border-b border-transparent bg-transparent",
      )}
    >
      <nav aria-label="Main" className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-5">
        <Link href="/" className="focus-visible:rounded-[var(--r-sm)]">
          <BrandLockup logoClassName="h-7 w-7" />
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) =>
            // Hash links stay on the landing page; routes use next/link so
            // they are client-side navigations (and prefetched), not reloads.
            l.href.startsWith("/") ? (
              <Link
                key={l.href}
                href={l.href}
                className="rounded-[var(--r-sm)] px-3 py-2 text-[13.5px] font-medium text-[var(--fg-muted)] transition-colors hover:text-[var(--fg)]"
              >
                {l.label}
              </Link>
            ) : (
              <a
                key={l.href}
                href={l.href}
                className="rounded-[var(--r-sm)] px-3 py-2 text-[13.5px] font-medium text-[var(--fg-muted)] transition-colors hover:text-[var(--fg)]"
              >
                {l.label}
              </a>
            ),
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          <Button asChild href="/login" variant="ghost" size="sm" className="hidden sm:inline-flex">
            Sign in
          </Button>
          <Button asChild href="/signup" size="sm">
            Get started
          </Button>
          <button
            className="grid h-9 w-9 place-items-center rounded-[var(--r-md)] text-[var(--fg-muted)] hover:bg-[var(--bg-hover)] md:hidden"
            onClick={() => setOpen((o) => !o)}
            aria-label="Menu"
          >
            {open ? <X className="h-[18px] w-[18px]" /> : <Menu className="h-[18px] w-[18px]" />}
          </button>
        </div>
      </nav>

      <motion.div
        initial={false}
        animate={{ opacity: open ? 1 : 0, y: open ? 0 : -8 }}
        transition={tEnter(0.2)}
        className={cn(
          "overflow-hidden border-t border-[var(--border)] bg-[var(--bg)] md:hidden",
          open ? "pointer-events-auto" : "pointer-events-none",
        )}
        style={{ height: open ? "auto" : 0 }}
      >
        <div className="flex flex-col p-3">
          {LINKS.map((l) =>
            l.href.startsWith("/") ? (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="rounded-[var(--r-md)] px-3 py-2.5 text-sm font-medium text-[var(--fg-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg)]"
              >
                {l.label}
              </Link>
            ) : (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="rounded-[var(--r-md)] px-3 py-2.5 text-sm font-medium text-[var(--fg-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg)]"
              >
                {l.label}
              </a>
            ),
          )}
          <Button asChild href="/login" variant="secondary" className="mt-2 w-full" onClick={() => setOpen(false)}>
            Sign in
          </Button>
        </div>
      </motion.div>
    </motion.header>
  );
}

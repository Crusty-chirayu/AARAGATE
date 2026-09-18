import { LogoLoader } from "@/components/logo";

/**
 * Route-level loading state for the signed-in app (Batch A).
 *
 * The shell at `app/app/layout.tsx` is a client component that authenticates and
 * then fetches the conversation list; before this file existed the segment had
 * no fallback at all, so a slow first load showed an empty white pane. The mark
 * draws once while the shell mounts — no spinner, no loop, nothing blocking.
 */
export default function AppLoading() {
  return (
    <div className="grid min-h-[60dvh] place-items-center">
      <LogoLoader label="Preparing your workspace" />
    </div>
  );
}
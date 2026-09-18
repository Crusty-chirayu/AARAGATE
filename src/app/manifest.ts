import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/brand";

/**
 * Web app manifest (Batch A).
 *
 * Served at `/manifest.webmanifest` and linked automatically by Next. The icon
 * is the same mark as `icon.svg`, so an installed AARAGATE is recognisable
 * without shipping a second, drifting raster asset.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${BRAND.name} — ${BRAND.tagline}`,
    short_name: BRAND.name,
    description: BRAND.description,
    start_url: "/app",
    display: "standalone",
    background_color: "#f8fafa",
    theme_color: "#4338ca",
    categories: ["education", "productivity"],
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
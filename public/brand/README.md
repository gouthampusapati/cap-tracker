# Brand source assets

Drop the original logo files here, then let Claude know — the rest of Phase 1.2 (favicon
exports at 16/32/48/180/512, `app/icon.png`, `app/apple-icon.png`, `public/site.webmanifest`,
`app/opengraph-image.tsx`) is generated from whatever's placed here.

Expected files:

- `logo-full.png` — the full lockup ("SAI" monogram + "SINGLE AUDIT INTELLIGENCE" wordmark,
  red/navy). Used for the OG/social preview image.
- `logo-mark.png` — the standalone "SAI" monogram, red S + navy AI, padded to a square canvas
  with transparent margins. Used in every header/nav context and as the source for all
  favicon/app-icon sizes.

Current source is raster (PNG with real alpha transparency), not vector — the original upload
came out of an AI image generator as a flattened image, not editable paths, so there's no SVG
version this time. If a true vector redraw ever happens, swap these back to `.svg` and update
the `<img>` references in app/page.tsx, app/auth/signin/page.tsx, app/dashboard/page.tsx, and
app/dashboard/next-cycle-prep/page.tsx accordingly.

**16×16 favicon is a simplified variant, not the full mark**: at 16px the "AI" strokes are too
thin to read and dissolve into a blur (checked directly, not assumed) — `favicon-16x16.png` is
cropped to just the red "S" instead, which stays crisp at that size. Every other size (32/48/180
app-icon, 512, and the in-app `logo-mark.png` itself) uses the full "SAI" mark, which is legible
starting around 28-32px.

This README itself isn't part of the site — it's just a marker for where these two files go.

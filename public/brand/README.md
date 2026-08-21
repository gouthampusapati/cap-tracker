# Brand source assets

Drop the original logo files here, then let Claude know — the rest of Phase 1.2 (favicon
exports at 16/32/48/180/512, `app/icon.png`, `app/apple-icon.png`, `public/site.webmanifest`,
`app/opengraph-image.tsx`) is generated from whatever's placed here.

Expected files:

- `logo-full.{svg,png}` — the full lockup (monogram + "SINGLE AUDIT INTELLIGENCE" wordmark).
  Used in the desktop header, footer, and the OG/social preview image. SVG preferred (scales
  cleanly at any size); a high-resolution PNG works too.
- `logo-mark.{svg,png}` — the standalone S monogram alone. Used for the mobile header, favicon,
  apple-touch-icon, and any square context. Needs to be legible at 16×16px — see the plan's note
  on checking the S-edge/blue-wedge junction specifically at that size before it ships.

This README itself isn't part of the site — it's just a marker for where these two files go.

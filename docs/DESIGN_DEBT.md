# Design debt — app.html material system

Parked, not resolved. Do not silently drop these; clear them explicitly before
calling `docs/BRAND_DESIGN_BRIEF.md` done.

- `app.html` picked up `brand.css`'s colour tokens but not its material system:
  no letterpress deboss reads as intended, no paper grain, no consistent single
  light source across surfaces.
- The seal is absent from `app.html` in practice, despite being specified as
  the app's centrepiece and primary status display (brief section 9).
- The landing CTA is a flat colour fill, not wax/foil material.
- `app.html` has no hierarchy: everything is the same width, centred, and the
  same weight, which is why it reads as templated rather than authored.
- The app's first screen duplicates the landing page (wordmark, tagline,
  divider) instead of getting the owner/beneficiary to work immediately.

Functional work (wallet connection) proceeds in parallel per
`docs/BATCH_4_DESIGN_BRIEF.md`. Return to this list before the design brief is
considered satisfied.

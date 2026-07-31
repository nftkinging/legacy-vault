# Legacy Vault — Brand & Design System Brief

Supersedes the visual sections of `docs/BATCH_4_DESIGN_BRIEF.md`. Functional requirements
there (wallet, carry-forward warnings, accessibility) still stand.

**Goal:** move from "clean" to "authored." The landing page has material — paper grain, wax,
brass, raking light. The app has none: flat colour on flat colour. That gap is the whole
problem. This brief closes it with a material system and a proper identity.

---

## 1. Positioning

Legacy Vault is an **instrument**, not an app. Closer to a deed, a will, or a safe-deposit
box than to a wallet or a dashboard. It is used rarely, at moments of consequence, and it
must feel like it will still be there in thirty years.

**Personality:** solemn, warm, precise, unhurried, quietly confident.
**Never:** playful, urgent, gamified, hype-driven, "crypto."

**The two users:**
- The **owner** — deliberate, planning ahead, possibly morbid-curious. Wants reassurance
  that this is serious and reversible.
- The **beneficiary** — may be grieving, non-technical, on a phone, using it once ever.
  Wants to not feel stupid, and to not make an irreversible mistake.

Every design decision answers to the second user. If a choice makes the interface more
impressive but less legible to a grieving person on a phone, it is wrong.

---

## 2. Identity

### The mark

A **wax seal impression**. It is already the product's central metaphor and its core
interaction (the seal cracks when silence elapses) — the identity should be the same object.

Requirements:
- Circular but **not geometrically perfect** — real wax has an irregular edge and a slight
  drip. Perfect circles read as corporate; imperfection reads as handmade and real.
- Contains an **LV monogram** in a high-contrast serif, letterpressed *into* the wax
  (debossed), not sitting on top of it.
- A fine inner ring, broken or dashed, echoing a real seal die.
- Must read at **16px** (favicon) and at **1200px** (OG image). Build a simplified variant
  for small sizes — drop the inner ring and texture below ~32px.
- Delivered as **SVG**, single path where possible, no embedded raster.

### Logotype

Cormorant Garamond, regular weight, generous letter-spacing. "Legacy Vault" set with a
slightly larger cap on both words. Optical spacing, not metric — kern by eye.

### Lockups

Horizontal (mark left, logotype right) for headers. Stacked (mark above) for the landing
hero and OG image. Mark alone for favicon, app icon, and loading states.

### Deliverables

`brand/` folder containing: `mark.svg`, `mark-small.svg`, `logotype.svg`, `lockup-h.svg`,
`lockup-v.svg`, `favicon.svg`, `favicon.ico`, `apple-touch-icon.png` (180px),
`og-image.png` (1200×630), and `brand/README.md` documenting clear-space, minimum sizes,
and misuse.

---

## 3. The material system

**This is the core of the brief.** Every surface and control maps to a physical
counterpart. Nothing is "a div with a background colour."

| Element | Material | Behaviour |
|---|---|---|
| Page (app) | Parchment | Faint paper grain, warm, slightly uneven |
| Page (landing) | Night | Near-black oxblood, photographic light |
| Input field | **Letterpress** | Debossed *into* the paper — inner shadow top, faint highlight bottom |
| Primary button | **Wax seal** | Raised, warm shadow beneath, compresses when pressed |
| Secondary button | **Ink rule** | Hairline border, no fill, ink-coloured |
| Card / panel | **Laid paper** | Slightly lighter than page, hairline edge, no heavy shadow |
| Accent | **Gilt foil** | Rare. One per screen. Never for body text |
| Divider | **Ruled line** | Hairline, warm grey-brown, never pure black |

### Rules

- **Depth comes from light, not from shadow blur.** A single consistent light source from
  the upper left. Debossed elements get a dark inner edge on the top-left, a light one on
  the bottom-right. Raised elements do the reverse. Applied consistently, this alone makes
  an interface feel real.
- **Paper grain** at 2–4% opacity across parchment surfaces. Barely perceptible; it removes
  the deadness of flat fill. One tiling texture, not a large image.
- **No generic drop shadows.** No `box-shadow: 0 4px 12px rgba(0,0,0,0.1)`. Shadows are
  warm-tinted (oxblood-based, not black) and tight.
- **Gilt is precious.** One gold element per view — usually the single most important
  action or number. If two things are gold, neither is special.
- **Wax red is for commitment.** Only actions that write to the chain. Never for navigation
  or cancel.

---

## 4. Colour

Locked. Do not introduce new hues.

| Token | Hex | Use |
|---|---|---|
| `--ink` | `#241318` | Deep oxblood-black. Landing bg, app text |
| `--ink-2` | `#160B0E` | Deeper still, for wells and recesses |
| `--parchment` | `#F0E7D6` | App page background |
| `--parchment-2` | `#FBF6EC` | Raised cards on parchment |
| `--parchment-3` | `#E4D7BF` | Recessed / pressed states |
| `--wax` | `#9E2B25` | Primary action, seal |
| `--wax-deep` | `#6E1D1A` | Wax shadow, pressed state |
| `--gilt` | `#C39B4A` | Single accent, foil |
| `--text` | `#2A1E22` | Body on parchment |
| `--muted` | `#6E5F54` | Secondary text |

Every pairing must be verified at 4.5:1. Gilt on parchment fails — never use gilt for text
on light surfaces, only on `--ink`.

---

## 5. Typography

- **Display:** Cormorant Garamond. Headlines, numbers, vault titles, the letter itself.
- **Interface:** Cormorant for labels and body; keep it consistent with display rather than
  introducing a third family.
- **Data:** IBM Plex Mono. Addresses, hashes, balances, countdowns, network names. Anything
  machine-generated is monospace — this is a semantic rule, not a stylistic one.

**Scale** (1.25 ratio): 12 / 14 / 16 / 20 / 25 / 31 / 39 / 49 / 61.
Body 16px minimum, `line-height: 1.6`. Long-form (the letter) at `1.75`.

**Numerals:** large figures use a display size with the decimal portion at ~60% size and
muted — the editorial treatment from the reference material. `55,673` `.14`

---

## 6. Space and rhythm

8px base unit. Spacing values: 4, 8, 12, 16, 24, 32, 48, 64, 96, 128.

Vertical rhythm must be visible — sections separated by 96 or 128, related items by 8 or 12.
Inconsistent spacing is the most common reason an interface reads as amateur. Audit for it
explicitly.

**Radius:** 2px for inputs and buttons (paper is cut, not moulded), 4px for cards. Never
pill-shaped. Never fully square.

---

## 7. Motion

- Durations: 150ms (state), 250ms (transition), 400ms (entrance).
- Easing: `cubic-bezier(0.4, 0, 0.2, 1)` default. Never linear. Never bounce.
- The **seal crack** is the one moment of drama in the product — it may take longer (up to
  1200ms) and deserves real craft. It should feel like something breaking, not an animation
  playing.
- `prefers-reduced-motion`: all transitions to 0ms; the seal crack becomes a state change,
  not an animation. It must still be comprehensible.

---

## 8. Component states — all required, all designed

Every interactive element needs: **resting, hover, focus-visible, active/pressed, loading,
disabled, error, success.** A missing state is a bug, not an omission.

**Primary button (wax):** resting is raised with a warm shadow. Hover lifts ~1px and warms.
Pressed compresses — shadow collapses, element shifts down 1px, colour deepens to
`--wax-deep`. Loading replaces the label with a seal-impression spinner, keeps the width
fixed so nothing reflows. Disabled desaturates rather than fades.

**Input (letterpress):** resting is debossed. Focus adds a gilt hairline ring plus a deeper
inset. Error shifts the inset to wax red with the message *below*, never as a tooltip.
Filled state is visually distinct from placeholder.

**Select:** the custom listbox already built — verify it has keyboard nav, type-ahead,
correct ARIA roles, and matches the letterpress language.

---

## 9. Applying across pages

Both pages share `brand.css`. No page defines its own colours or spacing.

**Landing (`index.html`)** — night register. Photographic, cinematic, sparse. Already close;
apply the mark, refine spacing to the rhythm scale, ensure the CTA uses the wax material.

**App (`app.html`)** — day register. The writing desk. Parchment, letterpress, ink. This is
where the material system does the most work.

The two must feel like the same hand: identical type scale, identical spacing rhythm,
identical motion curves, identical component logic. The palette inverts; the craft does not.

**The seal is the app's centrepiece.** Currently it is decorative. It should be the primary
status display — intact and lit while checked in, hairline fractures appearing as the
deadline nears, fully cracked when claimable. A user should read their vault's state from
across the room.

---

## 10. Acceptance criteria

Not done until all of these pass:

- [ ] Every interactive element has all eight states, implemented and verified
- [ ] Zero native browser controls remain
- [ ] Zero generic drop shadows; all depth is light-directional and warm-tinted
- [ ] Exactly one gilt element per view
- [ ] All spacing from the scale — no arbitrary pixel values
- [ ] All contrast pairings verified ≥4.5:1, measured not assumed
- [ ] Full keyboard operation, visible focus throughout, logical tab order
- [ ] `prefers-reduced-motion` honoured, seal state still legible
- [ ] Screen-reader labels on seal state, countdown, and network badge
- [ ] Playwright verification at 320/375/768/1024/1440 — zero overflow, zero console errors
- [ ] Landing and app screenshotted side by side and demonstrably the same hand
- [ ] Favicon, OG image, and apple-touch-icon present and correct

---

## 11. What "industry standard" actually means here

Not visual polish. Polish is table stakes. What separates a shipped product:

- Loading states everywhere, so no action ever leaves a dead screen
- Errors that name what happened and what to do next, never a raw revert string
- Empty states that teach rather than apologise
- Mobile that genuinely works, not a squeezed desktop
- Copy written by a person: plain, warm, unhurried, no exclamation marks
- Nothing irreversible without a clear, calm confirmation

The reference material you admire is *renders*. A real product is judged on the ninth state
nobody photographs — the one where the RPC times out mid-claim and a grieving stranger is
staring at a spinner. Design that state with the same care as the hero.

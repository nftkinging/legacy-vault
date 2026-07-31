# Batch 4 — Design & Frontend Brief

Read alongside `CLAUDE.md` (design-skill constraints) and `docs/BATCH_BRIEF.md`
(carry-forward requirements). This brief adds the landing page, the visual direction,
and the wallet-connection work.

---

## Visual direction

### The reference tension — read this first

The reference material supplied is high-end crypto-wallet work: pure-black surfaces,
neon-orange gradients, huge numerals, trading-app energy. **Do not import that palette.**
For a product about death and inheritance, that register is wrong — a beneficiary opening
this has just lost someone, and excitement is the wrong emotion.

What the references *are* good at, and what we take from them:

- **Cinematic staging** — one dominant hero object, dramatically lit, lots of dark space
- **Enormous negative space** — nothing crowds the hero
- **Type restraint** — very few words, very large, high contrast
- **Editorial numerals** — large display figures with small superscript decimals
- **Mono for machine data** — addresses and hashes in monospace, small, muted
- **Single-source lighting** — the object emerges from darkness

Note that the reference palette is closer to ours than it first appears: deep red bleeding
to near-black with a gold call-to-action is oxblood + sealing wax + gilt. Take the drama,
keep our colours.

### Locked identity — unchanged

- Parchment `#F0E7D6`, deep oxblood-black `#241318`, sealing-wax red `#9E2B25`, gilt `#C39B4A`
- Cormorant Garamond for display, IBM Plex Mono for addresses and data
- Wax-seal motif; the seal visibly cracks when the silence interval elapses
- Mood: heirloom, editorial, solemn, warm — never cyberpunk, never neon

---

## The landing page

New page, shown before the app. Structure:

1. **Header** — wordmark left, "how it works" / "faq" right. Minimal.
2. **Eyebrow** — small tracked caps: RECORDED ON BOT CHAIN · NO CUSTODIAN · NO EXECUTOR
3. **Hero object** — large, centred, dramatically lit (see imagery note below)
4. **Headline** — Cormorant, large: *A letter that opens only if you stop answering*
5. **Subline** — one sentence, plain: what it does
6. **Primary CTA** — "Enter the vault" → routes to the app
7. **Reassurance line** — no account needed; connect a wallet when you're ready
8. **Three-step strip** — Seal it · Keep answering · They inherit
9. **Footer** — contract address (mono, muted), explorer link, audit report link

Keep it to one screen on desktop before scroll. The three-step strip and any FAQ sit below.

### Hero imagery

A steel bank-vault door reads as *institutional* — cold, corporate, the opposite of an
heirloom. Prefer, in order: a wax-sealed envelope; an antique strongbox or deed box; a
brass key on dark cloth; a writing desk in low light. If a literal vault is used, favour an
old brass-and-wood safe over a modern bank door.

Source from Unsplash (licence permits commercial use; attribution appreciated, not
required). **Download and self-host** — do not hotlink; the landing page must not depend on
a third-party CDN. Provide WebP with a JPEG fallback, and ship a responsive `srcset`.
Colour-grade toward the oxblood/parchment palette rather than using a neutral or blue-toned
photo straight.

### Responsive

Breakpoints at 375 / 768 / 1024 / 1440. On mobile: hero object shrinks and moves above the
headline, three-step strip becomes vertical, CTA becomes full-width. Nothing horizontally
scrolls at 375px.

---

## Wallet connection

Three separate problems. Solve all three.

### 1. Desktop — multiple wallets fight over `window.ethereum`

Current code reads the injected provider directly. With two or more extensions installed,
whichever loaded last wins. Implement **EIP-6963** multi-injected provider discovery: listen
for wallet announcements, present a picker when more than one is found, fall back to
`window.ethereum` when none announce. No dependency, no key required.

### 2. Mobile — there is no injected provider at all

A phone browser has no `window.ethereum`, so the app is currently unusable on mobile. This
is not an edge case: **the beneficiary persona is a non-technical person who may open this
once, on a phone, shortly after a bereavement.** Mobile support determines whether the
product works at the moment it exists for.

**Cheap fix (do first, no signup):** detect the missing provider and offer a deep link that
reopens the current URL inside MetaMask's in-app browser, where the provider *is* injected.
Roughly five lines. Ship this regardless.

**Real fix:** WalletConnect via Reown. Create a project at `dashboard.reown.com` to get a
project ID (this is the only place in the whole app that needs one). Our frontend is vanilla
JS with ethers v6, not React — use the vanilla/universal path rather than restructuring
around wagmi. Verify integration details against current Reown docs; the product was
formerly WalletConnect Cloud and older guides are stale.

### 3. Custom chain support — verify, do not assume

BOT Chain mainnet is **chain 677**. Desktop MetaMask handles `wallet_addEthereumChain`
cleanly; mobile wallets connected over WalletConnect vary considerably in whether they will
add an unknown network. **Test this explicitly in Batch 5 across at least three mobile
wallets** before depending on it. If a wallet refuses, the UI must say so plainly and tell
the user how to add the network manually.

---

## Carry-forward requirements

These are recorded in `docs/BATCH_BRIEF.md` and must land in this batch:

1. **Warn loudly when naming an unregistered beneficiary.** The passphrase fallback is the
   default path and is structurally flawed — the owner must deliver the passphrase before
   going silent, precisely when they may be unreachable. Prominent warning at vault
   creation, plus one-click generation of a registration link to send the beneficiary.
   Registration is the encouraged path; passphrase is the explicit fallback.
2. **Prompt to re-encrypt after late registration.** If a beneficiary registers after the
   vault was sealed, detect it and prompt the owner to re-encrypt via `updateMessage`.
3. **Mitigate inbox harassment client-side.** Anyone can permanently write arbitrary text
   into a stranger's inbox; the contract cannot stop it. Filter or collapse low-value
   vaults, and let users hide senders locally.
4. **Disclose the metadata leak.** Beneficiary relationships and balances are public
   on-chain even when letters are encrypted. State it plainly.
5. **Disclose the locked minimum.** `MIN_DEPOSIT` stays locked while a vault is live; the
   owner reclaims it only via `closeVault()`. This qualifies "your money is never trapped"
   and must be said, not buried.

---

## App UI work

- **Compress before encrypting.** Order is a correctness requirement, not a preference —
  ciphertext does not compress. Compress plaintext → encrypt → store raw bytes.
- Replace the `prompt()` dialogs in deposit and withdraw with inline styled inputs.
- Live-ticking countdown, updating every second.
- Show the exact unlock date and time, not only a relative countdown.
- Prominent warning state when under 20% of the interval remains.
- Generate an `.ics` / calendar link on vault creation so owners can be reminded.
- Wrap every per-vault `getVault` call in try/catch so one malformed vault cannot break the
  claim list.
- Chain ID, RPC, explorer, and contract address as config values, not hardcoded, so one
  build targets 968 or 677. **Always display the active network prominently** — a user must
  never be unsure whether they are on testnet or mainnet.

---

## Accessibility — non-negotiable

Use the ui-ux-pro-max checklist. Minimum bar:

- 4.5:1 contrast on all text; parchment-on-oxblood must be verified, not assumed
- Visible keyboard focus states on every interactive element
- `prefers-reduced-motion` respected — the seal-cracking animation must degrade gracefully
- SVG icons, never emoji; `cursor: pointer` on everything clickable
- 150–300ms transitions
- Screen-reader labels on the countdown and the seal state

The target user for the claim flow is grieving, possibly elderly, possibly on a phone, and
using this for the first and only time. Design for that person, not for a crypto native.

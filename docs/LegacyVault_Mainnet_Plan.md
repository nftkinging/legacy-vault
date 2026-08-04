# Legacy Vault — Mainnet Launch Plan

**Current state:** deployed on BOT Chain **testnet** (chain 968), contract
`0x688C6810e0aa07e26941cEaC1972c7d3Be8820c9`, frontend live on GitHub Pages.
**Target:** BOT Chain **mainnet** (chain 677), hardened contract, audited, hosted on Vercel.

Work through the batches in order. Each has a **goal**, **steps**, and an **exit criterion** —
do not start the next batch until the exit criterion is met. Batches 1–4 can overlap with
Batch 7 (infrastructure), but nothing may jump ahead of Batch 8.

### Network reference (from BOT Chain official docs)

| | Testnet | Mainnet |
|---|---|---|
| Chain ID | 968 | **677** |
| RPC | `https://rpc.bohr.life` | `https://rpc.botchain.ai` |
| Explorer | `https://scan.bohr.life/` | `https://scan.botchain.ai` |
| Native token | BOT | BOT |
| Get tokens | [Faucet](https://faucet.botchain.ai/basic) | **DEX swap only — no faucet** |

---

## Batch 1 — Decisions and prerequisites

**Goal:** settle the choices that shape everything downstream, and start the long-lead items.

Nothing in this batch is code, and that is the point — each decision here is expensive to
reverse after deployment.

1. **Beneficiary model — DECIDED: hybrid.** *(see CLAUDE.md)*
   - Passive by default: anyone can still be named without pre-registering — required for the
     non-technical-heir persona this batch's own step 5 tests for.
   - `registerAsBeneficiary(pubKey)` is optional. Registered beneficiaries get real
     public-key encryption; unregistered ones keep the passphrase (AES-GCM + PBKDF2) fallback.
   - Spam / unbounded reverse-index growth are fixed independently of consent: dedup per
     `(owner, beneficiary)` pair, swap-and-pop removal on claim/close, and a minimum deposit
     well above 1 wei.

2. **Upgradeability.** Immutable is more trustworthy and unfixable; a proxy plus timelock is
   fixable but introduces an admin key and its own attack surface. For a product custodying
   inheritance funds, decide explicitly and be prepared to justify it publicly.

3. **Minimum check-in interval for production.** The current 60 seconds exists for demos.
   Pick a real floor (suggest `1 days`) and a ceiling (suggest `3650 days`).

4. **Acquire mainnet BOT.** There is no mainnet faucet. Budget time for:
   bridge supported assets in via [bridge.botchain.ai](https://bridge.botchain.ai/) →
   swap for BOT on [dex.botchain.ai](https://dex.botchain.ai/#/swap). Start this now; it
   involves real funds and can be slow.

5. **Generate the mainnet deployer key.** Fresh key, hardware wallet, never written to a
   file. The testnet key in your `.env` does **not** carry over. Fund it with enough BOT for
   deployment plus headroom.

6. **Talk to BOT Chain about the audit.** Ask whether they fund or refer one. Auditors want
   a frozen, test-covered codebase, so booking early sets the schedule for Batches 2–3.

7. **Legal check.** An inheritance product touching real money may intersect with estate and
   succession law depending on jurisdiction. "Trustless" does not place it outside those
   frameworks. Ask your backer how they have handled this for comparable projects.

**Exit criterion:** beneficiary model chosen, upgradeability chosen, mainnet BOT acquired,
deployer key generated and funded, audit conversation started.

---

## Batch 2 — Contract hardening

**Goal:** fix every mainnet blocker from the security review.

1. **Vault lifecycle** *(Critical)* — add `updateBeneficiary()` and `closeVault()`. `exists`
   must be clearable so an owner is never permanently locked to one beneficiary. Both must
   maintain the reverse index.
2. **Bound the interval** *(High)* — add `MIN_INTERVAL` / `MAX_INTERVAL`. This eliminates the
   `lastCheckIn + checkInInterval` overflow that lets anyone brick a victim's claim page.
3. **Beneficiary consent** *(High)* — implement whichever model Batch 1 chose. If opt-in, add
   `registerAsBeneficiary(bytes pubKey)` and gate `createVault` / `updateBeneficiary` on it.
4. **Settle vaults on claim** *(Medium)* — `delete vaults[_owner]` and unlink the index before
   the transfer, so a claimed vault does not linger permanently claimable. Reconsider the
   `amount > 0` requirement so a zero-balance vault can still be settled.
5. **Cap message length** *(Low)* — bound `_message`, allowing for ~33% ciphertext overhead.
6. **Index maintenance** — a `_link` / `_unlink` internal pair (swap-and-pop with a position
   mapping) used consistently by create, close, claim, and beneficiary change.
7. **Events** — add `BeneficiaryUpdated`, `VaultClosed`, `BeneficiaryRegistered`.

Keep checks-effects-interactions ordering throughout: state changes and `delete` before any
external call.

**Exit criterion:** contract compiles clean, every review finding addressed or explicitly
accepted in writing with a rationale.

---

## Batch 3 — Testing and analysis

**Goal:** prove the hardened contract behaves, before anyone external looks at it.

1. **Hardhat test suite.** At minimum:
   - claim before the interval elapses reverts
   - claim by a non-beneficiary reverts
   - claim succeeds exactly at the boundary, not before
   - reentrancy attempts on both `withdraw` and `claim` via a malicious receiver contract
   - full withdrawal, then claim
   - `closeVault` frees the address for a new vault
   - `updateBeneficiary` leaves both old and new reverse indexes correct
   - interval boundary conditions at `MIN_INTERVAL` and `MAX_INTERVAL`
   - index integrity after mixed sequences of create / close / claim / change
2. **Static analysis:** Slither and Aderyn. Triage every finding; document dismissals.
3. **Invariant / fuzz testing:** Foundry invariant tests or Echidna on the core accounting
   invariant — *the sum of all vault balances always equals `address(this).balance`*.
4. **Gas profiling.** Confirm `createVault` and `claim` costs are sane with a
   maximum-length encrypted message.

**Exit criterion:** full suite green, static analysis triaged, invariant holds under fuzzing.

---

## Batch 4 — Frontend rebuild

**Goal:** the UI catches up to the hardened contract, and the letter becomes actually private.

1. **Letter encryption.** Implement the scheme chosen in Batch 1. Prefix ciphertext
   (`enc:v1:`) so the format is versioned and legacy plaintext vaults still render.
   Decrypt only on the claim path.
2. **New contract surface.** Wire up `updateBeneficiary`, `closeVault`, and beneficiary
   registration if applicable.
3. **Multi-network config.** Parameterise chain ID, RPC, explorer, and contract address so
   the same build can point at 968 or 677. Show the active network prominently — a user must
   never be confused about whether they are on testnet or mainnet.
4. **Resilience.** Wrap each per-vault `getVault` call in try/catch so one malformed vault
   cannot break the whole claim list.
5. **UX polish:**
   - replace `prompt()` in deposit/withdraw with inline styled inputs
   - live-ticking countdown, updating every second
   - display the exact unlock date and time
   - prominent warning under 20% of interval remaining
   - calendar reminder (`.ics` / Google Calendar link) generated on vault creation
   - "How it works" and FAQ sections
   - mobile: if `window.ethereum` is absent, direct users to open the page in their wallet's
     in-app browser
6. **Risk disclosure.** State plainly that beneficiary relationships and balances are public
   on-chain, and that an owner can always withdraw ahead of a claim.

**Exit criterion:** frontend works end-to-end against the hardened contract on testnet.

---

## Batch 5 — Testnet rehearsal

**Goal:** run the real thing, on the real code, on chain 968.

1. Deploy the hardened contract fresh to testnet (chain 968, `rpc.bohr.life`).
2. Verify the source on `scan.bohr.life` — rehearse verification here so mainnet is routine.
3. Full multi-account walkthrough: register → seal → check in → update beneficiary → go
   silent → claim → confirm decryption works for the beneficiary and fails for everyone else.
4. Adversarial pass: attempt each attack from the security review against the new contract
   and confirm it now fails.
5. Recruit 5–10 outside testers, ideally including a non-technical one who plays the
   beneficiary. That persona is the real usability test for this product.
6. **WalletConnect custom-chain test (untested, flagged from Batch 4):** connect via
   WalletConnect from 2-3 real mobile wallet apps (at minimum MetaMask mobile and one
   other, e.g. Trust Wallet or Rainbow) and confirm each can actually add/switch to BOT
   Chain. Custom EVM chains aren't guaranteed to be accepted in a WalletConnect session
   proposal — unlike `wallet_addEthereumChain` in a browser extension, there's no
   standard fallback if the wallet doesn't already support the chain, so this needs
   verification with real wallet apps, not just the desktop QR path (which was verified
   in Batch 4 — see `app.html`'s `ensureNetworkViaAppKit()`). If a wallet can't add the
   chain, the app surfaces a friendly error rather than silently connecting to the wrong
   network, but the beneficiary persona should not be expected to hit that error at all —
   if a target wallet fails here, either drop it from recommended wallets or find a
   workaround before mainnet.
7. **Chain ID registry findings (2026-07-31):**
   - Mainnet 677 is correctly registered to BOT Chain in the public chain registry
     (chainlist-style lookups return BOT Chain's own name/RPC/symbol). Not a launch
     blocker.
   - Testnet 968 collides with Datagram (DGRAM), which holds that registry entry.
     Wallets that resolve unrecognized `wallet_addEthereumChain` requests against the
     public registry will show Datagram's name/RPC/symbol when prompting a user to add
     chain 968, even though our `wallet_addEthereumChain` payload carries BOT Chain's own
     params. This is BOT Chain's ID collision, not something fixable from this app's
     code. Batch 5 mobile testing happens on 968 — expect this friction during testing
     and don't misread wallet-shown Datagram branding as an app bug. The app-side guard
     added in Batch 4.1 (`verifyGenuineBotChain()` in `app.html` — compares the connected
     RPC's genesis block hash, fixed at chain creation and immune to the ID collision,
     against the known BOT Chain genesis hash for the active network) means the app
     itself will never silently treat a Datagram-resolved connection as BOT Chain,
     regardless of what the wallet's add-chain prompt displays. Checking `eth_chainId`
     alone would not have caught this — a wallet reporting the right numeric ID is not
     proof it's talking to the right RPC.
8. **Mobile WalletConnect debugging (2026-07-31):** investigated the report that
   WalletConnect "only works inside MetaMask's in-app browser." Root cause is not a
   single bug:
   - Opening the page inside MetaMask's in-app browser succeeds because MetaMask
     injects `window.ethereum` there — that's the EIP-6963/injected-provider path from
     Batch 4, not WalletConnect at all. WalletConnect isn't involved in that success case.
   - The actual WalletConnect path (tapping "WalletConnect" in the picker with no
     injected provider) is subject to a known, still-open ecosystem-wide limitation:
     generating a WalletConnect pairing session is asynchronous, but mobile browsers
     (especially Safari) only allow a wallet-app deep link/redirect to fire synchronously
     within the original click's user-gesture window. By the time AppKit's pairing URI is
     ready, that window has often closed, so the deep link silently does nothing. This is
     documented and still unresolved upstream — see reown-com/appkit issues #3954, #4785,
     #4788 and WalletConnect/walletconnect-monorepo#4610 — not something fixable from
     this app's integration code.
   - Found and fixed a real bug on our side while investigating: closing the AppKit modal
     without completing a connection (back button, tapping outside, or the deep link
     silently failing per the point above) left the connect button stuck on "Connecting…"
     forever, with no way to retry short of reloading the page — confirmed via
     `subscribeState`, which fires `{open: false}` on any close, success or not. Fixed by
     resetting to a clean, retryable state on modal close (`__onWalletConnectModalClosed`
     in `app.html`) — verified via Playwright.
   - Net effect: the "Open in MetaMask" direct deep link (Batch 4, still in the picker)
     remains the more reliable mobile path today, since it's a synchronous, static
     navigation not subject to the async-pairing timing problem. Batch 5 mobile testing
     should treat WalletConnect-in-plain-mobile-browser as best-effort, and lean on the
     direct deep link and in-app-browser paths as the ones expected to work reliably.
9. **Reverted the custom mobile picker entirely (2026-07-31):** the "Open in MetaMask"
   primary / WalletConnect secondary split from item 8 was itself the wrong call — it
   hardcoded one wallet by name and, worse, showed that custom deep-link UI even inside
   wallet in-app browsers (Zerion's, confirmed by screenshot) where an injected provider
   was already present and should have been used directly with no WalletConnect involved
   at all. Reverted to a single `<appkit-button>` everywhere, desktop and mobile
   identical — AppKit's own modal already discovers whatever wallet is injected
   (EIP-6963, generic, no hardcoded names) and connects through it directly when
   selected; the custom UI was overriding that instead of using it. Confirmed locally
   across a plain desktop browser, plain mobile Safari, and simulated MetaMask/Zerion
   in-app browsers (mocked injected providers) that the injected wallet appears in
   AppKit's modal and connects correctly in every case.
   - Also root-caused "Connection declined — a previous request is still active"
     further: a real WalletConnect pairing is created as soon as the QR view opens, and
     if the user closes the modal without completing pairing, that pairing is never
     cleaned up on its own — confirmed by inspecting `client.pairing.getAll()` before
     and after closing. Fixed with two cleanup points instead of one on our own
     picker's click handler (which no longer exists): once on page load (before any
     connection attempt, race-free), and once when the modal closes without having
     connected (after the attempt is already over, so it can't race a fresh one).
   - Also hardened the wrong-network check (`verifyGenuineBotChain`) to query the raw
     EIP-1193 provider directly instead of through `ethers.BrowserProvider`, removing
     ethers' own network-detection caching as a possible source of a false positive
     right after a chain switch. The Datagram collision on 968 (item 7) remains the
     most likely explanation for a wallet resolving the wrong RPC after "adding BOT
     Chain" — this fix rules out our own check being the bug on top of that, but can't
     rule out a wallet's own registry-based "add network" flow silently substituting
     Datagram's RPC, which is exactly the kind of thing that check exists to catch.
10. **Real-phone testing found two bugs simulation had missed (2026-07-31):**
    - **Button flicker.** The connect button visibly cycled through skeleton -> a
      near-empty ghost -> a solid coloured block with no label before settling. Root
      cause was two-fold: the real button is `<appkit-button>` containing
      `<appkit-connect-button>` containing `<wui-connect-button>` — three separate
      shadow roots deep — and the first fix attempt only checked the outermost one,
      which never sees a *nested* custom element's own shadow content, so it always
      fell through to a blind timeout no better than not checking at all. Fixed with a
      walker that checks both a node's shadow root and its light-DOM (slotted) children
      at every level — confirmed by walking the live DOM that the label text is
      slotted into `<wui-connect-button>`, not rendered inside its own shadow tree.
      Separately, that inner component legitimately swaps its whole template for a
      loading spinner while AppKit resolves whether a session should restore, so
      "has text right now" isn't "done rendering" — the reveal now waits for several
      consecutive identical non-empty reads, which survives that swap. Also fixed a
      real casing mismatch: the skeleton is a plain `<button>`, which brand.css
      uppercases globally (`button { text-transform: uppercase }`), while AppKit's
      real button is sealed inside a shadow root that global rule can't reach and
      stays mixed-case "Connect Wallet" — the skeleton now opts out of that rule.
    - **Connection declined, still.** The page-load + modal-close pairing cleanup
      (item 9) didn't fix it. Broadened to clear on the modal's *open* edge too, not
      just close — reasoning: on iOS, tapping a WalletConnect-based wallet backgrounds
      Safari to deep-link into the wallet app without the modal ever technically
      closing (`open` stays `true` throughout), so if the user returns and retaps
      without a real close in between, the old close-only cleanup never got a chance
      to run between the two attempts. Clearing on open is safe for the same reason
      clearing on close was: pairing generation only starts once a WalletConnect-based
      wallet is actually selected, a later, separate step, so nothing is at risk of
      being deleted mid-creation. This is a reasoned fix, not a confirmed one — it
      could not be verified against the real failure without a physical device and
      MetaMask installed.
    - Added real lifecycle logging for exactly this situation: `appKit.subscribeEvents`
      (AppKit's own modal/connect events) and the underlying WalletConnect SignClient's
      `session_proposal` / `proposal_expire` / `session_delete` / `session_expire`
      events, all funneled into one `window.__wcLog` sink. Viewable two ways — pick
      whichever is available when testing:
      - **Safari remote debugging (needs a Mac):** on the iPhone, Settings > Safari >
        Advanced > turn on Web Inspector. On the Mac, Safari > Settings > Advanced >
        turn on "Show features for web developers" (adds the Develop menu). Connect
        the iPhone by USB (or same Wi-Fi network with Wi-Fi debugging enabled), open
        the site in mobile Safari, then on the Mac pick the iPhone and the tab from
        Safari's Develop menu — this opens a full Web Inspector with console, network,
        and DOM, same as desktop.
      - **On-page debug overlay (no Mac needed):** tap "debug log" in the footer on
        the phone itself. Shows the same log lines as the console, newest first,
        timestamped in ms since page load — reproduce the bug, then screenshot or
        scroll the panel to read back exactly what happened (`modal:open`/`modal:close`,
        `cleanup:start`/`cleanup:disconnected`, `account`, `wc:session_proposal`,
        `wc:proposal_expire`, etc.).
      - To test the fix specifically: tap Connect Wallet, tap MetaMask, let it deep-link
        into the MetaMask app, back out or let it decline, return to Safari, tap
        Connect Wallet again. The log should show `modal:close` -> `cleanup:start` (from
        the first attempt closing) and then `modal:open` -> `cleanup:start` again (from
        the second attempt opening) before any new `wc:session_proposal`. If "Connection
        declined" still happens with that sequence present in the log, the pairing
        cleanup isn't the actual cause and the log's exact sequence at the moment of
        failure is what's needed next.
11. **Beneficiary registration built end-to-end (2026-07-31):** closes out
    `docs/BATCH_4_DESIGN_BRIEF.md`'s carry-forward items 1 and 2, plus the
    `register.html` landing page called for separately. Scheme is ECIES over
    P-256 (WebCrypto native, no external library) — `beneficiary-crypto.js`,
    shared by `app.html` and `register.html`. The beneficiary's private key
    never leaves their device except as a backup file they explicitly save;
    it's namespaced in localStorage by chain + address + key version, so
    testnet/mainnet and key rotation never collide.
    - **Create-vault flow:** typing a beneficiary address debounce-checks
      `beneficiaryKeyCount` and either shows a green "registered" state
      (passphrase field hidden, letter encrypted straight to their key) or a
      prominent warning with a one-click "copy registration link" — no
      hardcoded owner/beneficiary assumptions, just `register.html?from=<owner>`
      for personalization.
    - **Late registration:** the owner's standing-vault view now separately
      checks whether the *current* beneficiary has registered a key *since*
      the vault was sealed with a passphrase, and offers a re-encrypt flow
      (decrypt with the passphrase client-side, re-encrypt to the registered
      key, `updateMessage`) — the owner never has to retype the letter.
    - **Claim flow:** detects the ciphertext format byte and, for
      registered-key letters, auto-decrypts from a locally-saved key or
      offers to import a saved backup file (for claiming from a different
      device than the one that registered).
    - **register.html:** written for the non-technical, possibly-grieving
      persona explicitly — plain language throughout, no unexplained jargon,
      upfront about the network fee and about what's lost if the backup file
      is lost (the letter, never the funds), an already-registered state that
      doesn't push accidental re-registration, and an FAQ addressing the
      likely first fears ("is this a scam," "do I need to do this right
      now").
    - Verified via Playwright end-to-end across both pages in one shared
      browser context: register on `register.html` -> seal a vault on
      `app.html` (owner side correctly detects the registration and skips
      the passphrase) -> claim on `app.html` (beneficiary side finds the
      saved key with no import needed and decrypts to the exact original
      text). Also caught and fixed a real bug in the process: computing the
      new key's version number via a post-transaction re-read of
      `beneficiaryKeyCount` was racy (a read-only provider can lag behind
      the write and still report the old count) — fixed to use the
      pre-transaction count instead, which is deterministic since keys are
      0-indexed and append-only.
    - Not done in this pass (out of scope for this request, still open):
      carry-forward items 3–5 from the original brief — inbox-harassment
      mitigation, the metadata-leak disclosure, and the locked-minimum
      disclosure.

**Exit criterion:** clean end-to-end runs, no critical feedback outstanding.

---

## Batch 6 — External review

**Goal:** independent eyes before real money.

1. Freeze the codebase. No feature work during review.
2. Professional audit. Budget weeks, not days, for the audit plus remediation plus re-review.
3. Remediate findings; anything material means re-running Batch 3.
4. Extended public testnet period with a bug bounty — the longer this runs, the better.
5. Publish the audit report alongside the product.

**Exit criterion:** audit findings resolved, codebase frozen and tagged for release.

---

## Batch 7 — Infrastructure

**Goal:** production hosting. Can run in parallel with Batches 2–6.

1. Import the repo at [vercel.com/new](https://vercel.com/new). Framework preset "Other",
   no build command. Set Root Directory to `frontend` if `index.html` lives there.
2. Confirm branch preview deploys work — every future change gets a live URL before merging.
3. Custom domain if you want it to read as a real product.
4. **Retire GitHub Pages gracefully.** Judging is over, but the old URL is in your X post and
   your notes. Replace the Pages `index.html` with a redirect rather than deleting it:
   ```html
   <meta http-equiv="refresh" content="0; url=https://your-domain.com/">
   ```
5. Keep a separate testnet deployment permanently available for demos and onboarding.

**Exit criterion:** production URL live, previews working, old URL redirecting.

---

## Batch 8 — Mainnet deployment

**Goal:** ship. This step is irreversible — do nothing here that has not been rehearsed.

1. Re-confirm network parameters against BOT Chain's docs on the day: **chain ID 677**,
   `https://rpc.botchain.ai`, explorer `https://scan.botchain.ai`.
2. Add mainnet to MetaMask; confirm the deployer has enough BOT.
3. Deploy from the hardware-wallet key. Record the contract address, tx hash, and block.
4. **Verify the source on `scan.botchain.ai` immediately.** Users must be able to read what
   they are trusting; an unverified inheritance contract is not credible.
5. Update the frontend's mainnet contract address; deploy to a preview URL first, then promote.
6. Seal one small real vault yourself and run a full claim cycle before announcing anything.
7. Record everything — address, tx hash, deploy block, compiler version, optimizer settings —
   in your project doc. **Label the key material clearly this time.**

**Exit criterion:** contract live and verified, one real end-to-end cycle completed.

---

## Batch 9 — Post-launch

1. Monitor contract events; alert on unusual activity.
2. Publish docs: how it works, what the guarantees are, what the risks are, the audit report.
3. Announce with BOT Chain.
4. Keep the bug bounty open.
5. Track the roadmap: multiple beneficiaries with percentage splits, keeper-driven deadline
   reminders, ERC-20 and NFT support.

---

## Standing rules

- **Never deploy on the same day you finish writing code.** Sleep on it.
- **The testnet contract stays live** as a demo and a rehearsal environment.
- **Every contract change after Batch 6 restarts Batch 3.** No exceptions — this is exactly
  how post-audit bugs reach mainnet.
- **The deployer key never touches a file.** Hardware wallet only.

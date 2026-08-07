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

---

## Product debt — beneficiary has no way to pay gas to claim

Found on testnet: a beneficiary's wallet is almost always empty the first time
they ever open it — a non-technical heir isn't going to have pre-funded a
wallet against the day they inherit one. Claiming is still an on-chain
transaction and still costs gas like any other, so an empty wallet silently
blocks the one moment this product exists for.

Mitigated for testnet only (`app.html`, `checkClaimGasBalance()`): detects a
too-low balance on the claim screen and explains it plainly before the
button is pressed, with a link to the testnet faucet
(`https://faucet.botchain.ai/basic`, `config.js` → `NETWORKS.testnet.faucetUrl`).

**Not solved for mainnet.** There is no mainnet faucet (see `CLAUDE.md`), so
"go get some BOT first" is a real onboarding wall, not just a worse version
of the testnet mitigation. The roadmap already names a keeper (Batch 9,
`docs/LegacyVault_Mainnet_Plan.md`) for deadline automation — the same
direction is worth extending to the claim itself: a sponsored or
meta-transaction claim path (the keeper, or some relayer, pays the gas; the
beneficiary just signs) would remove the gas barrier entirely instead of
requiring them to acquire BOT before they can receive BOT. Not scoped for
the current mainnet launch — noted here so it isn't lost, and so "beneficiary
claims successfully" isn't assumed solved just because the testnet warning
exists.

---

## Chain quirk — baseFeePerGas present but legacy-only (testnet)

BOT Chain reports baseFeePerGas: "0x0" in block headers (present, not
absent) while every mined transaction is type-0 legacy. That combination
misleads wallet SDKs into building EIP-1559 transactions the chain
doesn't process — the suspected cause of "transaction rejected on-chain
without a reason" when sealing. Mitigated by forcing an explicit
gasPrice override on all 8 write calls.

Two follow-ups to note:
1. Worth reporting to the BOT Chain team — a chain without EIP-1559
   support shouldn't advertise a baseFeePerGas field, since that's what
   every wallet and library uses to detect it.
2. Check whether mainnet (chain 677) has the same quirk BEFORE deploying.
   If it does, the same override is needed. If mainnet genuinely supports
   EIP-1559, forcing legacy gas could overpay or fail.

---

## Chain quirk — chain 968 registry collision with Datagram (testnet only)

**CONFIRMED ON-DEVICE** (Zerion mobile, `?debug=1` capture). Chain ID 968
is registered to a different, unrelated project — Datagram (DGRAM) — in
ethereum-lists/chains, with a different name, currency symbol, and RPC
than BOT Chain's. Registry policy doesn't allow reassigning a chain ID
once claimed, so this collision is permanent for testnet; it isn't
something we can get fixed upstream.

**The real failure mode is a silent wrong-chain switch, not a rejected
add — this was wrong in the original hypothesis.** The original theory
was that `wallet_addEthereumChain` gets rejected by stricter mobile
validation. The actual on-device log shows something different and worse:
Zerion already has chain 968 registered as Datagram, so
`wallet_switchEthereumChain` **succeeds** — it switches the wallet to
Datagram's actual RPC, which happens to share the same numeric chain ID.
`wallet_addEthereumChain` is never even called, because our own logic
only calls it when the switch fails with "unrecognized chain" (4902); a
successful switch to the wrong network doesn't trigger that path. The
wallet then reports chainId `0x3c8` — correct — while genuinely talking
to a different chain. The only thing that catches this is
`tryResolveChain`'s genesis-hash check (`verifyGenuineBotChain`); chainId
comparison alone would have shown this as a normal, successful connection.
**Any wallet that already has Datagram registered under chain 968 cannot
use BOT Chain testnet through the automatic switch/add flow at all** —
manual network entry (removing/overwriting the existing 968 entry in the
wallet's own UI) is the only way through, and even that depends on how a
given wallet's manual-add flow handles an already-occupied chain ID.

**Mitigation is platform-agnostic, not mobile-gated.** An earlier version
of this fix used a mobile user-agent check to decide when to surface the
manual-entry fallback proactively. That was wrong on two counts: the bug
was never actually mobile-specific (it depends on whether a given wallet
has Datagram registered, not on the device), and the UA check itself was
fooled by Zerion's in-app browser, which reports a plain desktop Mac UA.
`app.html` now surfaces the manual-entry fallback proactively on every
platform whenever the target network has a registry collision, with copy
describing the actual confirmed mechanism (silent switch to the wrong
chain) rather than the original, incorrect "may be rejected" guess. Still
a workaround for a collision we don't control, not a fix for it.

**When the wallet is confirmed already-collided, don't offer either
remedy — both would fail.** `tryResolveChain` now distinguishes "wrong
chain entirely" (generic `chainOnboardingFailed`: offer the "Add BOT
Chain" retry and manual entry — both can genuinely help there) from
"chainId matched, genesis didn't, and that network has a registered
collision" (`registryCollisionBlocked`: state the true cause by name,
suggest trying a different wallet, note this is testnet-only — and show
neither remedy). There's nothing to add (the switch already "succeeded")
and no manual entry that helps (the wallet already has that chain ID
claimed by Datagram and won't let it be re-added), so offering either
would just waste the user's time on something already known to fail.

**TESTNET ONLY.** Chain 677 (mainnet) is correctly registered to "BOT
Chain Mainnet" in the same registry, with matching name, currency, and
explorer (`scan.botchain.ai`) — this should not recur there. Still,
re-verify add-chain on a real phone against mainnet before launch rather
than assuming a clean registry entry guarantees every wallet's add-chain
flow behaves.

Datagram's registered entry also advertises EIP1559 support, which may
compound the separate `baseFeePerGas` quirk above — a wallet consulting
the registry for chain 968 has a second, independent reason to assume
EIP-1559 behavior that BOT Chain testnet doesn't actually have.

---

## AppKit auto-reconnects to an injected wallet on its own initiative

Found via the same Zerion mobile `?debug=1` capture as the chain-968
collision above: `appkit:CONNECT_SUCCESS` (`method:browser,
reconnect:true`) fired roughly every 10 seconds, 25+ times in one
session — entirely on Reown AppKit's own initiative. At the time this was
found, the app bypassed AppKit's `connect()` for every injected-wallet
session (`connectDirect()`, called directly from `connectBtn`), so
AppKit had no legitimate reason to be reconnecting to the same provider
at all; it auto-detects an injected wallet via EIP-6963 and manages it
independently regardless of whether the app ever calls into it.

Checked this SDK version's `AppKitOptions`/`Features` types for a flag to
disable AppKit's own injected/EIP-6963 detection outright — none exists.
Mitigated reactively: `app.html`'s `subscribeEvents` handler calls
`appKit.disconnect()` whenever it sees `CONNECT_SUCCESS` while
`usingDirectConnect` is true — i.e. a direct-connect session (established
outside AppKit's own modal, via `tryAutoReconnect`'s raw `eth_accounts`
call) already owns the connection, so a CONNECT_SUCCESS at that point can
only be AppKit reconnecting to something on its own.

**This got more complicated after `connectBtn` was changed to always open
AppKit's modal** (see the `SafeInjectedEthersAdapter` entry below) — a
browser wallet picked FROM that modal now also flows through
`connectWithAccounts` and sets `usingDirectConnect = true`, which would
make the guard above disconnect the very session it just legitimately
established. Fixed with a second flag, `injectedViaAppKit`, set true only
for that case; the guard now reads `usingDirectConnect && !injectedViaAppKit`.
Traced through by hand (not device-verified) that the ordering is correct:
`SafeInjectedEthersAdapter`'s override sets both flags synchronously
before returning to AppKit's controllers, which is what actually triggers
`CONNECT_SUCCESS` — so by the time the guard runs, `injectedViaAppKit` is
already `true` for that connection specifically.

**Still not device-verified.** Could not reproduce the actual
auto-reconnect trigger in headless Chrome — a synthetic EIP-6963
announcement wasn't enough to make AppKit attempt its own connect without
a real prior session for it to restore, so neither the original
disconnect call nor the `injectedViaAppKit` refinement has been confirmed
against a live loop. Needs re-testing against a real device (Zerion or
another wallet that previously exhibited this) — specifically: (1) that
the loop still gets disconnected when a `tryAutoReconnect`-established
session should own things, and (2) that connecting a browser wallet
through AppKit's modal is no longer immediately torn down.

Plausible, not confirmed, connection to the WebKit crash below: the loop
would repeatedly re-enter AppKit's own reconnect-success handling code,
which is where the crash appears to originate.

---

## SafeInjectedEthersAdapter — undocumented override, pinned to 1.8.23

`app.html` subclasses `@reown/appkit-adapter-ethers`'s `EthersAdapter`
and overrides `connect()` to work around AppKit aborting the whole
connection when its own network-reconciliation switch fails. Read
directly from that exact package version's source
(`unpkg.com/@reown/appkit-adapter-ethers@1.8.23/dist/esm/src/client.js`):
`EthersAdapter.connect()` calls `wallet_requestAccounts`, then — if the
wallet's current chain doesn't match whatever chainId AppKit is
targeting — attempts `wallet_switchEthereumChain` and throws
`"EthersAdapter:connect - Switch network failed"` if that fails,
discarding the accounts it already had. No documented option disables
this.

`connectBtn` was changed to always open AppKit's own modal (previously it
bypassed straight to an injected wallet via `connectDirect()`, with no
way to reach WalletConnect/QR when one was installed). `SafeInjectedEthersAdapter`
intercepts only non-WalletConnect connectors (checked against both the
connector id `'walletConnect'` and type `'WALLET_CONNECT'`, confirmed
literal values from `@reown/appkit-common@1.8.23`'s `ConstantsUtil.js`)
and routes them through this app's own `connectWithAccounts`/
`connectWithEth` instead of AppKit's switch-or-abort logic. WalletConnect
picks go through AppKit's real `connect()` untouched.

**Undocumented internal, pinned to 1.8.23 — needs re-verification on any
version bump.** This isn't a public extension point; it depends on
`connect()`'s exact parameter shape, `this.connectors`/
`this.ethersProviders` existing with their current shapes, and the
literal connector id/type strings above. All three `@reown/appkit*`
esm.sh imports are exact-pinned with no range for this reason. A passing
smoke test after a version bump is not enough — the failure this guards
against only shows up when a wallet's current chain doesn't match
AppKit's target, which won't happen on every test connect. If Reown ever
fixes `EthersAdapter` to not abort on a failed switch, this whole class
(and the plain `new EthersAdapter()` it replaces) can be removed.

Fails safe rather than silently: if the override's assumptions stop
holding against a future version, it falls back to this app's own
independent `connectDirect()` — reported to AppKit's modal as a failure,
but this app's own header still reflects the real, successful connection
by then, since `connectDirect()` drives its own state independently of
AppKit's rejection. A degraded connect beats a dead button. Verified this
fallback path doesn't itself throw a syntax error and that
`SafeInjectedEthersAdapter` doesn't break AppKit's normal init (confirmed
`appkit-ready` still fires, `disconnect` is a real method) — **not**
verified that the fallback actually engages against a genuinely broken
future version, since that requires a version this app isn't pinned to.

---

## Uncaught ReferenceError on WebKit: "Can't find variable: extractInfo"

Captured via the same Zerion mobile `?debug=1` session — an uncaught
error at ~208ms into page load, WebKit only. `extractInfo` does not
appear anywhere in this repo (`app.html`, `config.js`,
`beneficiary-crypto.js`, `index.html` — checked directly). It isn't a
name this codebase uses.

Two real possibilities, neither confirmed:
1. It's inside the Reown AppKit / WalletConnect dependency graph loaded
   from esm.sh — a wallet-info-extraction helper is a plausible name for
   something in their connect/reconnect-success handling, which would tie
   it to the reconnect loop above. Spent real effort trying to locate it
   directly in the fetched AppKit bundle chunks and via GitHub code
   search; came up empty, but AppKit's dependency graph is large and
   chunked, and this doesn't rule it out.
2. It's from Zerion's own in-app-browser injected script (many in-app
   wallet browsers inject a content script into the page for
   `window.ethereum`/EIP-6963 setup) — same-document injected scripts
   aren't cross-origin-redacted the way a separate `<script src>` would
   be, so a full "Can't find variable" message is consistent with this
   too, and wouldn't be anything in our control at all.

Not fixed — there was nothing in our own code to fix. If this recurs,
worth checking whether it still happens with the AppKit reconnect-loop
mitigation above in place (since that may stop AppKit from re-entering
whatever code path throws this), and whether it reproduces on WebKit
outside of Zerion specifically (Safari directly, or another WebKit-based
in-app browser) to help distinguish the two possibilities above.

---

## Bookkeeping note — mislabeled commit subject

Commit `a54071d` ("Check balance before writing; stop guessing 'stale
contract'; quiet the beneficiary hint") has a subject line copy-pasted
from an earlier, unrelated commit — the body text is correct and
describes what the commit actually does (the Datagram registry-collision
detection: `registryCollisionBlocked`, the new `tryResolveChain` shape,
`registryCollisionNetworkName` in `config.js`). Left as-is rather than
amended/force-pushed over `main`; noted here so `git log` browsing isn't
misled by the subject alone.

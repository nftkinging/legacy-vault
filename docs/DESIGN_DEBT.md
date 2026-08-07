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
independently regardless of whether the app ever calls into it. Checked
this SDK version's `AppKitOptions`/`Features` types for a flag to disable
AppKit's own injected/EIP-6963 detection outright — none exists.

**History of this mitigation, kept because each step is a real lesson:**

1. First attempt: `subscribeEvents` called `appKit.disconnect()` whenever
   it saw `CONNECT_SUCCESS` while `usingDirectConnect` was true (a
   `tryAutoReconnect`-established session already owning the connection).
2. After `connectBtn` was changed to always open AppKit's modal (see the
   `SafeInjectedEthersAdapter` entry below), a browser wallet picked from
   that modal ALSO started setting `usingDirectConnect = true` — which
   would make step 1's guard disconnect the very session the user just
   made. Added `injectedViaAppKit`, true only for that case; guard became
   `usingDirectConnect && !injectedViaAppKit`.
3. **Found live, and this is the one that actually mattered: calling
   `appKit.disconnect()` at all was unsafe.** `EthersAdapter.disconnect()`
   for an `ANNOUNCED`/`EXTERNAL` connector calls
   `revokeProviderPermissions()` underneath — i.e. `wallet_revokePermissions`
   — confirmed directly in `@reown/appkit-adapter-ethers@1.8.23`'s source.
   A false positive on this guard doesn't just glitch the UI, it can
   **actually revoke the wallet's site permission**. This turned out to be
   exactly what "session doesn't survive reload" was: not a display bug,
   a real, persisted permission revocation from an earlier false-positive
   disconnect — reproducing worse on mobile because that's where AppKit's
   own reconnect fires most often (more chances for the guard to
   misfire). **The `appKit.disconnect()` call was removed from this guard
   entirely** — it now only logs `CONNECT_SUCCESS` events for future
   diagnosis. The original problem (visible reconnect churn, a plausible
   WebKit-crash trigger, see below) is still guarded against separately
   and safely: every path that establishes this app's own connection
   state sets `usingDirectConnect` before awaiting anything, and
   `__onAppKitAccount`'s own early-return guard
   (`usingDirectConnect || directConnectResolving`) already prevents a
   redundant AppKit reconnect from corrupting app state — it just no
   longer also reaches for AppKit's real `disconnect()`.

**Same investigation also found the actual cause of the reload
regression**, not just the unsafe symptom-mitigation: `__onAppKitAccount`
— which is how AppKit's own session restore on load gets bridged into
this app — only ever called `connectWithEth` directly on success, never
`connectWithAccounts`. So an injected-wallet session restored by AppKit
itself (not `tryAutoReconnect`'s raw `eth_accounts`) never set
`usingDirectConnect`/`injectedViaAppKit` at all, leaving a later,
legitimate `CONNECT_SUCCESS` for that same connector looking exactly like
an illegitimate competing one to the guard above — which is what made the
(now-removed) `disconnect()` call fire on an ordinary page-load timing
race, not just the genuinely-unwanted case. Fixed by having
`__onAppKitAccount` route an injected-wallet success through
`connectWithAccounts(..., viaAppKit=true)` — same as
`SafeInjectedEthersAdapter`'s own interactive connect — while a
WalletConnect/no-injected-wallet success still calls `connectWithEth`
directly, since that path has no alternative event source once
`usingDirectConnect` would gate `__onAppKitAccount` out (there's no
`window.ethereum` to listen to instead). `tryAutoReconnect` also now
defers (`if (usingDirectConnect) return;`, checked right after its own
`eth_accounts` resolves) rather than re-running `connectWithAccounts` on
top of a session AppKit's own restore already won, which would otherwise
overwrite `injectedViaAppKit` back to `false`.

Verified in headless, isolated per fix (decoupled from the actual
race timing, which proved unreliable to reproduce): `__onAppKitAccount`'s
injected branch sets both flags and connects correctly on its own;
`tryAutoReconnect` correctly no-ops without touching either flag when
`usingDirectConnect` is already true; no spurious `disconnect()` calls
from either path. Full prior regression suite (WalletConnect bypass,
`SafeInjectedEthersAdapter` flag-setting, `emit`/`addConnection`/
`listenProviderEvents`, disconnect→reconnect, fail-safe fallback)
re-ran clean.

**Still not device-verified against the real reconnect loop or the real
reload-persistence fix** — could not reproduce AppKit's actual
auto-reconnect trigger or its real session-restore timing in headless
Chrome (a synthetic EIP-6963 announcement isn't enough without a real
prior session for AppKit to restore from). Needs a real device
re-test — this is now item 3 on `docs/WALLET_TEST_CHECKLIST.md`.

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

**Fixed bug, found live: connection succeeded but AppKit's modal showed
an error/"try again" anyway** — reproduced identically on desktop,
mobile, and MetaMask's in-app browser, most visibly on reconnect after a
disconnect. Root cause traced into `@reown/appkit-controllers@1.8.23`'s
`ConnectorControllerUtil.connectExternal()`
(`unpkg.com/@reown/appkit-controllers@1.8.23/dist/esm/src/utils/ConnectorControllerUtil.js`):
the modal's own promise resolves — and calls `ModalController.close()` —
by **subscribing to `ChainController`'s `activeCaipAddress` state
becoming truthy**, not from `connect()`'s return value. The first version
of `SafeInjectedEthersAdapter.connect()` only returned a value; it never
called the side effects the original `EthersAdapter.connect()` calls on
success — `this.emit('accountChanged', ...)` (what actually updates that
state), `this.addConnection(...)` (the adapter's own connections
bookkeeping, which is why disconnect→reconnect specifically surfaced it:
AppKit never had the connector registered as connected in the first
place), and `this.listenProviderEvents(...)` (future account/chain-change
forwarding). This app's own state updated fine regardless (via
`connectWithAccounts`, independent of AppKit's bookkeeping), which is why
the app itself worked while AppKit's modal did not.

Fixed by replicating those three calls, using the wallet's actual
reported chain (not AppKit's target `chainId` param) for the emitted/
returned/registered chain — since this override deliberately never
performs the switch that would make the target trustworthy. Verified via
the same exposed-class unit-test approach: `emit`/`addConnection`/
`listenProviderEvents` all fire on both first connect and reconnect-
after-disconnect, checksummed address returned, `adapter.connections`
correctly empties on disconnect and repopulates on reconnect — confirmed
across repeated runs. Still not confirmed against AppKit's real modal UI
(same headless-rendering limitation noted above) or a real device.

---

## Header flashed "Connect Wallet" for ~2s before flipping to connected

Regressed by the same AppKit-modal rework, found via the wallet test
checklist (item 6). `tryAutoReconnect`'s empty-`eth_accounts` branch used
to call `setHeaderState('disconnected')` immediately — reasoning that an
empty, fast RPC response was "the real answer," not worth waiting out the
3s backstop for. That stopped being true once AppKit's own modal became a
real second connect path: an empty `eth_accounts` result only rules out
the local injected wallet directly authorizing the site — it says nothing
about a session AppKit itself might still be restoring (WalletConnect, or
an injected connector reached only through AppKit's modal, restored via
`__onAppKitAccount`). On a machine where the local extension wasn't the
thing that authorized the site but a WalletConnect session was still
about to restore, this rendered 'disconnected' immediately, then flipped
to 'connected' once AppKit's own restore actually completed a couple of
seconds later — the exact flash reported.

Fixed by removing the premature `setHeaderState('disconnected')` call
from both the empty-accounts branch and the catch block — `tryAutoReconnect`
now only ever resolves the header to 'disconnected' by deferring (doing
nothing) when it has no account of its own, leaving `setHeaderState`'s
existing 3s backstop timer as the single place "confirmed nothing to
restore" gets decided. A successful restore from either
`tryAutoReconnect` or AppKit's own `__onAppKitAccount` clears that timer
normally. Cost: a user with genuinely no prior session now always waits
the full 3s to see Connect Wallet, instead of resolving instantly on an
empty response — a deliberate trade for correctness, per the explicit
"never render Connect Wallet while state is unknown" instruction this was
tested against.

Verified in headless the same way as the original three-state fix: header
state polled every 50ms through a simulated slow load (fast-but-empty
`eth_accounts`, AppKit-style restore completing ~2s later) —
`connectBtn`'s computed display never left `none` at any sampled point
while the session existed. Separately confirmed the genuinely-no-session
case still resolves to 'disconnected' via the 3s backstop, not stuck in
'unknown' forever.

---

## Desktop Safari (no injected wallet) reported hanging on AppKit's own connect modal

Reported via the wallet test checklist: on desktop Safari with no
injected wallet — the one remaining path that still depends on AppKit's
own `connect()` (WalletConnect/QR, since `SafeInjectedEthersAdapter` only
intercepts non-WalletConnect connectors) — the modal opens and just keeps
loading, never resolving. Reproduces reliably on that one platform;
desktop with an injected wallet and MetaMask's in-app browser are both
fine. **Not reproduced or diagnosed here** — no macOS/Safari available in
this environment, and AppKit's real modal doesn't render in the headless
Chrome harness used throughout this file (noted repeatedly above).
Instrumented instead of guessing at a fix, per instruction:

- `appKit.getUniversalProvider().catch(() => {})` used to swallow any
  rejection silently — exactly the kind of gap that could hide a
  Safari-specific failure (WalletConnect's SignClient needs IndexedDB and
  a relay-server websocket to initialize; either could plausibly behave
  differently under Safari's storage/tracking restrictions than under
  Chromium). Now logs `appkit:getUniversalProvider:call` /
  `:resolved` / `:error`.
- Best-effort relay-level instrumentation reaching into
  `universalProvider.client.core.relayer` (undocumented internals, every
  step defensively guarded and logged even on failure to find these
  objects) — logs whether the relayer is found, its `connected`/
  `connecting` state, its `relayUrl`, and `relayer_connect`/
  `_disconnect`/`_error` events if the SDK exposes them.
- `connectBtn`'s click handler now logs `appkit:open:call`, then
  `:resolved`/`:rejected`/`:threw` depending on what `appKit.open()`
  actually does.
- `__onAppKitModalStateChange` now logs `isConnectedState` and
  `hasInjectedWallet` alongside open/close, and arms a 20s stall
  watchdog on open — logs `appkit:modal-open-stalled` if the modal is
  still open with nothing resolved by then, so a `?debug=1` capture from
  a real Safari session shows exactly how long it sat there and what (if
  anything) happened last.

Verified the instrumentation itself fires correctly in headless
(`appkit:open:call`/`:resolved`, `modal:open` with the new context) —
confirms the logging works, not the Safari bug itself, which still needs
a real device capture (item 1 on `docs/WALLET_TEST_CHECKLIST.md`).
Incidentally, `getUniversalProvider()` did not resolve OR reject within
~11s in this headless Chrome test environment either — worth knowing
going in (this call can genuinely be slow, or headless Chrome's own
networking has some unrelated constraint), but not itself evidence about
Safari specifically, since headless Chrome and Safari are different
environments with their own possible causes for the same symptom.

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

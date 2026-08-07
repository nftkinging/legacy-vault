# Wallet test checklist

Manual, runnable in a few minutes on desktop and on a phone. Every item
here has broken at least once this week from an otherwise-correct-looking
fix elsewhere — that's the actual reason this list exists, not
thoroughness for its own sake. Run all of it, not just the area a change
touches; the failures so far have all been cross-cutting.

Claude: before every push, go through this list and say which items a
change could plausibly affect (even indirectly — the connect/reconnect/
disconnect flow is one shared, easily-disturbed system, not separate
features). The user tests those specific items; you don't run this list
yourself.

Two passes: **desktop** (MetaMask extension) and **phone** (Zerion or
similar in-app browser, and MetaMask Mobile if convenient). Note which
platform each failure is on — several of these bugs have been
platform-specific.

- [ ] **1. First connect.** Fresh browser/wallet state (or `Disconnect`
  first). Tap Connect Wallet → modal opens → pick the wallet → connects
  with no error, address and balance show in the header.
- [ ] **2. Reconnect after disconnect.** With #1 connected, tap
  `Disconnect`, then Connect Wallet again, same wallet. Connects cleanly,
  no error in AppKit's own modal, no stuck/error state.
- [ ] **3. Refresh persistence.** With #1 or #2 connected, reload the
  page. Session restores silently — no flash of "Connect Wallet", no
  re-prompt, address/balance still shown. This is the one that's broken
  most often; don't skip it.
- [ ] **4. Account switch.** While connected, switch the active account
  inside the wallet itself (not on the page). Header updates to the new
  address without a manual reconnect.
- [ ] **5. Chain switch.** While connected, switch networks inside the
  wallet itself. App reflects it correctly (either resolves to the right
  network, or shows the wrong-network prompt at the next action) — no
  silent stale state.
- [ ] **6. Header never shows the wrong state.** Across #1–#5: never
  "Connect Wallet" while actually connected, never showing connected
  while actually disconnected, no visible flicker between states on
  load.
- [ ] **7. Balance updates without a full reload.** Send/receive funds
  (or use the testnet faucet), or complete any transaction. Header
  balance updates within ~15s or on refocusing the tab, no manual reload
  needed.
- [ ] **8. Gas check before transactions.** With a low/empty balance,
  attempt an action (seal, check-in, deposit, claim). Plain-language "you
  need about X BOT" warning appears *before* the wallet prompts —
  wallet never opens for a transaction that can't succeed.
- [ ] **9. WalletConnect QR path.** With a browser wallet installed
  (so Connect Wallet would normally go straight to it), open the modal
  and deliberately pick WalletConnect/QR instead. Scanning connects a
  separate mobile wallet correctly; the AppKit-picked injected wallet
  from #1 isn't disturbed by this.
- [ ] **10. Zerion/Datagram messaging (testnet only).** On a wallet that
  already has chain 968 registered as Datagram (Zerion is the known
  case): attempting an action shows the specific "this wallet has chain
  968 registered to a different network" message — never the generic
  "Add BOT Chain" button or manual-entry offer, since both would fail
  here.

## If something fails

Note which item, which platform, and paste the `?debug=1` log if you can
— most of these bugs have only been fully diagnosable from that log, not
from what the UI shows.

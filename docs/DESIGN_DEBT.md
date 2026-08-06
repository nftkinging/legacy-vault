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

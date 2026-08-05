# Legacy Vault

A dead man's switch on BOT Chain. An owner locks BOT plus a final letter for a beneficiary
and checks in periodically as proof of life. If they go silent past their chosen interval,
the beneficiary can read the letter and claim the funds. Currently on testnet; being
hardened for a mainnet launch backed by BOT Chain.

## Stack

- `contracts/LegacyVault.sol` — Solidity 0.8.20, one vault per owner address
- `frontend/index.html` — single-file vanilla JS dApp, ethers.js v6 via CDN, MetaMask
  through `window.ethereum` (no WalletConnect, no build step, no backend)
- Hardhat for compile / test / deploy

## Networks

| | Testnet | Mainnet |
|---|---|---|
| Chain ID | 968 | 677 |
| RPC | `https://rpc.bohr.life` | `https://rpc.botchain.ai` |
| Explorer | `https://scan.bohr.life/` | `https://scan.botchain.ai` |

Live testnet contract: `0xA6D643FbDE7a2fd7D4D7e79075377ADd022F40b7` (hardened, Batch 5)
Mainnet BOT is only obtainable by swapping on `dex.botchain.ai` — there is no mainnet faucet.

## Reference docs

- `docs/LegacyVault_Security_Review.md` — findings and remediations. Read before touching
  the contract.
- `docs/LegacyVault_Mainnet_Plan.md` — the batched launch plan. Read to find the current batch.

## Rules

**Never deploy, broadcast a transaction, or spend gas without explicit approval.** Propose
diffs and deployment commands; let the human run them. This applies to testnet as well.

**Never put a private key in a file.** No `.env` key for mainnet — hardware wallet only.
`.env` stays gitignored.

**Preserve checks-effects-interactions.** All state changes, including `delete`, happen
before any external call. Payouts use `call{value:}` with a checked return, never
`.transfer()`.

**Any contract change after the audit restarts the full test suite.** No exceptions.

**Assume every new contract function is attacker-reachable.** Ask who can call it, with what
arguments, and what happens if they are hostile. Griefing counts as a vulnerability here:
anyone can currently name any address as a beneficiary and attach arbitrary text.

## Decided — beneficiary model: hybrid (passive by default, opt-in as an upgrade)

Beneficiaries can still be named without pre-registering — required for the product's actual
persona (a non-technical heir who may not know they've been named until claim time; see
`docs/LegacyVault_Mainnet_Plan.md` Batch 5). `registerAsBeneficiary(pubKey)` is available but
optional:

- If the beneficiary has registered, encrypt to their public key — no passphrase, no
  key-loss failure mode.
- If not, fall back to the existing passphrase (AES-GCM + PBKDF2) scheme.

Spam and unbounded reverse-index growth are fixed independently of consent, not via
registration gating: dedup entries per `(owner, beneficiary)` pair, support removal from the
index on claim/close (swap-and-pop), and raise the minimum deposit well above 1 wei.

This settles Batch 1 item 1 and Security Review Findings 3–4. Contract hardening (Batch 2)
can proceed.

## Conventions

- The UI aesthetic is an heirloom letter with a wax seal: parchment tones, sealing-wax red,
  serif display type. Keep new UI consistent with it — no default-looking form controls, and
  no browser `prompt()` dialogs.
- The letter is currently plaintext on-chain and world-readable via `getVault`. The "sealed"
  blur is cosmetic only. Encrypted payloads are prefixed `enc:v1:` so legacy plaintext vaults
  still render.
- Frontend must tolerate malformed vaults: wrap per-vault `getVault` calls in try/catch so
  one bad entry cannot break the claim list.
- Chain ID, RPC, explorer, and contract address should be config values, not hardcoded, so
  one build can target 968 or 677. Always show the active network in the UI.

## Design-skill constraints (ui-ux-pro-max)

`.claude/skills/ui-ux-pro-max` is available and may be used for UI work on this project, but
scoped narrowly — this is a single-file vanilla-JS desktop-web dApp with an already-decided,
locked aesthetic, not a greenfield product open to a design-system search.

**Use it for:** the stack-agnostic quality checklist — accessibility (§1: contrast, focus
rings, aria-labels, keyboard nav), touch/interaction sizing, forms & feedback, and the
pre-delivery checklist. These apply regardless of visual style and are genuinely useful for
`frontend/index.html`.

**Do not use it for:** `--design-system`, `--domain style`, `--domain color`, or
`--domain typography` searches. The aesthetic is already decided (see Conventions above:
heirloom letter, wax seal, parchment, sealing-wax red, serif display type) — do not let the
skill suggest or drift the product toward a different style, palette, or font pairing.

**Does not apply here (App/mobile-scoped):** safe-area insets, haptics, bottom navigation,
Dynamic Type, React Native/SwiftUI/Flutter stack guidance, and any other section the skill
itself scopes to native App UI. This is a browser page with MetaMask, not a mobile app —
skip those sections entirely rather than adapting them.

**Icons stay as decided:** no emoji icons (already a house rule — no browser `prompt()`
dialogs either), but also no default icon-library swap-in (Phosphor/Heroicons) without
confirming it fits the wax-seal aesthetic first. The existing wax seal is a hand-built SVG
(`sealSVG()` in `frontend/index.html`), not an icon-font glyph — keep it that way.

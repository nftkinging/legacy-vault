# Slither triage — LegacyVault.sol

Run: `slither contracts/LegacyVault.sol --exclude-dependencies`, solc 0.8.20.
Current result: **26 findings, all dismissed** (reasoning below). None indicate a real defect.

One finding category was fixed rather than dismissed during Batch 3 and no longer appears:
**reentrancy-events** (3 instances — `withdraw`, `closeVault`, `claim` each emitted their event
*after* the external `call{value:}`). Fixed by moving each `emit` before its call; state was
already updated first in all three (correct checks-effects-interactions), so this only reorders
the event for off-chain indexers.

Correction: an earlier summary in this project claimed pinning `pragma solidity 0.8.20` (from
`^0.8.20`) fixed the `solc-version` finding. That was wrong — Slither flags known bugs in the
compiler version itself, not the pragma's range flexibility, so the finding still fires under
the exact pin too (see below). It was a dismissal, not a fix, from the start.

## Dismissed findings, one line each

**uninitialized-state** (1)
- `ownersForBeneficiary` (LegacyVault.sol#47) "never initialized" — false positive; Solidity mappings are implicitly zero-initialized by the EVM, there is nothing to initialize.

**timestamp** — "dangerous comparisons" (6)
- `createVault` (#106-125): flagged for `require(!vaults[msg.sender].exists, ...)` (#107) — doesn't reference `block.timestamp` at all; Slither flags the whole function because it also sets `lastCheckIn = block.timestamp` elsewhere.
- `updateBeneficiary` (#157-168): flagged for `require(_newBeneficiary != v.beneficiary, ...)` (#161) — same pattern, unrelated require in a function that separately touches `block.timestamp`.
- `withdraw` (#176-186): flagged for `require(_amount > 0 && _amount <= v.balance, ...)` (#178) — same pattern.
- `claim` (#210-226): flagged for `v.exists`/`msg.sender == v.beneficiary`/`block.timestamp > v.lastCheckIn + v.checkInInterval` (#212-214) — the last one is the one real timestamp dependency in the contract (the claim deadline). Accepted tradeoff, already documented as Security Review Finding 6: validators have negligible influence over `block.timestamp` at day-scale intervals (`MIN_INTERVAL = 1 days`).
- `getVault` (#245-263): flagged for `v.exists` (#254) and the `claimable` computation (#255-262) — the latter is the same accepted deadline-comparison as `claim`, just recomputed for a view.
- `timeUntilClaimable` (#266-272): flagged for `v.exists` (#268) and `block.timestamp >= deadline` (#270) — same accepted deadline comparison, view-only.

**solc-version** (1)
- Compiler 0.8.20 has three known issues on record (`VerbatimInvalidDeduplication`, `FullInlinerNonExpressionSplitArgumentEvaluationOrder`, `MissingSideEffectsOnSelectorAccess`) — none apply: this contract uses no inline/verbatim assembly and no selector-access patterns the third bug describes. Dismissed as inapplicable rather than upgraded, to keep the compiler version stable through the audit.

**low-level-calls** (3)
- `withdraw` (#184), `closeVault` (#200), `claim` (#223) — each is `call{value:}` with a checked `require(ok, ...)`. Intentional: CLAUDE.md mandates this exact pattern over `.transfer()`/`.send()` so payouts aren't broken by a beneficiary/owner that's a contract with a costlier receive/fallback.

**naming-convention** (15)
- Every `_leadingUnderscore` parameter across `createVault`, `updateMessage`, `updateBeneficiary`, `withdraw`, `claim`, `registerAsBeneficiary`, `getVault`, `timeUntilClaimable`, `vaultsLeftFor`, `beneficiaryKeyCount`, `currentBeneficiaryKey` (x2), `beneficiaryKeyAt` (x2) — pre-existing repo convention (leading underscore marks a function parameter, distinct from state/local variables), not a defect. Style-only.

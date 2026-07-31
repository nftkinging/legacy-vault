# LegacyVault.sol — Pre-Mainnet Security Review

**Contract:** `LegacyVault.sol`, Solidity `^0.8.20`
**Currently deployed:** BOT Chain testnet (chain 968), `0x688C6810e0aa07e26941cEaC1972c7d3Be8820c9`
**Reviewed:** ahead of mainnet deployment
**Reviewer:** informal review — **not a substitute for a professional audit**

---

## Summary

The contract is soundly written in the areas most commonly gotten wrong. Reentrancy
protection is correct, external calls use the recommended pattern, and access control
on owner-only functions is properly enforced.

The problems are not in the arithmetic or the call patterns — they are in **lifecycle
management** (what happens to a vault after it is created) and in **the assumption that
being named a beneficiary is harmless**. Both become serious once real funds and real
users are involved.

| # | Finding | Severity |
|---|---------|----------|
| 1 | Beneficiary can never be changed; vault can never be closed | **Critical** |
| 2 | Unbounded `checkInInterval` bricks reads via overflow | **High** |
| 3 | Anyone can push arbitrary vaults + text at any address | **High** |
| 4 | Letter is world-readable plaintext | **High** |
| 5 | Claimed vault stays permanently claimable | **Medium** |
| 6 | 60-second minimum interval is unsafe in production | **Medium** |
| 7 | No message length cap | **Low** |
| 8 | Owner can always front-run a legitimate claim | **Informational** |
| 9 | Beneficiary relationships and balances are fully public | **Informational** |

---

## 1. Beneficiary can never be changed; vault can never be closed — **Critical**

There is no `updateBeneficiary()`, no `closeVault()`, and no `deleteVault()`. Combined
with:

```solidity
require(!vaults[msg.sender].exists, "Vault already exists");
```

...and the fact that `exists` is **never set back to `false` anywhere in the contract**,
an address gets exactly one vault, with one beneficiary, permanently.

**Consequences:**

- If a relationship changes — divorce, estrangement, death of the beneficiary — the owner
  **cannot re-point the vault**. Their only recourse is to withdraw the balance and abandon
  the address entirely.
- If the beneficiary loses their key, the vault is permanently pointed at an unreachable
  address.
- Withdrawing the full balance does **not** free the owner: `exists` stays `true`, so
  `createVault` still reverts. The owner is locked out of the product from that address forever.

For a product whose entire premise is long-horizon estate planning — where circumstances
*will* change over years or decades — this is the most serious issue in the contract.

**Remediation.** Add lifecycle functions, and make sure both maintain the reverse index:

```solidity
function updateBeneficiary(address _newBeneficiary) external onlyVaultOwner {
    require(_newBeneficiary != address(0), "Beneficiary required");
    require(_newBeneficiary != msg.sender, "Beneficiary must be someone else");
    Vault storage v = vaults[msg.sender];
    _unlink(v.beneficiary, msg.sender);   // remove from old beneficiary's index
    v.beneficiary = _newBeneficiary;
    _link(_newBeneficiary, msg.sender);   // add to new beneficiary's index
    v.lastCheckIn = block.timestamp;      // counts as proof of life
    emit BeneficiaryUpdated(msg.sender, _newBeneficiary);
}

function closeVault() external onlyVaultOwner {
    Vault storage v = vaults[msg.sender];
    uint256 amount = v.balance;
    address beneficiary = v.beneficiary;
    delete vaults[msg.sender];            // clears `exists`, frees the address
    _unlink(beneficiary, msg.sender);
    if (amount > 0) {
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "Transfer failed");
    }
    emit VaultClosed(msg.sender, amount);
}
```

Note `delete` happens **before** the external call, preserving checks-effects-interactions.

---

## 2. Unbounded `checkInInterval` bricks reads via overflow — **High**

`createVault` enforces a floor but no ceiling:

```solidity
require(_checkInInterval >= 60, "Interval must be at least 60s");
```

Three functions compute `v.lastCheckIn + v.checkInInterval`:

- `claim()`
- `getVault()`
- `timeUntilClaimable()`

With `_checkInInterval = type(uint256).max`, that addition **overflows and panics**
(Solidity 0.8 reverts on overflow). Any interval greater than
`type(uint256).max - block.timestamp` triggers it.

**Exploit path.** An attacker creates a vault for 1 wei naming a victim as beneficiary,
with a maximal interval. The victim opens "Letters addressed to you"; the frontend calls
`vaultsLeftFor`, gets the attacker's address, then calls `getVault` on it — which reverts
with a panic. **The victim's claim page breaks**, potentially hiding a legitimate vault
they need to claim. This is a denial-of-service on the most important flow in the product.

An owner can also brick their own vault's reads by accident with an absurd interval.

**Remediation.** Cap the interval. This eliminates the overflow entirely:

```solidity
uint256 public constant MIN_INTERVAL = 1 days;
uint256 public constant MAX_INTERVAL = 3650 days; // ~10 years

require(
    _checkInInterval >= MIN_INTERVAL && _checkInInterval <= MAX_INTERVAL,
    "Interval out of range"
);
```

Additionally, make the frontend resilient: wrap each per-vault `getVault` call in
try/catch so one malformed vault cannot break the whole list.

---

## 3. Anyone can push arbitrary vaults and text at any address — **High**

```solidity
ownersForBeneficiary[_beneficiary].push(msg.sender);
```

Being named a beneficiary requires **no consent**. Combined with `require(msg.value > 0)`
— satisfiable with 1 wei — and an arbitrary `_message` string, this gives two problems:

**Griefing / unbounded growth.** Entries are pushed on creation and **never removed** — not
on claim, not on full withdrawal. A victim's list grows monotonically. Each junk entry costs
the attacker one fresh address plus gas, but forces the victim's frontend into an
additional RPC round-trip per entry, degrading the claim page toward unusability.

**Abuse vector.** `message` is arbitrary attacker-controlled text that renders in the
victim's "Letters addressed to you" view. Anyone can push harassing or illegal content into
any user's inbox, permanently and immutably. For a consumer product this is a serious
moderation and liability exposure, and it cannot be undone once on-chain.

**Remediation — recommended: make beneficiaries opt in.** Require an address to register
before it can be named:

```solidity
mapping(address => bytes) public beneficiaryPubKey; // empty = not registered

function registerAsBeneficiary(bytes calldata encryptionPubKey) external {
    require(encryptionPubKey.length > 0, "Key required");
    beneficiaryPubKey[msg.sender] = encryptionPubKey;
    emit BeneficiaryRegistered(msg.sender);
}

// in createVault / updateBeneficiary:
require(beneficiaryPubKey[_beneficiary].length > 0, "Beneficiary not registered");
```

This single change solves **three** problems at once: it kills the spam vector, it bounds
the reverse index to consenting parties, and it provides the public key needed to fix
Finding 4 — see below.

The tradeoff is real: the beneficiary must act before the vault is sealed, which adds a
coordination step and means they cannot be entirely passive. Decide this deliberately
before mainnet, because it is expensive to change afterwards.

If you prefer to keep beneficiaries passive, at minimum: deduplicate and support removal
from the index (swap-and-pop with a position mapping), and raise the minimum deposit well
above 1 wei to make spam costly.

---

## 4. Letter is world-readable plaintext — **High** — **Partially addressed**

**Status:** the passphrase-derived path (AES-GCM + PBKDF2, `enc:v1:` prefix) shipped in the
frontend before Batch 2. The contract now supports the registered-key path too
(`registerAsBeneficiary`, versioned so rotation doesn't brick old letters), but **no frontend
exists yet to use it** — Batch 4 work. Until then every vault still encrypts to the passphrase
fallback regardless of whether the beneficiary has registered, and the ciphertext format has
no way to record which key version it targeted (needed once the registered-key path is wired
up, so decryption can fetch the right historical key via `beneficiaryKeyAt`). Do not consider
this finding closed until Batch 4 ships both.

`getVault` returns `message` to **any caller, regardless of `claimable`**:

```solidity
function getVault(address _owner) external view returns (..., string memory message, bool claimable)
```

The frontend's blur is cosmetic. Anyone can read any user's final letter directly from the
explorer, immediately, forever. On testnet this was a demo caveat; on mainnet it means every
user's private message to a loved one is permanently public. This is a privacy failure at
the heart of the product's promise.

**Remediation — encrypt client-side.** No contract change is strictly required (store
ciphertext in the same string field), but the *key management* design matters enormously:

- **Passphrase-derived key (AES-GCM + PBKDF2).** Simple, but structurally flawed for this
  product: the owner must transmit the passphrase out-of-band *before* going silent. If they
  never did, or the beneficiary lost it, the letter is unreadable forever — a failure in
  exactly the scenario the product exists for.
- **Beneficiary-registered key (recommended).** The beneficiary signs a fixed message once,
  derives a keypair deterministically from that signature, and registers the public key
  on-chain (see Finding 3). The owner encrypts to that public key. At claim time the
  beneficiary re-signs, re-derives, and decrypts. Nothing to lose, nothing that depends on
  the owner still being reachable.

Supporting both — registered key when available, passphrase as fallback — is reasonable.

Note: ciphertext is roughly 33% larger than plaintext after base64, which interacts with
Finding 7.

---

## 5. Claimed vault stays permanently claimable — **Medium**

`claim()` zeroes the balance but leaves `exists`, `beneficiary`, and `lastCheckIn` untouched:

```solidity
v.balance = 0;
```

The vault remains in state, permanently past its deadline. Any subsequent deposit by the
owner resets `lastCheckIn`, so funds are not instantly re-claimable — but the vault is never
cleanly retired, `getVault` continues to report a stale claimable vault indefinitely, and
combined with Finding 1 the owner still cannot start fresh.

**Remediation.** Clear the vault on claim, before the transfer:

```solidity
uint256 amount = v.balance;
address beneficiary = v.beneficiary;
delete vaults[_owner];
_unlink(beneficiary, _owner);
(bool ok, ) = msg.sender.call{value: amount}("");
require(ok, "Transfer failed");
```

Also reconsider `require(amount > 0, "Nothing to claim")`: if the owner withdrew everything
and then went silent, the beneficiary cannot invoke `claim` at all. Once the letter is
encrypted and gated on claim, this would block them from ever reading it. Consider allowing
a zero-balance claim that still settles the vault.

---

## 6. 60-second minimum interval is unsafe in production — **Medium**

`MIN_INTERVAL = 60` was chosen so live demos work, and the README says so explicitly. On
mainnet this is dangerous: validators have limited influence over `block.timestamp`, which is
irrelevant at month-scale intervals but meaningful at sixty seconds. More importantly, a
user who misconfigures a short interval can have real funds transferred away after a single
missed check-in.

**Remediation.** Raise the floor to at least `1 days` for production (see Finding 2's snippet).
Keep a separate testnet deployment with the low minimum for demos.

---

## 7. No message length cap — **Low**

`_message` is unbounded `calldata`. A very long letter makes `createVault` and
`updateMessage` arbitrarily expensive — self-limiting, since the caller pays — but it also
inflates the `getVault` return payload for every reader. With encryption adding ~33%
overhead, add an explicit cap:

```solidity
require(bytes(_message).length <= 4096, "Message too long");
```

---

## 8. Owner can always front-run a legitimate claim — **Informational**

Because `withdraw` is available at any time and resets the timer, an owner watching the
mempool can always drain the vault ahead of a beneficiary's `claim` transaction. This
follows directly from the "your money is never trapped" guarantee and is arguably correct —
a live owner *should* be able to intervene. It is worth stating plainly in user-facing docs
so beneficiaries understand the guarantee they do and do not have.

---

## 9. Beneficiary relationships and balances are fully public — **Informational**

`vaultsLeftFor`, `getVault`, and all events expose who has named whom, and how much is
locked. Anyone can enumerate inheritance relationships and amounts. Encryption (Finding 4)
protects the letter's *contents* but not the *metadata*. Users planning estates may
reasonably expect that relationship itself to be private. Worth disclosing explicitly, and
worth considering whether beneficiary addresses should be committed as hashes.

---

## Pre-mainnet checklist

- [ ] Fix Findings 1–4 (all mainnet blockers)
- [ ] Decide the key-management architecture (passphrase vs. registered key) — **this shapes the contract, decide before deploying**
- [ ] Decide upgradeability deliberately: immutable is more trustworthy but unfixable; a proxy plus timelock is fixable but adds trust assumptions and its own attack surface
- [ ] Write tests covering: claim before interval reverts; non-beneficiary claim reverts; reentrancy on both payout paths; full-withdraw-then-claim; interval boundary conditions; index integrity after close/claim/beneficiary change
- [ ] Run static analysis (Slither, Aderyn) and a fuzzing pass (Echidna or Foundry invariant tests) on the accounting invariant: sum of all vault balances equals `address(this).balance`
- [ ] Commission a professional audit — ask BOT Chain whether they fund or refer one
- [ ] Extended public testnet period with a bug bounty before mainnet
- [ ] Deploy from a fresh hardware-wallet key, never a `.env` private key
- [ ] Verify source on the explorer so users can read what they are trusting
- [ ] Confirm mainnet RPC and chain ID from BOT Chain's official documentation

---

*This review reflects a careful reading of the contract as supplied. It is not a
professional audit and carries no warranty. For a contract intended to custody real
inheritance funds, an independent audit by a specialist firm is strongly recommended.*

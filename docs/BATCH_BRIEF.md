# Legacy Vault — Batch Execution Brief

Read `CLAUDE.md` and `docs/LegacyVault_Security_Review.md` and
`docs/LegacyVault_Mainnet_Plan.md` before starting.

This brief authorises you to work through Batch 2 onward with minimal check-ins. Work
autonomously within a batch. Stop at the gates marked **HARD STOP**.

---

## Working rules

1. **Never deploy, broadcast a transaction, or spend gas.** Not on mainnet, not on testnet.
   Prepare the command, explain it, and hand it to me to run.
2. **Never write a private key to a file.** Never read or echo `.env` contents.
3. **One branch per batch** (`batch-2-contract-hardening`, etc.). Commit in logical units with
   clear messages. Do not merge to `main` without asking.
4. **At the end of each batch**, post a summary: what changed, what the exit criterion was,
   whether it is met, and anything you deferred or disagreed with. Then wait for my go-ahead
   before starting the next batch.
5. **If you hit an ambiguous design decision**, state the options and your recommendation with
   reasoning, then ask. Do not silently pick and move on.
6. **Push back on me.** If something in this brief is wrong, unsafe, or contradicted by the
   code, say so rather than implementing it.

---

## Decide before writing any contract code

Ask me these two, present options and a recommendation, then wait:

**A. Upgradeability.** Immutable contract vs. proxy plus timelock. This changes the contract
structure (constructor vs. initializer, storage layout constraints), so it cannot be deferred.
Immutable is more trustworthy and unfixable; a proxy is fixable but introduces an admin key
and its own attack surface. State the tradeoff for a contract custodying inheritance funds.

**B. Minimum and maximum check-in interval.** Current minimum is 60 seconds, chosen for demos
and unsafe in production. Propose production values (suggested floor `1 days`, ceiling
`3650 days`) and confirm with me.

---

## Batch 2 — Contract hardening

Fix every finding in `docs/LegacyVault_Security_Review.md`. Specifically:

### Required changes

1. **Vault lifecycle (Critical).** Add `updateBeneficiary(address)` and `closeVault()`.
   `exists` must become clearable so an owner is never permanently locked to one beneficiary
   or locked out of creating a new vault. Both must maintain the reverse index.
2. **Bound the interval (High).** Add `MIN_INTERVAL` / `MAX_INTERVAL` constants and enforce
   both. This eliminates the `lastCheckIn + checkInInterval` overflow that currently lets
   anyone brick a victim's claim page with a maximal interval.
3. **Settle vaults on claim (Medium).** `delete vaults[_owner]` and unlink the reverse index
   *before* the transfer. Reconsider `require(amount > 0)` so a zero-balance vault can still
   be settled — otherwise a beneficiary can be permanently blocked from claiming (and, once
   the letter is encrypted, from reading it) if the owner withdrew everything first.
4. **Cap message length (Low).** Bound `_message`, allowing ~33% overhead for base64
   ciphertext.
5. **Index maintenance.** Internal `_link` / `_unlink` pair using swap-and-pop with a position
   mapping, used consistently by create, close, claim, and beneficiary change.
6. **Events.** Add `BeneficiaryUpdated`, `VaultClosed`, `BeneficiaryRegistered`.

### The beneficiary model — DECIDED: hybrid

Passive naming stays the default; `registerAsBeneficiary(bytes pubKey)` is an optional
upgrade path to real public-key encryption. Registered beneficiaries get public-key
encryption; unregistered ones fall back to passphrase-based AES-GCM.

Three seams in this design must be handled explicitly, not left implicit:

- **Anti-spam.** Deduplicating `(owner, beneficiary)` pairs does almost nothing on its own:
  `createVault` already enforces one vault per owner, so a spammer using N distinct addresses
  produces N unique pairs and dedup never fires. Dedup only earns its keep once
  `updateBeneficiary` exists (A→B→A flip-flopping). **The real lever is the minimum deposit** —
  propose a concrete value and justify it. Note in your summary that the harassment vector
  (arbitrary attacker-controlled text in a stranger's inbox, permanent and immutable) survives
  at the contract layer and must be mitigated in the UI during Batch 4.
- **Late registration.** If a beneficiary registers *after* a vault naming them was sealed,
  that letter is still passphrase-encrypted. The contract should expose enough state for the
  frontend to detect this so it can prompt the owner to re-encrypt via `updateMessage`.
- **Key rotation.** If a registered beneficiary re-registers with a new key, every letter
  encrypted to the old key becomes undecryptable. Decide and implement one of: keys immutable
  once set; keys versioned (store an array, letters record which version they used); or
  rotation allowed with an explicit on-chain warning flag. Recommend one and ask me.

### Constraints

- Preserve checks-effects-interactions everywhere. All state changes, including `delete`,
  happen before any external call.
- Payouts use `call{value:}` with a checked return. Never `.transfer()`.
- Assume every function is attacker-reachable. For each new function, state in comments who
  can call it and what a hostile caller achieves.

**Exit criterion:** compiles clean; every review finding either fixed or explicitly accepted
in writing with a rationale.

---

## Batch 3 — Testing and analysis

1. **Hardhat test suite** covering at minimum:
   - claim before the interval elapses reverts
   - claim by a non-beneficiary reverts
   - claim succeeds at the boundary, not before
   - reentrancy attempts on both `withdraw` and `claim` via a malicious receiver contract
   - full withdrawal, then claim
   - `closeVault` frees the address for a new vault
   - `updateBeneficiary` leaves both old and new reverse indexes correct
   - interval boundary conditions at `MIN_INTERVAL` and `MAX_INTERVAL`
   - index integrity after mixed sequences of create / close / claim / change
   - beneficiary registration, late registration, and key rotation paths
2. **Static analysis:** run Slither and Aderyn. Triage every finding; document dismissals with
   reasoning.
3. **Invariant / fuzz testing:** Foundry invariant tests or Echidna on the core invariant —
   *the sum of all vault balances always equals `address(this).balance`*.
4. **Gas profiling** for `createVault` and `claim` with a maximum-length encrypted message.

**Exit criterion:** full suite green, static analysis triaged, invariant holds under fuzzing.

---

## Batch 4 — HARD STOP

**Do not begin frontend or UI work.** I have visual references and direction to provide
before this batch starts.

When Batches 2 and 3 are complete, post your summary and stop. Wait for me to return with
design references.

### Carry-forward requirements — do not lose these at the stop

Record these now so they survive into Batch 4. They are mitigations for problems the contract
cannot solve on its own:

1. **Warn loudly when naming an unregistered beneficiary.** The passphrase fallback is the
   default path and it is structurally flawed: the owner must deliver the passphrase to the
   beneficiary *before* going silent, which is precisely when the owner may be unreachable.
   If they never did, the letter is unreadable forever. The UI must make this a prominent,
   hard-to-miss warning at vault creation — not a quiet footnote — with a one-click way to
   send the beneficiary a registration link. Treat "beneficiary is registered" as the
   encouraged path and passphrase as the explicit fallback.
2. **Prompt to re-encrypt after late registration.** When a beneficiary registers after a
   vault naming them was sealed, detect it and prompt the owner to re-encrypt the letter to
   the new public key via `updateMessage`.
3. **Mitigate inbox harassment client-side.** Anyone can permanently write arbitrary text into
   a stranger's inbox and the contract cannot prevent it. The claim view needs filtering or
   collapsing of low-value vaults and a client-side way to hide senders.
4. **Disclose the metadata leak.** Beneficiary relationships and balances are public on-chain
   even when letters are encrypted. Say so plainly in the UI.
5. **Compress the plaintext before encrypting it — never the reverse.** (Batch 2.5.) Ciphertext
   is high-entropy and does not compress; compressing first and encrypting second gets a real
   size reduction, compressing after encrypting gets nothing. Since `message` now stores raw
   ciphertext bytes directly (no base64 — see Batch 2.5), the pipeline is: compress plaintext
   -> encrypt the compressed bytes -> write ciphertext bytes to `message`. Decryption on the
   claim side reverses it: decrypt -> decompress -> plaintext. Get the order right; this is a
   real functional bug (an undecryptable or garbled letter) if it's flipped, not just wasted
   effort.

---

## Batches 5–9 — after the UI batch

Do not start these until Batch 4 is complete and I confirm. Full detail is in
`docs/LegacyVault_Mainnet_Plan.md`; summary:

- **Batch 5 — Testnet rehearsal.** Deploy hardened contract to chain 968, verify source on
  `scan.bohr.life`, full multi-account walkthrough, adversarial pass re-running every attack
  from the security review, outside testers including a non-technical beneficiary persona.
- **Batch 6 — External review.** Freeze codebase. Professional audit, remediation, re-review.
  Public testnet period with bug bounty. Any material change restarts Batch 3.
- **Batch 7 — Infrastructure.** Vercel deploy (framework preset "Other", no build command,
  root directory `frontend` if applicable). Branch previews. Redirect the old GitHub Pages URL
  rather than deleting it.
- **Batch 8 — Mainnet deployment.** Chain 677, `https://rpc.botchain.ai`, explorer
  `https://scan.botchain.ai`. Verify source immediately. Prepare every command for me to run;
  deploy nothing yourself.
- **Batch 9 — Post-launch.** Event monitoring, public docs including risk disclosures, audit
  report publication, open bug bounty.

---

## Human-owned tasks — do not block on these

I am handling these in parallel; note them if relevant but do not wait:

- Acquiring mainnet BOT (bridge → DEX swap; there is no mainnet faucet)
- Generating and funding the hardware-wallet deployer key
- Audit arrangements with BOT Chain
- Legal review of the inheritance/succession angle

---

## Start here

Ask me the two decisions under "Decide before writing any contract code", then begin Batch 2.

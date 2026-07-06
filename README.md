# Legacy Vault

**A letter — and what you leave with it — that opens only if you stop answering.**

Legacy Vault is a dead man's switch on BOT Chain. You lock BOT and a final
message for a beneficiary, then keep proving you're alive with periodic
check-ins. If you ever go silent past your chosen interval, the vault unlocks:
your beneficiary can read the letter and claim what you left behind. If you
keep answering, nothing ever happens.

**The real-life problem:** an estimated billions in crypto is permanently lost
because holders die or lose access without any succession plan. Wills don't
work for self-custodied keys; custodians defeat the point. Legacy Vault is
trustless inheritance in ~150 lines of Solidity — no executor, no custodian,
no legal system required.

- `contracts/LegacyVault.sol` — the smart contract
- `frontend/index.html` — single-file dApp (heirloom-letter UI, wallet connect, create / check-in / claim flows)

## How it works

1. **Seal a vault** — pick a beneficiary, lock some BOT, choose how much
   silence is allowed (minutes for demos, months in real life), and write the letter.
2. **Keep answering** — press "I'm still here" any time to reset the timer.
   Deposits, withdrawals, and message edits also count as proof of life.
3. **If you go silent** — once the interval passes with no check-in, the wax
   seal cracks: the beneficiary can read the letter and claim the funds.
   Until then, the letter stays sealed in the UI and the claim reverts on-chain.

Your money is never trapped: the owner can withdraw everything at any time.

## 1. Deploy the contract — VS Code + Hardhat (~15 min)

**Prerequisites:** Node.js 18+ (`node -v` to check), VS Code, MetaMask with the
BOT Chain testnet added and some testnet BOT from https://faucet.botchain.ai/basic

MetaMask network settings:
- Network name: `BOT Chain Testnet`
- RPC URL: `https://rpc.bohr.life`
- Chain ID: `968`
- Currency symbol: `BOT`
- Explorer: `https://scan.bohr.life/`

Then, in the VS Code terminal from this project folder:

```bash
# 1. Install dependencies (hardhat, toolbox, dotenv — already in package.json)
npm install

# 2. Create your .env with your private key
cp .env.example .env
# then open .env and paste your MetaMask private key
# (MetaMask → account menu → Account details → Show private key)
# Use a TESTNET-ONLY account. .env is gitignored — never commit it.

# 3. Compile
npx hardhat compile

# 4. Deploy to BOT Chain testnet
npx hardhat run scripts/deploy.js --network botchainTestnet
```

The deploy script prints your **contract address**, **deployment tx hash**, and
explorer link — save all three for the submission form.

<details>
<summary>Alternative: deploy via Remix (no local setup)</summary>

Go to https://remix.ethereum.org, paste `contracts/LegacyVault.sol` into a new
file, compile with 0.8.20+, then in Deploy & Run choose **Injected Provider -
MetaMask** (on BOT Chain Testnet) and click Deploy.
</details>

## 2. Wire up the frontend (1 min)

In `frontend/index.html`, replace:
```js
const CONTRACT_ADDRESS = "0xYOUR_DEPLOYED_CONTRACT_ADDRESS";
```
with your deployed address. Open the file in a browser to test.

## 3. Host it — GitHub Pages (5 min)

```bash
cd legacy-vault
git init && git add . && git commit -m "Legacy Vault — BotChain Builder Challenge #1"
git branch -M main
git remote add origin https://github.com/<you>/legacy-vault.git
git push -u origin main
```
Repo → Settings → Pages → Deploy from branch → `main`. If Pages serves from the
repo root, move `frontend/index.html` to the root first. Live URL:
`https://<you>.github.io/legacy-vault/`

## 4. Demo it end-to-end (the judges will love this part)

Use **two accounts** in MetaMask (Account A = owner, Account B = beneficiary):

1. As A: seal a vault naming B, lock 0.01 BOT, set silence to **2 minutes**, write a letter.
2. Show the intact wax seal and the live countdown. Press "I'm still here" once — timer resets.
3. Stop checking in. After 2 minutes the seal cracks.
4. Switch to B → "Claim a legacy" → "Find vaults naming me" → the letter is now
   readable → **Break the seal & claim** → B receives the BOT.

Every step above is a real on-chain transaction — collect the tx hashes.

## 5. Post to X

Example (public, tagging @BOTChain_ai):

> Billions in crypto dies with its owners. I built Legacy Vault on @BOTChain_ai — a dead man's switch: lock BOT + a final letter for someone, keep checking in, and if you ever go silent, they inherit it. No custodian, no executor. Live demo + contract below. #BOTChain

## 6. Submission form answers

| Field | Value |
|---|---|
| Project Name | Legacy Vault |
| Track | EVM Deployment (also fits DePIN / Real World Application — pick whichever you prefer; Real World Application arguably fits better and may be less crowded) |
| Project Summary | A trustless dead man's switch on BOT Chain. Users lock BOT plus a final letter for a beneficiary and periodically check in as proof of life; if they go silent past their chosen interval, the beneficiary can read the letter and claim the funds. Solves crypto's inheritance problem — billions are lost forever when holders die without a succession plan — with no custodian, executor, or legal process. |
| GitHub Repo or Live Demo URL | your GitHub Pages URL and/or repo URL |
| Contract Address or Transaction Hash | your deployed contract address |
| X Post URL | your tweet link |
| BOT Chain Integration | Smart Contract Deployment, dApp Integration, Wallet |
| Technical Implementation | A single Solidity 0.8.20 contract stores one vault per owner: beneficiary, locked balance, check-in interval, last check-in timestamp, and the message. checkIn/deposit/withdraw/updateMessage all reset the proof-of-life timer; claim() enforces beneficiary identity and elapsed silence on-chain, zeroing balance before transfer to block reentrancy. A reverse index (vaultsLeftFor) lets beneficiaries discover vaults naming them without any off-chain indexer. The frontend is one static HTML page on ethers.js v6 — it auto-adds/switches MetaMask to BOT Chain (chain 968) and reads/writes the contract directly, no backend. The UI renders vault state as a wax seal that visibly cracks when the silence interval elapses, and keeps the letter blurred/"sealed" until it's claimable. |
| Roadmap / Next Steps | Client-side encryption of the letter (only the beneficiary's key can decrypt), multiple vaults and multiple beneficiaries with percentage splits, e-mail/push reminders before the deadline via a keeper, and support for ERC-20s and NFTs in the vault. |

## Notes

- Minimum check-in interval is 60 seconds — deliberately low so live demos work.
- The letter is stored in plaintext on-chain (anyone can technically read it via
  the contract); the "sealed" state is a UI ceremony. The roadmap item for
  client-side encryption is the honest fix, and saying so in the form shows
  you understand the limitation.
- Owner funds are never locked away from the owner — `withdraw` works any time.

// Jumps the local node's clock forward so a vault's silence interval can
// be triggered on demand instead of waiting on it for real. Only works
// against a node that supports evm_increaseTime/evm_mine (hardhat node
// does; a real chain never would, which is exactly why this needs local
// testing in the first place).
//
// Usage:
//   npx hardhat run scripts/jump-time.js --network localhost
//   DAYS=5 npx hardhat run scripts/jump-time.js --network localhost
//   OWNER=0xf39... npx hardhat run scripts/jump-time.js --network localhost
//
// `hardhat run` doesn't pass extra positional args through to the script,
// so both options are read from env vars instead.
//
// With OWNER set, this reads that address's actual vault from the deployed
// contract (config.local.js) and jumps exactly past ITS interval (+60s
// buffer) — the precise amount, not a guess. Without OWNER, DAYS is used
// as a flat jump (default 2), which only reliably clears vaults created
// with an interval of 2 days or less — a vault created with a longer
// interval needs a bigger DAYS value, or OWNER instead.
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function getOwnerIntervalSeconds(owner) {
  const configLocalPath = path.join(__dirname, "..", "config.local.js");
  if (!fs.existsSync(configLocalPath)) {
    throw new Error("config.local.js not found — run npm run local:deploy first.");
  }
  const match = fs.readFileSync(configLocalPath, "utf8").match(/contractAddress:\s*"(0x[0-9a-fA-F]+)"/);
  if (!match) throw new Error("Could not find contractAddress in config.local.js.");

  const LegacyVault = await hre.ethers.getContractFactory("LegacyVault");
  const vault = LegacyVault.attach(match[1]);
  const v = await vault.getVault(owner); // reverts with "No such vault" if there isn't one
  return Number(v.checkInInterval);
}

async function main() {
  const owner = process.env.OWNER;
  let seconds, describedAs;

  if (owner) {
    let interval;
    try {
      interval = await getOwnerIntervalSeconds(owner);
    } catch (err) {
      console.error(`\nCould not read a vault for ${owner}: ${err.reason || err.message}`);
      process.exitCode = 1;
      return;
    }
    seconds = interval + 60; // clears the deadline with a small margin, doesn't overshoot by much
    describedAs = `${owner}'s actual interval (${(interval / 86400).toFixed(interval % 86400 === 0 ? 0 : 4)} day(s) = ${interval}s) + 60s buffer`;
  } else {
    const days = Number(process.env.DAYS || 2);
    if (!Number.isFinite(days) || days <= 0) {
      console.error(`Invalid DAYS value: ${process.env.DAYS}`);
      process.exitCode = 1;
      return;
    }
    seconds = Math.round(days * 86400);
    describedAs = process.env.DAYS
      ? `${days} day(s) (DAYS=${process.env.DAYS})`
      : `${days} day(s) — DEFAULT, not tied to any vault's actual interval. This only clears vaults created with an interval of ${days} day(s) or less. ` +
        `Pass OWNER=0x... to jump exactly past a specific vault's real interval instead, or DAYS=N for a specific flat amount.`;
  }

  const before = await hre.ethers.provider.getBlock("latest");
  console.log("Before:", new Date(before.timestamp * 1000).toLocaleString());
  console.log("Jumping:", describedAs);

  await hre.network.provider.send("evm_increaseTime", [seconds]);
  await hre.network.provider.send("evm_mine", []);

  const after = await hre.ethers.provider.getBlock("latest");
  console.log(`Jumped ${seconds}s.`);
  console.log("After: ", new Date(after.timestamp * 1000).toLocaleString());
  console.log("\nRefresh the vault in the app — it should now show as claimable (or the seal should read cracked).");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

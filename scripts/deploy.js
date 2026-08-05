// ============================================================
// TESTNET deploy script — real money never involved, but this IS the
// script that publishes to BOT Chain Testnet (chain 968) and prints a
// scan.bohr.life link. For a local Hardhat node, use `npm run local:deploy`
// (scripts/deploy-local.js) instead — that one writes config.local.js and
// never touches this repo's committed config.js.
// ============================================================
const hre = require("hardhat");

async function main() {
  if (hre.network.name !== "botchainTestnet") {
    console.error(
      `\nscripts/deploy.js is the TESTNET deploy script — it only runs against --network botchainTestnet, ` +
      `not "${hre.network.name}".\n` +
      `For a local Hardhat node, run: npm run local:deploy (or npm run local:start)\n`
    );
    process.exitCode = 1;
    return;
  }

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "BOT");

  const LegacyVault = await hre.ethers.getContractFactory("LegacyVault");
  const vault = await LegacyVault.deploy();
  await vault.waitForDeployment();

  const address = await vault.getAddress();
  const tx = vault.deploymentTransaction();

  console.log("\n=== DEPLOYED ===");
  console.log("Contract address:", address);
  console.log("Deployment tx hash:", tx.hash);
  console.log("Explorer:", `https://scan.bohr.life/address/${address}`);
  console.log("\nNext steps:");
  console.log(`  1. Verify: npx hardhat verify --network botchainTestnet ${address}`);
  console.log("  2. Update config.js — TWO places need this same address:");
  console.log("       - top-level CONTRACT_ADDRESS");
  console.log("       - NETWORKS.testnet.contractAddress");
  console.log("     (NETWORKS.testnet.genesisHash does NOT change — that's the chain's, not the contract's.)");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

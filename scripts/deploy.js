const hre = require("hardhat");

async function main() {
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
  console.log("\nNext: paste the contract address into frontend/index.html (CONTRACT_ADDRESS).");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

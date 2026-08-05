require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    botchainTestnet: {
      url: "https://rpc.bohr.life",
      chainId: 968,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    // `npx hardhat node` (started for you by scripts/start-local-node.js).
    // No `accounts` needed — Hardhat's node exposes its own unlocked dev
    // accounts over JSON-RPC, so this just points at it. Explicit rather
    // than relying on Hardhat's built-in default "localhost" network so
    // the chain ID is pinned and visible here.
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
  },
  // scan.bohr.life is a Blockscout instance (confirmed: /api/v2/smart-contracts
  // responds), so this uses hardhat-verify's native `blockscout` config rather
  // than the Etherscan-shaped `etherscan` block — no API key needed, Blockscout
  // doesn't require one. `npx hardhat verify --network botchainTestnet <address>`
  // after deploying.
  // `verify` runs every enabled provider as its own subtask — etherscan is
  // enabled by default and would otherwise also run (and fail, since
  // botchainTestnet isn't an Etherscan-supported chain and isn't in its
  // customChains), muddying the output with an unrelated failure next to
  // the real result. Disabled explicitly so `verify` only does Blockscout.
  etherscan: {
    enabled: false,
  },
  blockscout: {
    enabled: true,
    customChains: [
      {
        network: "botchainTestnet",
        chainId: 968,
        urls: {
          apiURL: "https://scan.bohr.life/api",
          browserURL: "https://scan.bohr.life",
        },
      },
    ],
  },
};

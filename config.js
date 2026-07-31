// Shared network/contract config for index.html (landing) and app.html (the dApp).
// Single source of truth so switching 968 <-> 677 never means hunting through two files.
window.LEGACY_VAULT_CONFIG = {
  CONTRACT_ADDRESS: "0x688C6810e0aa07e26941cEaC1972c7d3Be8820c9",
  CHAIN_ID_HEX: "0x3C8", // 968
  NETWORK_NAME: "BOT Chain Testnet",
  NETWORK_PARAMS: {
    chainId: "0x3C8",
    chainName: "BOT Chain Testnet",
    nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 },
    rpcUrls: ["https://rpc.bohr.life"],
    blockExplorerUrls: ["https://scan.bohr.life/"]
  },
  EXPLORER_BASE: "https://scan.bohr.life/address/",
  AUDIT_REPORT_URL: "https://github.com/nftkinging/legacy-vault/blob/main/docs/LegacyVault_Security_Review.md"
};

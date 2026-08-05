// Shared network/contract config for index.html (landing) and app.html (the dApp).
// Single source of truth so switching 968 <-> 677 never means hunting through two files.
window.LEGACY_VAULT_CONFIG = {
  CONTRACT_ADDRESS: "0xA6D643FbDE7a2fd7D4D7e79075377ADd022F40b7",
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
  EXPLORER_TX_BASE: "https://scan.bohr.life/tx/",
  // The security review is an informal review, not a real audit — leave this
  // empty (hides the footer link) until there's an actual audit to point at.
  AUDIT_REPORT_URL: "",
  DOCS_URL: "", // fill in when docs are published; hidden in the footer until then
  X_URL: "",    // fill in once the account exists; hidden in the footer until then

  // WalletConnect (Reown AppKit). Project IDs are public config, not secrets —
  // they scope relayer/analytics usage and are meant to ship in frontend code.
  // Allowlisted domains (set in the Reown dashboard, not here): localhost:5500,
  // 127.0.0.1:5500, the GitHub Pages URL, legacy-vault-kappa.vercel.app.
  WALLETCONNECT_PROJECT_ID: "07c2dcbee0f32d81fdefbb78f74cb88b",
  APPKIT_METADATA: {
    name: "Legacy Vault",
    description: "A dead man's switch for BOT — lock funds and a letter for a beneficiary, checked in on your schedule.",
    url: "https://legacy-vault-kappa.vercel.app",
    icons: ["https://legacy-vault-kappa.vercel.app/favicon.png"]
  },

  // Both networks are always defined (not just the active one) so AppKit's
  // network switcher and wallet_addEthereumChain fallback both work no
  // matter which chain the dapp is currently pointed at.
  // genesisHash is block 0's hash on each chain (eth_getBlockByNumber("0x0")),
  // fetched directly from the RPCs below on 2026-07-31. Immutable and
  // chain-specific, unlike the numeric chain ID — testnet 968 collides in
  // the public chain registry with an unrelated chain (Datagram/DGRAM), so a
  // wallet can report chain ID 968 while actually connected to the wrong
  // network. Comparing eth_chainId alone would not catch that; comparing
  // genesis hash does. See docs/LegacyVault_Mainnet_Plan.md Batch 5 item 7.
  // contractAddress here (not just the top-level CONTRACT_ADDRESS above) is
  // what lets app.html pick the right contract for whichever chain the
  // connected wallet actually reports, instead of trusting whatever this
  // build's default happened to be. mainnet has none yet — a wallet
  // connected to 677 gets a loud "not deployed yet" warning rather than
  // silently being pointed at testnet's contract.
  NETWORKS: {
    testnet: {
      id: 968,
      chainIdHex: "0x3C8",
      caipNetworkId: "eip155:968",
      name: "BOT Chain Testnet",
      nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 },
      rpcUrls: ["https://rpc.bohr.life"],
      explorerUrl: "https://scan.bohr.life",
      genesisHash: "0x395bd3d6583216495648e8322032761c1a377eddf04f59de0c693c7d6682aee6",
      contractAddress: "0xA6D643FbDE7a2fd7D4D7e79075377ADd022F40b7",
      // 968 is registered to an unrelated project (Datagram/DGRAM) in public
      // chain-list registries — a wallet resolving wallet_addEthereumChain
      // against that registry can show "Datagram" as the network name
      // before the user approves. Empty string (see mainnet below) hides
      // this warning entirely — 677 is correctly registered to BOT Chain,
      // per docs/LegacyVault_Mainnet_Plan.md Batch 5 item 7.
      registryCollisionWarning: "Some wallets may show this network as “Datagram” when adding it — that’s a public registry mix-up for chain 968, not a wrong network. Just confirm the RPC reads rpc.bohr.life before approving."
    },
    mainnet: {
      id: 677,
      chainIdHex: "0x2A5",
      caipNetworkId: "eip155:677",
      name: "BOT Chain",
      nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 },
      rpcUrls: ["https://rpc.botchain.ai"],
      explorerUrl: "https://scan.botchain.ai",
      genesisHash: "0x161a4ff8b4c95e95b314899c4ea8f9782c4ae8851362ffe0d47c0b8a05f7b784",
      contractAddress: null,
      registryCollisionWarning: ""
    }
  }
};

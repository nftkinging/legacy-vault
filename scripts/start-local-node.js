// Waits for a `hardhat node` you've started yourself (see `npm run
// local:node`, or just `npx hardhat node` directly) to come up, then
// deploys LegacyVault to it via scripts/deploy-local.js.
//
// This used to also spawn+background the node itself. Dropped that: on
// Windows, backgrounding it via a detached shell-wrapped child process
// (needed for `npx` resolution) was unreliable — it would report a PID,
// answer RPC calls just long enough for the deploy step to succeed, and
// then die with nothing in its log, for reasons that didn't reproduce
// consistently enough to chase down. Rather than ship a wrapper that
// silently drops the node out from under you, run the node yourself where
// you can see it and this script just waits for it.
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const RPC_URL = "http://127.0.0.1:8545";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function isNodeUp() {
  try {
    const res = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
    });
    if (!res.ok) return false;
    const body = await res.json();
    return !!body.result;
  } catch {
    return false;
  }
}

async function waitForNode(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isNodeUp()) return true;
    await sleep(500);
  }
  return false;
}

async function main() {
  if (!(await isNodeUp())) {
    console.log(`No node answering at ${RPC_URL} yet.`);
    console.log("Start one in its own terminal first:");
    console.log("\n  npm run local:node\n");
    console.log("(or `npx hardhat node` directly) — leave that terminal open, then re-run this.");
    console.log("\nWaiting up to 30s in case it's starting up right now...");

    const ready = await waitForNode(30000);
    if (!ready) {
      console.error(`\nStill nothing at ${RPC_URL} after 30s. Start the node first, then re-run this.`);
      process.exitCode = 1;
      return;
    }
  }
  console.log("Node is up.");

  console.log("\nDeploying LegacyVault...");
  execSync("npx hardhat run scripts/deploy-local.js --network localhost", {
    cwd: ROOT,
    stdio: "inherit",
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

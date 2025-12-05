/**
 * Redeploy SimpleNFTEscrow only, keeping other contracts untouched.
 * Usage:
 *   npx hardhat run scripts/redeploy_simple_escrow.js --network localhost
 *
 * - Backs up existing artifacts/escrow_deployment.json (if any)
 * - Deploys SimpleNFTEscrow
 * - Writes new deployment + ABI to artifacts/
 * - Syncs ABI to frontend/src/abi/SimpleNFTEscrow.json
 * - Updates frontend/public/config.json SIMPLE_ESCROW_ADDRESS (if present)
 */
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const ARTIFACTS_DIR = path.join(__dirname, "..", "artifacts");
const FRONTEND_ABI = path.join(__dirname, "..", "..", "frontend", "src", "abi", "SimpleNFTEscrow.json");
const FRONTEND_CONFIG = path.join(__dirname, "..", "..", "frontend", "public", "config.json");
const ESCROW_ARTIFACT = path.join(ARTIFACTS_DIR, "escrow_deployment.json");
const INDEXER_ENV = path.join(__dirname, "..", "..", "scripts", "indexer.env");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("🔄 Redeploying SimpleNFTEscrow...");
  console.log("   Deployer:", deployer.address);
  console.log("   Network:", hre.network.name);

  // Backup existing deployment info if present
  if (fs.existsSync(ESCROW_ARTIFACT)) {
    const backup = `${ESCROW_ARTIFACT}.backup.${Date.now()}`;
    fs.copyFileSync(ESCROW_ARTIFACT, backup);
    console.log("   📦 Backed up previous escrow deployment ->", backup);
  }

  const Escrow = await hre.ethers.getContractFactory("SimpleNFTEscrow");
  const escrow = await Escrow.deploy();
  await escrow.waitForDeployment();

  const escrowAddress = await escrow.getAddress();
  console.log("   ✅ New SimpleNFTEscrow:", escrowAddress);

  const deployment = {
    address: escrowAddress,
    network: {
      chainId: (await hre.ethers.provider.getNetwork()).chainId.toString(),
      rpc: hre.network.config?.url || "unknown",
    },
    deployedAt: Date.now(),
  };

  // Persist artifacts
  const hardhatArtifact = await hre.artifacts.readArtifact("SimpleNFTEscrow");
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  fs.writeFileSync(ESCROW_ARTIFACT, JSON.stringify(deployment, null, 2));
  fs.writeFileSync(path.join(ARTIFACTS_DIR, "SimpleNFTEscrow.abi.json"), JSON.stringify(hardhatArtifact, null, 2));
  console.log("   📝 Saved artifacts/escrow_deployment.json and SimpleNFTEscrow.abi.json");

  // Sync ABI to frontend
  fs.mkdirSync(path.dirname(FRONTEND_ABI), { recursive: true });
  fs.writeFileSync(FRONTEND_ABI, JSON.stringify(hardhatArtifact, null, 2));
  console.log("   🔄 Synced ABI ->", FRONTEND_ABI);

  // Update frontend config SIMPLE_ESCROW_ADDRESS if file exists
  if (fs.existsSync(FRONTEND_CONFIG)) {
    try {
      const raw = fs.readFileSync(FRONTEND_CONFIG, "utf8");
      const json = JSON.parse(raw);
      const prev = json.SIMPLE_ESCROW_ADDRESS;
      json.SIMPLE_ESCROW_ADDRESS = escrowAddress;
      fs.writeFileSync(FRONTEND_CONFIG, JSON.stringify(json, null, 2));
      console.log("   🛠  Updated frontend/public/config.json SIMPLE_ESCROW_ADDRESS");
      if (prev) {
        console.log("      Previous:", prev);
      }
    } catch (error) {
      console.warn("   ⚠️  Failed to update frontend/public/config.json:", error.message);
    }
  } else {
    console.log("   ℹ️  frontend/public/config.json not found; skipped config update.");
  }

  // Update scripts/indexer.env SIMPLE_ESCROW_ADDRESS if present
  if (fs.existsSync(INDEXER_ENV)) {
    try {
      const raw = fs.readFileSync(INDEXER_ENV, "utf8");
      const lines = raw.split(/\r?\n/);
      let updated = false;
      const next = lines.map((line) => {
        if (line.startsWith("SIMPLE_ESCROW_ADDRESS=")) {
          updated = true;
          return `SIMPLE_ESCROW_ADDRESS=${escrowAddress}`;
        }
        return line;
      });
      if (!updated) {
        next.push(`SIMPLE_ESCROW_ADDRESS=${escrowAddress}`);
      }
      fs.writeFileSync(INDEXER_ENV, next.join("\n"));
      console.log("   🔄 Updated scripts/indexer.env SIMPLE_ESCROW_ADDRESS");
    } catch (error) {
      console.warn("   ⚠️  Failed to update scripts/indexer.env:", error.message);
    }
  } else {
    console.log("   ℹ️  scripts/indexer.env not found; skipped indexer update.");
  }

  console.log("\n🎉 SimpleNFTEscrow redeployment complete.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

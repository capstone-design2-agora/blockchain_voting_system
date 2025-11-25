const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("Deploying SimpleNFTEscrow with deployer:", deployer.address);

  const Escrow = await hre.ethers.getContractFactory("SimpleNFTEscrow");
  const escrow = await Escrow.deploy();
  await escrow.waitForDeployment();

  const escrowAddress = await escrow.getAddress();
  console.log("SimpleNFTEscrow deployed to:", escrowAddress);

  const deployment = {
    address: escrowAddress,
    network: {
      chainId: (await hre.ethers.provider.getNetwork()).chainId.toString(),
      rpc: hre.network.config?.url || "unknown",
    },
    deployedAt: Date.now(),
  };

  const artifactsDir = path.join(__dirname, "..", "artifacts");
  const hardhatArtifact = await hre.artifacts.readArtifact("SimpleNFTEscrow");
  if (!fs.existsSync(artifactsDir)) {
    fs.mkdirSync(artifactsDir, { recursive: true });
  }
  fs.writeFileSync(path.join(artifactsDir, "escrow_deployment.json"), JSON.stringify(deployment, null, 2));
  fs.writeFileSync(path.join(artifactsDir, "SimpleNFTEscrow.abi.json"), JSON.stringify(hardhatArtifact, null, 2));
  console.log("Saved escrow deployment + ABI to artifacts/ (escrow_deployment.json, SimpleNFTEscrow.abi.json)");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

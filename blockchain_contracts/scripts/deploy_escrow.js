#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log(`Deploying NFTEscrow with account: ${deployer.address}`);

  const NFTEscrow = await hre.ethers.getContractFactory("NFTEscrow");
  const escrow = await NFTEscrow.deploy();
  await escrow.waitForDeployment();

  const address = await escrow.getAddress();
  console.log(`NFTEscrow deployed to: ${address}`);

  const artifactPath = path.join(
    __dirname,
    "..",
    "hardhat",
    "artifacts",
    "contracts",
    "NFTEscrow.sol",
    "NFTEscrow.json"
  );
  const outputDir = path.join(__dirname, "..", "artifacts");
  const abiOutput = path.join(outputDir, "NFTEscrow.abi.json");
  const deployOutput = path.join(outputDir, "NFTEscrow.deployment.json");

  try {
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(abiOutput, JSON.stringify(artifact.abi, null, 2));
    fs.writeFileSync(
      deployOutput,
      JSON.stringify(
        { address, network: hre.network.name, deployedAt: new Date().toISOString() },
        null,
        2
      )
    );
    console.log(`Saved ABI and deployment metadata to ${outputDir}`);
  } catch (err) {
    console.warn(`Skipping ABI copy: ${err.message}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

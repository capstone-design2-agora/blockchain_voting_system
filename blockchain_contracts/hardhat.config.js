require("@nomicfoundation/hardhat-toolbox");

const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:9545";
const PRIVATE_KEY = process.env.PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY;

/** @type import('hardhat/config').HardhatUserConfig */
const config = {
  solidity: "0.8.20",
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./hardhat/cache",
    artifacts: "./hardhat/artifacts",
  },
  networks: {
    localhost: {
      url: RPC_URL,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : undefined,
    },
  },
};

module.exports = config;

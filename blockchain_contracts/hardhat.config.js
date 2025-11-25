require("@nomicfoundation/hardhat-toolbox");

module.exports = {
  solidity: "0.8.20",
  paths: {
    sources: "./contracts",
    tests: "./tests",
    cache: "./hardhat/cache",
    artifacts: "./hardhat/artifacts"
  },
  networks: {
    localhost: {
      url: "http://127.0.0.1:9545"
    }
  }
};

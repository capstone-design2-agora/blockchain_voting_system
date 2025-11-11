#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const solc = require('solc');
const Web3 = require('web3');

const PROJECT_ROOT = __dirname;
const CONTRACT_FILE = 'VotingWithNFT.sol';
const CONTRACT_NAME = 'VotingWithNFT';
const CONTRACT_PATH = path.join(PROJECT_ROOT, 'contracts', CONTRACT_FILE);
const OUTPUT_SELECTION = {
  '*': {
    '*': ['abi', 'evm.bytecode']
  }
};

function readSource() {
  if (!fs.existsSync(CONTRACT_PATH)) {
    throw new Error(`Contract file not found: ${CONTRACT_PATH}`);
  }
  return fs.readFileSync(CONTRACT_PATH, 'utf8');
}

function findImports(importPath) {
  const localPath = path.resolve(path.dirname(CONTRACT_PATH), importPath);
  if (fs.existsSync(localPath)) {
    return { contents: fs.readFileSync(localPath, 'utf8') };
  }

  const nodeModulesPath = path.resolve(PROJECT_ROOT, 'node_modules', importPath);
  if (fs.existsSync(nodeModulesPath)) {
    return { contents: fs.readFileSync(nodeModulesPath, 'utf8') };
  }

  return { error: `File not found: ${importPath}` };
}

function compileContract() {
  const input = {
    language: 'Solidity',
    sources: {
      [CONTRACT_FILE]: {
        content: readSource()
      }
    },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: 'london',
      outputSelection: OUTPUT_SELECTION
    }
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));

  if (output.errors && output.errors.length > 0) {
    const hasSevereError = output.errors.some((err) => err.severity === 'error');
    output.errors.forEach((err) => {
      const label = err.severity === 'error' ? 'ERROR' : 'WARN';
      console.log(`[${label}] ${err.formattedMessage}`);
    });
    if (hasSevereError) {
      throw new Error('Compilation failed');
    }
  }

  const contractOutput = output.contracts[CONTRACT_FILE][CONTRACT_NAME];
  if (!contractOutput) {
    throw new Error(`Unable to find compiled output for ${CONTRACT_NAME}`);
  }

  const { abi, evm } = contractOutput;
  return { abi, bytecode: evm.bytecode.object };
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

async function main() {
  const rpcUrl = process.env.NODE_URL || 'http://localhost:10545';
  const contractName = process.env.CONTRACT_NAME || 'Voting Receipt';
  const contractSymbol = process.env.CONTRACT_SYMBOL || 'VOTE';
  const proposalsEnv = process.env.PROPOSALS || 'Alice,Bob,Charlie';
  const consensus = process.env.GOQUORUM_CONS_ALGO || 'unknown';
  const proposals = proposalsEnv
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  const ballotId = process.env.BALLOT_ID || 'citizen-2025';
  const ballotTitle = process.env.BALLOT_TITLE || '제 25대 대통령 선거';
  const ballotDescription =
    process.env.BALLOT_DESCRIPTION ||
    '대한민국 제 25대 대통령을 선출하는 공식 선거입니다.';

  // Besu uses nanosecond timestamps
  const nowNanoseconds = BigInt(Date.now()) * BigInt(1_000_000);
  const oneHourNs = BigInt(3_600_000_000_000);
  const sevenDaysNs = BigInt(604_800_000_000_000);
  const threeHoursNs = BigInt(10_800_000_000_000);

  const parseTimestamp = (key, fallback) => {
    const raw = process.env[key];
    if (!raw) {
      return fallback;
    }
    const value = BigInt(raw);
    if (value < 0) {
      throw new Error(`Environment variable ${key} must be a positive integer (nanoseconds). Received: ${raw}`);
    }
    return value;
  };
  const ballotOpensAt = parseTimestamp('BALLOT_OPENS_AT', nowNanoseconds);
  const ballotClosesAt = parseTimestamp('BALLOT_CLOSES_AT', ballotOpensAt + oneHourNs);
  const ballotAnnouncesAt = parseTimestamp('BALLOT_ANNOUNCES_AT', ballotClosesAt + BigInt(180_000_000_000));
  const expectedVotersRaw = process.env.BALLOT_EXPECTED_VOTERS ?? process.env.EXPECTED_VOTERS ?? process.env.REACT_APP_EXPECTED_VOTERS;
  const expectedVoters =
    expectedVotersRaw && Number.parseInt(expectedVotersRaw, 10) > 0
      ? Number.parseInt(expectedVotersRaw, 10)
      : 1000;

  if (proposals.length === 0) {
    throw new Error('At least one proposal title must be provided via PROPOSALS');
  }

  console.log('> Compiling contract...');
  const { abi, bytecode } = compileContract();

  console.log('> Connecting to RPC:', rpcUrl);
  const web3 = new Web3(rpcUrl);

  try {
    await web3.eth.net.isListening();
  } catch (error) {
    throw new Error(`Unable to reach RPC endpoint ${rpcUrl}: ${error.message}`);
  }

  const chainId = await web3.eth.getChainId();
  const blockNumber = await web3.eth.getBlockNumber();
  console.log(`> Connected. chainId=${chainId}, blockNumber=${blockNumber}`);

  const accounts = await web3.eth.getAccounts();
  if (accounts.length === 0) {
    throw new Error('No unlocked accounts available on the RPC endpoint');
  }
  const deployer = accounts[0];
  console.log('> Using deployer:', deployer);

  const contractInstance = new web3.eth.Contract(abi);
  const deployment = contractInstance.deploy({
    data: '0x' + bytecode,
    arguments: [
      contractName,
      contractSymbol,
      proposals,
      ballotId,
      ballotTitle,
      ballotDescription,
      ballotOpensAt.toString(),
      ballotClosesAt.toString(),
      ballotAnnouncesAt.toString(),
      expectedVoters
    ]
  });

  console.log('> Estimating gas...');
  const gasEstimateRaw = await deployment.estimateGas({ from: deployer });
  const gasEstimate = Number(gasEstimateRaw);
  const gasLimit = Math.ceil(gasEstimate * 1.2);
  console.log(`> Gas estimate: ${gasEstimate}, using gas limit: ${gasLimit}`);

  const gasPrice = await web3.eth.getGasPrice();
  const gasPriceValue = typeof gasPrice === 'bigint' ? gasPrice : BigInt(gasPrice);
  console.log('> Gas price (wei):', gasPriceValue.toString());

  console.log('> Sending deployment transaction...');
  const txOptions = {
    from: deployer,
    data: deployment.encodeABI(),
    gas: gasLimit,
    gasPrice: gasPriceValue.toString()
  };

  const receipt = await web3.eth.sendTransaction(txOptions);
  if (!receipt || !receipt.contractAddress) {
    throw new Error('Deployment did not return a contract address');
  }

  const contractAddress = receipt.contractAddress;
  console.log('> Contract deployed at:', contractAddress);
  console.log('> Transaction hash:', receipt.transactionHash);

  const contract = new web3.eth.Contract(abi, contractAddress);

  const artifactsDir = path.resolve(PROJECT_ROOT, 'artifacts');
  const logsDir = path.resolve(PROJECT_ROOT, 'logs');
  ensureDir(artifactsDir);
  ensureDir(logsDir);

  const artifactPath = path.join(artifactsDir, 'deployment.json');
  const artifact = {
    contract: {
      name: contractName,
      symbol: contractSymbol,
      address: contract.options.address,
      abi,
      proposals,
      hasVotingReceipt: true,
      ballot: {
        id: ballotId,
        title: ballotTitle,
        description: ballotDescription,
        opensAt: ballotOpensAt.toString(),
        closesAt: ballotClosesAt.toString(),
        announcesAt: ballotAnnouncesAt.toString(),
        expectedVoters
      }
    },
    network: {
      rpcUrl,
      chainId,
      blockNumber,
      transactionHash: receipt.transactionHash,
      gasUsed: receipt ? receipt.gasUsed : null,
      consensus
    },
    deployer,
    timestamp: new Date().toISOString()
  };

  fs.writeFileSync(artifactPath, JSON.stringify(artifact, null, 2));
  console.log('> Deployment details saved to', artifactPath);

  const abiPath = path.join(artifactsDir, 'VotingWithNFT.abi.json');
  fs.writeFileSync(abiPath, JSON.stringify(abi, null, 2));
  console.log('> ABI saved to', abiPath);
}

main()
  .then(() => {
    console.log('> Deployment completed successfully.');
  })
  .catch((error) => {
    console.error('Deployment failed:', error.message);
    process.exitCode = 1;
  });

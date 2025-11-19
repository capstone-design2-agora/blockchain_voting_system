#!/usr/bin/env node
/**
 * Redeploys only the VotingWithSBT contract while reusing the existing
 * CitizenSBT (SBT) and VotingRewardNFT contracts.
 *
 * Usage:
 *   NODE_URL=<rpc> PROPOSALS="Alice,Bob" BALLOT_ID="..." node redeploy_voting_contract.js
 *
 * Required addresses are pulled from environment variables when supplied,
 * otherwise they fall back to the previously generated artifacts file.
 */

const fs = require('fs');
const path = require('path');
const solc = require('solc');
const Web3 = require('web3');

const SCRIPT_DIR = __dirname;
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..');
const CONTRACTS_DIR = path.join(PROJECT_ROOT, 'contracts');
const ARTIFACT_PATH = path.join(PROJECT_ROOT, 'artifacts', 'sbt_deployment.json');
const DEPLOY_ENV_PATH = path.join(PROJECT_ROOT, 'deploy.env');

const VOTING_CONTRACT = {
  file: 'VotingWithSBT.sol',
  name: 'VotingWithSBT',
};

function loadDeployEnv() {
  if (!fs.existsSync(DEPLOY_ENV_PATH)) {
    return;
  }
  const raw = fs.readFileSync(DEPLOY_ENV_PATH, 'utf8');
  raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .forEach((line) => {
      if (!line || line.startsWith('#')) {
        return;
      }
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!match) {
        return;
      }
      const [, key, valuePart] = match;
      if (process.env[key]) {
        return;
      }
      const unquoted = valuePart.trim().replace(/^"|"$/g, '');
      process.env[key] = unquoted;
    });
}

function findImports(importPath) {
  const localPath = path.resolve(CONTRACTS_DIR, importPath);
  if (fs.existsSync(localPath)) {
    return { contents: fs.readFileSync(localPath, 'utf8') };
  }

  const nodeModulesPath = path.resolve(PROJECT_ROOT, 'node_modules', importPath);
  if (fs.existsSync(nodeModulesPath)) {
    return { contents: fs.readFileSync(nodeModulesPath, 'utf8') };
  }

  return { error: `File not found: ${importPath}` };
}

function compileVotingContract() {
  console.log('> Compiling VotingWithSBT...');

  const contractPath = path.join(CONTRACTS_DIR, VOTING_CONTRACT.file);
  if (!fs.existsSync(contractPath)) {
    throw new Error(`Unable to find ${VOTING_CONTRACT.file}`);
  }

  const input = {
    language: 'Solidity',
    sources: {
      [VOTING_CONTRACT.file]: { content: fs.readFileSync(contractPath, 'utf8') },
    },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: 'london',
      outputSelection: {
        '*': { '*': ['abi', 'evm.bytecode'] },
      },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
  if (output.errors && output.errors.length) {
    const fatal = output.errors.some((err) => err.severity === 'error');
    output.errors.forEach((err) => {
      const label = err.severity === 'error' ? 'ERROR' : 'WARN';
      console.log(`[${label}] ${err.formattedMessage}`);
    });
    if (fatal) {
      throw new Error('Compilation failed');
    }
  }

  const compiled = output.contracts[VOTING_CONTRACT.file][VOTING_CONTRACT.name];
  if (!compiled) {
    throw new Error('Compilation output missing for VotingWithSBT');
  }

  return {
    abi: compiled.abi,
    bytecode: compiled.evm.bytecode.object,
  };
}

function loadArtifact() {
  if (!fs.existsSync(ARTIFACT_PATH)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(ARTIFACT_PATH, 'utf8'));
}

function resolveAddress(envValue, artifactValue, label) {
  if (envValue && envValue.trim()) {
    return envValue.trim();
  }
  if (artifactValue && artifactValue.trim()) {
    return artifactValue.trim();
  }
  throw new Error(`Missing ${label} address. Set ${label}_ADDRESS in env or ensure artifacts exist.`);
}

function parseTimestamp(key, fallback) {
  const raw = process.env[key];
  if (!raw) {
    return fallback;
  }
  try {
    if (/^\d+$/.test(raw)) {
      const value = BigInt(raw);
      if (value < 0) {
        throw new Error('negative');
      }
      return value;
    }
    const parsed = Date.parse(raw.replace(/"/g, ''));
    if (Number.isNaN(parsed)) {
      throw new Error('invalid date');
    }
    return BigInt(parsed) * BigInt(1_000_000);
  } catch (error) {
    throw new Error(`Cannot convert ${raw} from ${key} to nanoseconds: ${error.message}`);
  }
}

async function deployVotingContract(web3, deployer, compiled, args) {
  console.log('\n> Deploying VotingWithSBT with args:', JSON.stringify(args, null, 2));
  const contract = new web3.eth.Contract(compiled.abi);
  const deployment = contract.deploy({ data: '0x' + compiled.bytecode, arguments: args });

  const gasEstimate = Number(await deployment.estimateGas({ from: deployer }));
  const gasLimit = Math.ceil(gasEstimate * 1.2);
  const gasPrice = await web3.eth.getGasPrice();

  const receipt = await web3.eth.sendTransaction({
    from: deployer,
    data: deployment.encodeABI(),
    gas: gasLimit,
    gasPrice: gasPrice.toString(),
  });

  if (!receipt.contractAddress) {
    throw new Error('Deployment did not return a contract address');
  }

  console.log('  ✓ VotingWithSBT deployed at', receipt.contractAddress);
  return receipt;
}

async function authorizeRewardMinter(web3, rewardAbi, rewardAddress, deployer, newVotingAddress, previousVotingAddress) {
  const contract = new web3.eth.Contract(rewardAbi, rewardAddress);

  if (previousVotingAddress && previousVotingAddress.toLowerCase() !== newVotingAddress.toLowerCase()) {
    try {
      console.log('> Revoking old VotingWithSBT minter authorization');
      await contract.methods
        .setMinterAuthorization(previousVotingAddress, false)
        .send({ from: deployer });
    } catch (error) {
      console.warn('  ⚠ Unable to revoke old authorization:', error.message);
    }
  }

  console.log('> Granting minter authorization to new VotingWithSBT');
  const tx = await contract.methods
    .setMinterAuthorization(newVotingAddress, true)
    .send({ from: deployer });
  console.log('  ✓ Authorization tx hash:', tx.transactionHash);
}

async function main() {
  loadDeployEnv();
  const artifact = loadArtifact();

  const rpcUrl = process.env.NODE_URL || process.env.RPC_URL || 'http://localhost:9545';
  const proposalsEnv = process.env.PROPOSALS || artifact?.contracts?.VotingWithSBT?.proposals?.join(',') || '';
  const proposals = proposalsEnv
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (proposals.length === 0) {
    throw new Error('PROPOSALS must include at least one candidate');
  }

  const nowNs = BigInt(Date.now()) * BigInt(1_000_000);
  const hourNs = BigInt(3_600_000_000_000);
  const threeMinutesNs = BigInt(180_000_000_000);

  const ballotId = process.env.BALLOT_ID || artifact?.contracts?.VotingWithSBT?.ballot?.id || 'refreshed-ballot';
  const ballotTitle = process.env.BALLOT_TITLE || artifact?.contracts?.VotingWithSBT?.ballot?.title || '업데이트된 투표';
  const ballotDescription =
    process.env.BALLOT_DESCRIPTION || artifact?.contracts?.VotingWithSBT?.ballot?.description || '새로운 투표 설명입니다.';
  const ballotOpensAt = parseTimestamp('BALLOT_OPENS_AT', nowNs);
  const ballotClosesAt = parseTimestamp('BALLOT_CLOSES_AT', ballotOpensAt + hourNs);
  const ballotAnnouncesAt = parseTimestamp('BALLOT_ANNOUNCES_AT', ballotClosesAt + threeMinutesNs);

  const expectedVotersRaw =
    process.env.BALLOT_EXPECTED_VOTERS ||
    process.env.EXPECTED_VOTERS ||
    process.env.REACT_APP_EXPECTED_VOTERS ||
    artifact?.contracts?.VotingWithSBT?.ballot?.expectedVoters ||
    1000;
  const expectedVoters = Number.parseInt(expectedVotersRaw, 10) || 1000;

  const citizenAddress = resolveAddress(
    process.env.CITIZEN_SBT_ADDRESS || process.env.REACT_APP_CITIZEN_SBT_ADDRESS,
    artifact?.contracts?.CitizenSBT?.address,
    'CITIZEN_SBT'
  );
  const rewardAddress = resolveAddress(
    process.env.REWARD_NFT_ADDRESS ||
      process.env.VOTING_REWARD_NFT_ADDRESS ||
      process.env.REACT_APP_REWARD_NFT_ADDRESS,
    artifact?.contracts?.VotingRewardNFT?.address,
    'REWARD_NFT'
  );

  const pledgesEnv = process.env.PLEDGES || '';
  let proposalPledges = [];

  if (pledgesEnv) {
    const pledgeGroups = pledgesEnv.split(';').map((group) => group.trim());
    if (pledgeGroups.length !== proposals.length) {
      console.warn(
        `⚠ Warning: PLEDGES count (${pledgeGroups.length}) doesn't match PROPOSALS count (${proposals.length})`
      );
      console.warn('  Using empty pledges for mismatched candidates');
    }

    proposalPledges = pledgeGroups.map((group) =>
      group
        .split('|')
        .map((pledge) => pledge.trim())
        .filter(Boolean)
    );
  } else if (artifact?.contracts?.VotingWithSBT?.pledges) {
    proposalPledges = artifact.contracts.VotingWithSBT.pledges.map((pledges) =>
      Array.isArray(pledges) ? pledges.filter((pledge) => typeof pledge === 'string' && pledge.trim().length > 0) : []
    );
  }

  if (proposalPledges.length > proposals.length) {
    proposalPledges = proposalPledges.slice(0, proposals.length);
  }
  while (proposalPledges.length < proposals.length) {
    proposalPledges.push([]);
  }

  console.log('═══════════════════════════════════════════════════════');
  console.log('  Voting Contract Redeployment');
  console.log('═══════════════════════════════════════════════════════');
  console.log('RPC URL:', rpcUrl);
  console.log('CitizenSBT:', citizenAddress);
  console.log('Reward NFT:', rewardAddress);
  console.log('Ballot ID:', ballotId);
  console.log('Proposals:', proposals.join(', '));
  console.log('Pledges per candidate:');
  proposalPledges.forEach((pledges, idx) => {
    console.log(`  ${proposals[idx]}: ${pledges.length ? pledges.join(' | ') : '(no pledges)'}`);
  });
  console.log('═══════════════════════════════════════════════════════');

  const compiled = compileVotingContract();
  const web3 = new Web3(rpcUrl);
  await web3.eth.net.isListening();

  const accounts = await web3.eth.getAccounts();
  if (!accounts.length) {
    throw new Error('No unlocked accounts available');
  }
  const deployer = accounts[0];
  console.log('> Using deployer:', deployer);

  const receipt = await deployVotingContract(web3, deployer, compiled, [
    citizenAddress,
    rewardAddress,
    proposals,
    proposalPledges,
    ballotId,
    ballotTitle,
    ballotDescription,
    ballotOpensAt.toString(),
    ballotClosesAt.toString(),
    ballotAnnouncesAt.toString(),
    expectedVoters,
  ]);

  if (!artifact || !artifact.contracts || !artifact.contracts.VotingRewardNFT) {
    console.warn('\n⚠ No artifact for VotingRewardNFT found; skipping minter authorization update.');
  } else {
    await authorizeRewardMinter(
      web3,
      artifact.contracts.VotingRewardNFT.abi,
      rewardAddress,
      deployer,
      receipt.contractAddress,
      artifact.contracts.VotingWithSBT?.address
    );
  }

  const updatedArtifact = artifact || { contracts: {}, network: {}, timestamp: new Date().toISOString() };
  updatedArtifact.contracts = updatedArtifact.contracts || {};
  updatedArtifact.contracts.VotingWithSBT = {
    address: receipt.contractAddress,
    abi: compiled.abi,
    proposals,
    pledges: proposalPledges,
    ballot: {
      id: ballotId,
      title: ballotTitle,
      description: ballotDescription,
      opensAt: ballotOpensAt.toString(),
      closesAt: ballotClosesAt.toString(),
      announcesAt: ballotAnnouncesAt.toString(),
      expectedVoters,
    },
    transactionHash: receipt.transactionHash,
    gasUsed: receipt.gasUsed,
  };

  updatedArtifact.network = updatedArtifact.network || {};
  updatedArtifact.network.rpcUrl = rpcUrl;
  updatedArtifact.network.chainId = await web3.eth.getChainId();
  updatedArtifact.network.blockNumber = await web3.eth.getBlockNumber();
  updatedArtifact.timestamp = new Date().toISOString();
  updatedArtifact.deployer = deployer;

  fs.writeFileSync(ARTIFACT_PATH, JSON.stringify(updatedArtifact, null, 2));
  console.log('\n> Updated artifact written to', ARTIFACT_PATH);

  console.log('\n════════ Summary ═════════');
  console.log('New VotingWithSBT:', receipt.contractAddress);
  console.log('Tx Hash:', receipt.transactionHash);
  console.log('═══════════════════════════\n');
}

main()
  .then(() => {
    console.log('> Voting contract redeployed successfully.');
  })
  .catch((error) => {
    console.error('\n✗ Redeployment failed:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exitCode = 1;
  });

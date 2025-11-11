#!/usr/bin/env node
/**
 * deploy_sbt_system.js
 * Deploys the complete SBT-based voting system:
 * 1. CitizenSBT - Identity verification and wallet binding
 * 2. VotingRewardNFT - Transferable reward NFTs with mascot images
 * 3. VotingWithSBT - Voting contract with SBT verification
 */

const fs = require('fs');
const path = require('path');
const solc = require('solc');
const Web3 = require('web3');

const PROJECT_ROOT = __dirname;
const CONTRACTS_DIR = path.join(PROJECT_ROOT, 'contracts');

// Contract configurations
const CONTRACTS = {
    CitizenSBT: {
        file: 'CitizenSBT.sol',
        name: 'CitizenSBT'
    },
    VotingRewardNFT: {
        file: 'VotingRewardNFT.sol',
        name: 'VotingRewardNFT'
    },
    VotingWithSBT: {
        file: 'VotingWithSBT.sol',
        name: 'VotingWithSBT'
    }
};

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

function compileContracts() {
    console.log('> Compiling all contracts...');

    const sources = {};
    for (const [key, config] of Object.entries(CONTRACTS)) {
        const contractPath = path.join(CONTRACTS_DIR, config.file);
        if (!fs.existsSync(contractPath)) {
            throw new Error(`Contract file not found: ${contractPath}`);
        }
        sources[config.file] = {
            content: fs.readFileSync(contractPath, 'utf8')
        };
    }

    const input = {
        language: 'Solidity',
        sources,
        settings: {
            optimizer: { enabled: true, runs: 200 },
            evmVersion: 'london',
            outputSelection: {
                '*': {
                    '*': ['abi', 'evm.bytecode']
                }
            }
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

    const compiled = {};
    for (const [key, config] of Object.entries(CONTRACTS)) {
        const contractOutput = output.contracts[config.file][config.name];
        if (!contractOutput) {
            throw new Error(`Unable to find compiled output for ${config.name}`);
        }
        compiled[key] = {
            abi: contractOutput.abi,
            bytecode: contractOutput.evm.bytecode.object
        };
    }

    console.log('> All contracts compiled successfully');
    return compiled;
}

function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

async function deployContract(web3, deployer, name, abi, bytecode, args = []) {
    console.log(`\n> Deploying ${name}...`);
    console.log(`  Constructor args:`, JSON.stringify(args, null, 2));

    const contractInstance = new web3.eth.Contract(abi);
    const deployment = contractInstance.deploy({
        data: '0x' + bytecode,
        arguments: args
    });

    console.log('  Estimating gas...');
    const gasEstimateRaw = await deployment.estimateGas({ from: deployer });
    const gasEstimate = Number(gasEstimateRaw);
    const gasLimit = Math.ceil(gasEstimate * 1.2);
    console.log(`  Gas estimate: ${gasEstimate}, using gas limit: ${gasLimit}`);

    const gasPrice = await web3.eth.getGasPrice();
    const gasPriceValue = typeof gasPrice === 'bigint' ? gasPrice : BigInt(gasPrice);

    console.log('  Sending deployment transaction...');
    const txOptions = {
        from: deployer,
        data: deployment.encodeABI(),
        gas: gasLimit,
        gasPrice: gasPriceValue.toString()
    };

    const receipt = await web3.eth.sendTransaction(txOptions);
    if (!receipt || !receipt.contractAddress) {
        throw new Error(`${name} deployment did not return a contract address`);
    }

    console.log(`  ✓ ${name} deployed at:`, receipt.contractAddress);
    console.log(`  Transaction hash:`, receipt.transactionHash);

    return {
        address: receipt.contractAddress,
        transactionHash: receipt.transactionHash,
        gasUsed: receipt.gasUsed
    };
}

async function main() {
    // Load environment variables
    const rpcUrl = process.env.NODE_URL || 'http://localhost:9545';
    const consensus = process.env.GOQUORUM_CONS_ALGO || 'raft';

    // CitizenSBT parameters
    const sbtName = process.env.SBT_NAME || 'Citizen Identity Token';
    const sbtSymbol = process.env.SBT_SYMBOL || 'CITIZEN';
    const verifierAddress = process.env.VERIFIER_ADDRESS; // Will use deployer if not set

    // VotingRewardNFT parameters
    const rewardName = process.env.REWARD_NFT_NAME || 'Voting Reward NFT';
    const rewardSymbol = process.env.REWARD_NFT_SYMBOL || 'VREWARD';
    const mascotBaseURI = process.env.MASCOT_BASE_URI || 'https://example.com/mascots/';

    // VotingWithSBT parameters
    const proposalsEnv = process.env.PROPOSALS || 'Alice,Bob,Charlie';
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
    const threeMinutesNs = BigInt(180_000_000_000);

    const parseTimestamp = (key, fallback) => {
        const raw = process.env[key];
        if (!raw) return fallback;
        const value = BigInt(raw);
        if (value < 0) {
            throw new Error(`${key} must be a positive integer (nanoseconds). Received: ${raw}`);
        }
        return value;
    };

    const ballotOpensAt = parseTimestamp('BALLOT_OPENS_AT', nowNanoseconds);
    const ballotClosesAt = parseTimestamp('BALLOT_CLOSES_AT', ballotOpensAt + oneHourNs);
    const ballotAnnouncesAt = parseTimestamp('BALLOT_ANNOUNCES_AT', ballotClosesAt + threeMinutesNs);

    const expectedVotersRaw = process.env.BALLOT_EXPECTED_VOTERS ??
        process.env.EXPECTED_VOTERS ??
        process.env.REACT_APP_EXPECTED_VOTERS;
    const expectedVoters = expectedVotersRaw && Number.parseInt(expectedVotersRaw, 10) > 0
        ? Number.parseInt(expectedVotersRaw, 10)
        : 1000;

    if (proposals.length === 0) {
        throw new Error('At least one proposal must be provided via PROPOSALS');
    }

    console.log('═══════════════════════════════════════════════════════');
    console.log('  SBT-Based Voting System Deployment');
    console.log('═══════════════════════════════════════════════════════');
    console.log('RPC URL:', rpcUrl);
    console.log('Consensus:', consensus);
    console.log('SBT Name:', sbtName);
    console.log('Reward NFT Name:', rewardName);
    console.log('Ballot ID:', ballotId);
    console.log('Proposals:', proposals.join(', '));
    console.log('═══════════════════════════════════════════════════════\n');

    // Compile contracts
    const compiled = compileContracts();

    // Connect to blockchain
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
    const verifier = verifierAddress || deployer;
    console.log('> Using deployer:', deployer);
    console.log('> Using verifier:', verifier);

    // Deploy contracts in order
    const deployments = {};

    // 1. Deploy CitizenSBT
    deployments.CitizenSBT = await deployContract(
        web3,
        deployer,
        'CitizenSBT',
        compiled.CitizenSBT.abi,
        compiled.CitizenSBT.bytecode,
        [sbtName, sbtSymbol, verifier]
    );

    // 2. Deploy VotingRewardNFT
    deployments.VotingRewardNFT = await deployContract(
        web3,
        deployer,
        'VotingRewardNFT',
        compiled.VotingRewardNFT.abi,
        compiled.VotingRewardNFT.bytecode,
        [rewardName, rewardSymbol, mascotBaseURI]
    );

    // 3. Deploy VotingWithSBT
    deployments.VotingWithSBT = await deployContract(
        web3,
        deployer,
        'VotingWithSBT',
        compiled.VotingWithSBT.abi,
        compiled.VotingWithSBT.bytecode,
        [
            deployments.CitizenSBT.address,
            deployments.VotingRewardNFT.address,
            proposals,
            ballotId,
            ballotTitle,
            ballotDescription,
            ballotOpensAt.toString(),
            ballotClosesAt.toString(),
            ballotAnnouncesAt.toString(),
            expectedVoters
        ]
    );

    // 4. Authorize VotingWithSBT to mint reward NFTs
    console.log('\n> Authorizing VotingWithSBT to mint reward NFTs...');
    const rewardNFT = new web3.eth.Contract(
        compiled.VotingRewardNFT.abi,
        deployments.VotingRewardNFT.address
    );

    const authTx = await rewardNFT.methods
        .setMinterAuthorization(deployments.VotingWithSBT.address, true)
        .send({ from: deployer });

    console.log('  ✓ Authorization complete. Tx hash:', authTx.transactionHash);

    // Save artifacts
    const artifactsDir = path.resolve(PROJECT_ROOT, 'artifacts');
    ensureDir(artifactsDir);

    const artifact = {
        contracts: {
            CitizenSBT: {
                name: sbtName,
                symbol: sbtSymbol,
                address: deployments.CitizenSBT.address,
                verifier: verifier,
                abi: compiled.CitizenSBT.abi,
                transactionHash: deployments.CitizenSBT.transactionHash,
                gasUsed: deployments.CitizenSBT.gasUsed
            },
            VotingRewardNFT: {
                name: rewardName,
                symbol: rewardSymbol,
                address: deployments.VotingRewardNFT.address,
                baseURI: mascotBaseURI,
                abi: compiled.VotingRewardNFT.abi,
                transactionHash: deployments.VotingRewardNFT.transactionHash,
                gasUsed: deployments.VotingRewardNFT.gasUsed
            },
            VotingWithSBT: {
                address: deployments.VotingWithSBT.address,
                abi: compiled.VotingWithSBT.abi,
                proposals,
                ballot: {
                    id: ballotId,
                    title: ballotTitle,
                    description: ballotDescription,
                    opensAt: ballotOpensAt.toString(),
                    closesAt: ballotClosesAt.toString(),
                    announcesAt: ballotAnnouncesAt.toString(),
                    expectedVoters
                },
                transactionHash: deployments.VotingWithSBT.transactionHash,
                gasUsed: deployments.VotingWithSBT.gasUsed
            }
        },
        network: {
            rpcUrl,
            chainId,
            blockNumber,
            consensus
        },
        deployer,
        verifier,
        timestamp: new Date().toISOString()
    };

    const artifactPath = path.join(artifactsDir, 'sbt_deployment.json');
    fs.writeFileSync(artifactPath, JSON.stringify(artifact, null, 2));
    console.log('\n> Deployment details saved to', artifactPath);

    // Save individual ABI files
    for (const [contractName, contractData] of Object.entries(compiled)) {
        const abiPath = path.join(artifactsDir, `${contractName}.abi.json`);
        fs.writeFileSync(abiPath, JSON.stringify(contractData.abi, null, 2));
        console.log(`> ${contractName} ABI saved to`, abiPath);
    }

    // Print summary
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('  Deployment Summary');
    console.log('═══════════════════════════════════════════════════════');
    console.log('CitizenSBT:', deployments.CitizenSBT.address);
    console.log('VotingRewardNFT:', deployments.VotingRewardNFT.address);
    console.log('VotingWithSBT:', deployments.VotingWithSBT.address);
    console.log('═══════════════════════════════════════════════════════');
    console.log('\nNext steps:');
    console.log('1. Copy ABIs to frontend: cp artifacts/*.abi.json ../frontend/src/abi/');
    console.log('2. Update frontend .env with contract addresses');
    console.log('3. Test SBT minting: node verify_sbt.js <address> <name> <birthdate>');
    console.log('═══════════════════════════════════════════════════════\n');
}

main()
    .then(() => {
        console.log('> Deployment completed successfully.');
    })
    .catch((error) => {
        console.error('\n✗ Deployment failed:', error.message);
        if (error.stack) {
            console.error(error.stack);
        }
        process.exitCode = 1;
    });

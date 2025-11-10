#!/usr/bin/env node
/**
 * verify_sbt.js
 * Test script for SBT verification and minting
 * Usage: node verify_sbt.js <wallet_address> <name> <birthdate>
 * Example: node verify_sbt.js 0x123... "John Doe" "1990-01-01"
 */

const fs = require('fs');
const path = require('path');
const Web3 = require('web3');

const PROJECT_ROOT = __dirname;
const DEPLOYMENT_FILE = path.join(PROJECT_ROOT, 'artifacts', 'sbt_deployment.json');

function loadDeployment() {
    if (!fs.existsSync(DEPLOYMENT_FILE)) {
        throw new Error(`Deployment file not found: ${DEPLOYMENT_FILE}`);
    }
    return JSON.parse(fs.readFileSync(DEPLOYMENT_FILE, 'utf8'));
}

function generateIdentityHash(web3, name, birthDate) {
    const data = `${name.toLowerCase()}-${birthDate}`;
    return web3.utils.keccak256(data);
}

async function checkSBT(web3, contract, address) {
    console.log('\n> Checking SBT status for:', address);

    const hasSBT = await contract.methods.hasSBT(address).call();
    console.log('  Has SBT:', hasSBT);

    if (hasSBT) {
        const balance = await contract.methods.balanceOf(address).call();
        console.log('  Balance:', balance);

        // Find token ID
        for (let i = 0; i < 100; i++) {
            try {
                const owner = await contract.methods.ownerOf(i).call();
                if (owner.toLowerCase() === address.toLowerCase()) {
                    console.log('  Token ID:', i);
                    const identityHash = await contract.methods.getIdentityByToken(i).call();
                    console.log('  Identity Hash:', identityHash);
                    break;
                }
            } catch (e) {
                // Token doesn't exist, continue
            }
        }
    }

    return hasSBT;
}

async function checkIdentityRegistered(web3, contract, identityHash) {
    console.log('\n> Checking if identity is registered...');
    console.log('  Identity Hash:', identityHash);

    const isRegistered = await contract.methods.isIdentityRegistered(identityHash).call();
    console.log('  Is Registered:', isRegistered);

    if (isRegistered) {
        const wallet = await contract.methods.getWalletByIdentity(identityHash).call();
        console.log('  Registered Wallet:', wallet);
    }

    return isRegistered;
}

async function mintSBT(web3, contract, address, identityHash, verifier) {
    console.log('\n> Minting SBT...');
    console.log('  To:', address);
    console.log('  Identity Hash:', identityHash);
    console.log('  From (Verifier):', verifier);

    try {
        const gasEstimate = await contract.methods.mint(address, identityHash).estimateGas({ from: verifier });
        console.log('  Gas estimate:', gasEstimate);

        const receipt = await contract.methods.mint(address, identityHash).send({
            from: verifier,
            gas: Math.ceil(gasEstimate * 1.2)
        });

        console.log('  ✓ SBT minted successfully!');
        console.log('  Transaction hash:', receipt.transactionHash);
        console.log('  Gas used:', receipt.gasUsed);

        // Extract token ID from events
        if (receipt.events && receipt.events.SBTMinted) {
            const tokenId = receipt.events.SBTMinted.returnValues.tokenId;
            console.log('  Token ID:', tokenId);
        }

        return receipt;
    } catch (error) {
        console.error('  ✗ Minting failed:', error.message);
        throw error;
    }
}

async function testTransfer(web3, contract, tokenId, from, to) {
    console.log('\n> Testing transfer (should fail - soulbound)...');
    console.log('  Token ID:', tokenId);
    console.log('  From:', from);
    console.log('  To:', to);

    try {
        await contract.methods.transferFrom(from, to, tokenId).estimateGas({ from });
        console.log('  ✗ WARNING: Transfer did not revert! SBT is not soulbound!');
        return false;
    } catch (error) {
        if (error.message.includes('TokenIsSoulbound') || error.message.includes('revert')) {
            console.log('  ✓ Transfer correctly reverted (token is soulbound)');
            return true;
        }
        console.error('  ✗ Unexpected error:', error.message);
        throw error;
    }
}

async function main() {
    const args = process.argv.slice(2);

    if (args.length < 3) {
        console.log('Usage: node verify_sbt.js <wallet_address> <name> <birthdate>');
        console.log('Example: node verify_sbt.js 0x627306090abaB3A6e1400e9345bC60c78a8BEf57 "Alice" "1990-01-01"');
        process.exit(1);
    }

    const targetAddress = args[0];
    const name = args[1];
    const birthDate = args[2];

    console.log('═══════════════════════════════════════════════════════');
    console.log('  SBT Verification and Minting Test');
    console.log('═══════════════════════════════════════════════════════');
    console.log('Target Address:', targetAddress);
    console.log('Name:', name);
    console.log('Birth Date:', birthDate);
    console.log('═══════════════════════════════════════════════════════');

    // Load deployment info
    const deployment = loadDeployment();
    const rpcUrl = deployment.network.rpcUrl;
    const citizenSBTAddress = deployment.contracts.CitizenSBT.address;
    const citizenSBTABI = deployment.contracts.CitizenSBT.abi;
    const verifier = deployment.verifier;

    console.log('\nUsing CitizenSBT at:', citizenSBTAddress);
    console.log('RPC URL:', rpcUrl);
    console.log('Verifier:', verifier);

    // Connect to blockchain
    const web3 = new Web3(rpcUrl);
    const contract = new web3.eth.Contract(citizenSBTABI, citizenSBTAddress);

    // Generate identity hash
    const identityHash = generateIdentityHash(web3, name, birthDate);

    // Check current status
    const hasSBT = await checkSBT(web3, contract, targetAddress);
    const isRegistered = await checkIdentityRegistered(web3, contract, identityHash);

    // Determine action
    if (hasSBT) {
        console.log('\n═══════════════════════════════════════════════════════');
        console.log('  Result: Address already has an SBT');
        console.log('═══════════════════════════════════════════════════════');

        // Test transfer to verify soulbound property
        const balance = await contract.methods.balanceOf(targetAddress).call();
        if (parseInt(balance) > 0) {
            // Find token ID
            for (let i = 0; i < 100; i++) {
                try {
                    const owner = await contract.methods.ownerOf(i).call();
                    if (owner.toLowerCase() === targetAddress.toLowerCase()) {
                        const accounts = await web3.eth.getAccounts();
                        const testRecipient = accounts[1] || accounts[0];
                        await testTransfer(web3, contract, i, targetAddress, testRecipient);
                        break;
                    }
                } catch (e) {
                    // Continue
                }
            }
        }

        return;
    }

    if (isRegistered) {
        console.log('\n═══════════════════════════════════════════════════════');
        console.log('  Result: Identity already registered to another wallet');
        console.log('  Cannot mint SBT to this address');
        console.log('═══════════════════════════════════════════════════════');
        return;
    }

    // Mint SBT
    console.log('\n> Address is eligible for SBT minting');
    const receipt = await mintSBT(web3, contract, targetAddress, identityHash, verifier);

    // Verify minting
    await checkSBT(web3, contract, targetAddress);

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('  Result: SBT successfully minted and verified');
    console.log('═══════════════════════════════════════════════════════');
}

main()
    .then(() => {
        console.log('\n> Test completed successfully.');
    })
    .catch((error) => {
        console.error('\n✗ Test failed:', error.message);
        if (error.stack) {
            console.error(error.stack);
        }
        process.exitCode = 1;
    });

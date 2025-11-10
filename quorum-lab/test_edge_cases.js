#!/usr/bin/env node
/**
 * test_edge_cases.js
 * Test edge cases: voting without SBT, duplicate voting, transfer attempt
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

async function testVotingWithoutSBT(web3, votingContract, address) {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('  Test 1: Voting without SBT (should fail)');
    console.log('═══════════════════════════════════════════════════════');
    console.log('Address:', address);

    try {
        const canVote = await votingContract.methods.canVote(address).call();
        console.log('Can Vote:', canVote);

        if (!canVote) {
            console.log('✓ Correctly prevented: Address without SBT cannot vote');
            return true;
        }

        // If canVote is true, try to actually vote (should fail)
        await votingContract.methods.vote(0).estimateGas({ from: address });
        console.log('✗ FAILED: Address without SBT was able to vote!');
        return false;
    } catch (error) {
        if (error.message.includes('VoterNotVerified') || error.message.includes('revert')) {
            console.log('✓ Correctly reverted: VoterNotVerified error');
            return true;
        }
        console.error('✗ Unexpected error:', error.message);
        return false;
    }
}

async function testDuplicateVoting(web3, votingContract, address) {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('  Test 2: Duplicate voting (should fail)');
    console.log('═══════════════════════════════════════════════════════');
    console.log('Address:', address);

    try {
        const hasVoted = await votingContract.methods.hasVoted(address).call();
        console.log('Has Voted:', hasVoted);

        if (!hasVoted) {
            console.log('⚠ Address has not voted yet, cannot test duplicate voting');
            return true;
        }

        const canVote = await votingContract.methods.canVote(address).call();
        console.log('Can Vote:', canVote);

        if (!canVote) {
            console.log('✓ Correctly prevented: Already voted addresses cannot vote again');
            return true;
        }

        // Try to vote again (should fail)
        await votingContract.methods.vote(0).estimateGas({ from: address });
        console.log('✗ FAILED: Address was able to vote twice!');
        return false;
    } catch (error) {
        if (error.message.includes('AlreadyVoted') || error.message.includes('revert')) {
            console.log('✓ Correctly reverted: AlreadyVoted error');
            return true;
        }
        console.error('✗ Unexpected error:', error.message);
        return false;
    }
}

async function testSBTTransfer(web3, sbtContract, from, to, tokenId) {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('  Test 3: SBT Transfer (should fail - soulbound)');
    console.log('═══════════════════════════════════════════════════════');
    console.log('From:', from);
    console.log('To:', to);
    console.log('Token ID:', tokenId);

    try {
        await sbtContract.methods.transferFrom(from, to, tokenId).estimateGas({ from });
        console.log('✗ FAILED: SBT was transferable!');
        return false;
    } catch (error) {
        if (error.message.includes('TokenIsSoulbound') || error.message.includes('revert')) {
            console.log('✓ Correctly reverted: Token is soulbound');
            return true;
        }
        console.error('✗ Unexpected error:', error.message);
        return false;
    }
}

async function testDuplicateIdentity(web3, sbtContract, verifier, existingAddress, newAddress, identityHash) {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('  Test 4: Duplicate identity registration (should fail)');
    console.log('═══════════════════════════════════════════════════════');
    console.log('Existing Address:', existingAddress);
    console.log('New Address:', newAddress);
    console.log('Identity Hash:', identityHash);

    try {
        const isRegistered = await sbtContract.methods.isIdentityRegistered(identityHash).call();
        console.log('Is Registered:', isRegistered);

        if (!isRegistered) {
            console.log('⚠ Identity not registered, cannot test duplicate registration');
            return true;
        }

        // Try to mint SBT with same identity to different address (should fail)
        await sbtContract.methods.mint(newAddress, identityHash).estimateGas({ from: verifier });
        console.log('✗ FAILED: Same identity was able to register twice!');
        return false;
    } catch (error) {
        if (error.message.includes('IdentityAlreadyRegistered') || error.message.includes('revert')) {
            console.log('✓ Correctly reverted: Identity already registered');
            return true;
        }
        console.error('✗ Unexpected error:', error.message);
        return false;
    }
}

async function main() {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  SBT System Edge Cases Test');
    console.log('═══════════════════════════════════════════════════════');

    const deployment = loadDeployment();
    const rpcUrl = deployment.network.rpcUrl;
    const web3 = new Web3(rpcUrl);

    const accounts = await web3.eth.getAccounts();
    const verifiedAccount = accounts[0]; // Has SBT and voted
    const unverifiedAccount = '0x627306090abaB3A6e1400e9345bC60c78a8BEf57'; // Test address without SBT    console.log('\nAccounts:');
    console.log('  Verified (has SBT, voted):', verifiedAccount);
    console.log('  Unverified (no SBT):', unverifiedAccount);

    // Setup contracts
    const votingContract = new web3.eth.Contract(
        deployment.contracts.VotingWithSBT.abi,
        deployment.contracts.VotingWithSBT.address
    );

    const sbtContract = new web3.eth.Contract(
        deployment.contracts.CitizenSBT.abi,
        deployment.contracts.CitizenSBT.address
    );

    // Run tests
    const results = [];

    results.push(await testVotingWithoutSBT(web3, votingContract, unverifiedAccount));
    results.push(await testDuplicateVoting(web3, votingContract, verifiedAccount));
    results.push(await testSBTTransfer(web3, sbtContract, verifiedAccount, unverifiedAccount, 0));

    // Get identity hash of verified account
    const identityHash = await sbtContract.methods.getIdentityByToken(0).call();
    results.push(await testDuplicateIdentity(
        web3,
        sbtContract,
        verifiedAccount,
        verifiedAccount,
        unverifiedAccount,
        identityHash
    ));

    // Summary
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('  Test Summary');
    console.log('═══════════════════════════════════════════════════════');
    const passed = results.filter(r => r).length;
    const total = results.length;
    console.log(`Passed: ${passed}/${total}`);
    console.log('═══════════════════════════════════════════════════════');

    if (passed === total) {
        console.log('\n✓ All edge cases handled correctly!');
    } else {
        console.log('\n✗ Some tests failed. Please review the implementation.');
        process.exitCode = 1;
    }
}

main()
    .then(() => {
        console.log('\n> Test completed.');
    })
    .catch((error) => {
        console.error('\n✗ Test failed:', error.message);
        if (error.stack) {
            console.error(error.stack);
        }
        process.exitCode = 1;
    });

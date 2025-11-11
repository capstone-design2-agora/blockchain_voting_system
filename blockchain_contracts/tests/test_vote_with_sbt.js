#!/usr/bin/env node
/**
 * test_vote_with_sbt.js
 * Test voting with SBT verification
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

async function main() {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  SBT-Based Voting Test');
    console.log('═══════════════════════════════════════════════════════\n');

    const deployment = loadDeployment();
    const rpcUrl = deployment.network.rpcUrl;
    const web3 = new Web3(rpcUrl);

    const votingAddress = deployment.contracts.VotingWithSBT.address;
    const votingABI = deployment.contracts.VotingWithSBT.abi;
    const votingContract = new web3.eth.Contract(votingABI, votingAddress);

    const accounts = await web3.eth.getAccounts();
    const voter = accounts[0];

    console.log('Voting Contract:', votingAddress);
    console.log('Voter:', voter);

    // Check if voter can vote
    console.log('\n> Checking if voter can vote...');
    const canVote = await votingContract.methods.canVote(voter).call();
    console.log('  Can Vote:', canVote);

    if (!canVote) {
        console.log('  ✗ Voter cannot vote (may not have SBT or already voted)');
        return;
    }

    // Get proposals
    console.log('\n> Getting proposals...');
    const proposalCount = await votingContract.methods.proposalCount().call();
    console.log('  Total Proposals:', proposalCount);

    for (let i = 0; i < proposalCount; i++) {
        const proposal = await votingContract.methods.getProposal(i).call();
        console.log(`  [${i}] ${proposal.name}: ${proposal.voteCount} votes`);
    }

    // Cast vote for proposal 0
    const proposalId = 0;
    console.log(`\n> Casting vote for proposal ${proposalId}...`);

    const gasEstimate = await votingContract.methods.vote(proposalId).estimateGas({ from: voter });
    console.log('  Gas estimate:', gasEstimate);

    const receipt = await votingContract.methods.vote(proposalId).send({
        from: voter,
        gas: Math.ceil(gasEstimate * 1.2)
    });

    console.log('  ✓ Vote cast successfully!');
    console.log('  Transaction hash:', receipt.transactionHash);
    console.log('  Gas used:', receipt.gasUsed);

    // Extract reward token ID from events
    if (receipt.events && receipt.events.VoteCast) {
        const rewardTokenId = receipt.events.VoteCast.returnValues.rewardTokenId;
        console.log('  Reward NFT Token ID:', rewardTokenId);
    }

    // Check updated vote counts
    console.log('\n> Updated proposal votes:');
    for (let i = 0; i < proposalCount; i++) {
        const proposal = await votingContract.methods.getProposal(i).call();
        console.log(`  [${i}] ${proposal.name}: ${proposal.voteCount} votes`);
    }

    // Get voting stats
    console.log('\n> Voting statistics:');
    const stats = await votingContract.methods.getVotingStats().call();
    console.log('  Total votes:', stats.totalVotes);
    console.log('  Turnout:', (stats.turnoutPercentage / 100).toFixed(2) + '%');

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('  Test Completed Successfully');
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

#!/usr/bin/env node
const Web3 = require('web3');
const fs = require('fs');
const path = require('path');

async function main() {
    try {
        const rpcUrl = process.env.NODE_URL || 'http://localhost:10545';
        const web3 = new Web3(rpcUrl);

        const deploymentPath = path.join(__dirname, 'artifacts', 'deployment.json');
        const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
        const contractAddress = deployment.contract.address;
        const abi = deployment.contract.abi;

        console.log('Contract:', contractAddress);

        const contract = new web3.eth.Contract(abi, contractAddress);
        const accounts = await web3.eth.getAccounts();
        const voter = accounts[0];

        console.log('Voter:', voter);

        // 투표 여부 확인
        const hasVoted = await contract.methods.hasVoted(voter).call();
        console.log('Already voted:', hasVoted);

        if (hasVoted) {
            console.log('\n❌ FAIL: This address has already voted!');
            console.log('   This is why the transaction reverted.');
            process.exit(0);
        }

        // 제안 개수
        const count = await contract.methods.proposalCount().call();
        console.log('Proposals:', count);

        // 투표 테스트
        console.log('\nTesting vote for proposal 0...');
        try {
            await contract.methods.vote(0).call({ from: voter });
            console.log('✓ Vote would succeed');
        } catch (err) {
            console.log('✗ Vote would fail:', err.message);

            // 원인 분석
            console.log('\nPossible causes:');
            console.log('- Voting period not started or already ended');
            console.log('- Invalid proposal ID');
            console.log('- Other contract requirement not met');
        }

    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

main();

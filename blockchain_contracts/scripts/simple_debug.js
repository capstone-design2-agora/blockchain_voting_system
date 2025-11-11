#!/usr/bin/env node
const Web3 = require('web3');
const fs = require('fs');
const path = require('path');

async function debugTransaction() {
    const rpcUrl = process.env.NODE_URL || 'http://localhost:10545';
    const web3 = new Web3(rpcUrl);
    web3.eth.handleRevert = true;

    // deployment.json에서 컨트랙트 정보 로드
    const deploymentPath = path.join(__dirname, 'artifacts', 'deployment.json');
    const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
    const contractAddress = deployment.contract.address;
    const abi = deployment.contract.abi;

    console.log('Contract Address:', contractAddress);

    const contract = new web3.eth.Contract(abi, contractAddress);
    const accounts = await web3.eth.getAccounts();
    const voter = accounts[0];

    console.log('Voter address:', voter);

    // 현재 블록 확인
    const block = await web3.eth.getBlock('latest');
    console.log('Current block:', block.number.toString());
    console.log('Block timestamp:', block.timestamp.toString());

    // 이미 투표했는지 확인
    const hasVoted = await contract.methods.hasVoted(voter).call();
    console.log('Has already voted:', hasVoted);

    // Proposal 개수 확인
    const proposalCount = await contract.methods.proposalCount().call();
    console.log('Total proposals:', proposalCount.toString());

    // 투표 시도 (시뮬레이션)
    const proposalId = 0;
    console.log('\n=== Testing Vote for Proposal', proposalId, '===');

    try {
        // call()로 시뮬레이션
        const result = await contract.methods.vote(proposalId).call({ from: voter });
        console.log('✓ Vote call would succeed, tokenId:', result.toString());

        // 가스 추정
        const gasEstimate = await contract.methods.vote(proposalId).estimateGas({ from: voter });
        console.log('✓ Estimated gas:', gasEstimate.toString());
    } catch (error) {
        console.log('✗ Vote would fail:');
        console.log('Error message:', error.message);
        if (error.reason) {
            console.log('Reason:', error.reason);
        }
        if (error.data) {
            console.log('Data:', error.data);
        }

        console.log('\n=== Likely causes ===');
        if (hasVoted) {
            console.log('❌ Address has already voted');
        }
        console.log('💡 Check ballot schedule with: contract.methods.ballotMetadata().call()');
        console.log('💡 Proposal ID must be < ' + proposalCount.toString());
    }
}

debugTransaction()
    .then(() => {
        console.log('\n✓ Debug completed');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n✗ Debug failed:', error.message);
        process.exit(1);
    });

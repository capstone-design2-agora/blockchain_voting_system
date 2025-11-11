#!/usr/bin/env node
const Web3 = require('web3');
const fs = require('fs');
const path = require('path');

function safeDate(timestamp) {
    try {
        const ts = typeof timestamp === 'bigint' ? Number(timestamp) : timestamp;
        if (ts === 0) return 'Not set (0)';
        if (ts > Number.MAX_SAFE_INTEGER / 1000) return `Too large (${timestamp.toString()})`;
        return new Date(ts * 1000).toISOString();
    } catch (e) {
        return `Error: ${e.message}`;
    }
}

async function debugTransaction() {
    const rpcUrl = process.env.NODE_URL || 'http://localhost:10545';
    const web3 = new Web3(rpcUrl);

    // deployment.json에서 컨트랙트 정보 로드
    const deploymentPath = path.join(__dirname, 'artifacts', 'deployment.json');
    if (!fs.existsSync(deploymentPath)) {
        throw new Error('deployment.json not found. Please deploy the contract first.');
    }

    const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
    const contractAddress = deployment.contract.address;
    const abi = deployment.contract.abi;

    console.log('Contract Address:', contractAddress);

    const contract = new web3.eth.Contract(abi, contractAddress);
    const accounts = await web3.eth.getAccounts();
    const voter = accounts[0];

    console.log('\n=== Current State ===');
    console.log('Voter address:', voter);

    // 현재 블록 타임스탬프 확인
    const block = await web3.eth.getBlock('latest');
    const now = typeof block.timestamp === 'bigint' ? block.timestamp : BigInt(block.timestamp);
    console.log('Current timestamp:', now.toString(), safeDate(now));

    // Ballot 메타데이터 확인
    const ballot = await contract.methods.ballotMetadata().call();
    const opensAt = typeof ballot.opensAt === 'bigint' ? ballot.opensAt : BigInt(ballot.opensAt);
    const closesAt = typeof ballot.closesAt === 'bigint' ? ballot.closesAt : BigInt(ballot.closesAt);
    const announcesAt = typeof ballot.announcesAt === 'bigint' ? ballot.announcesAt : BigInt(ballot.announcesAt);

    console.log('\n=== Ballot Info ===');
    console.log('Opens At:', opensAt.toString(), safeDate(opensAt));
    console.log('Closes At:', closesAt.toString(), safeDate(closesAt));
    console.log('Announces At:', announcesAt.toString(), safeDate(announcesAt));

    // 투표 가능 여부 체크    console.log('\n=== Vote Eligibility Check ===');
    console.log('Voting period started:', now >= opensAt);
    console.log('Voting period active:', now <= closesAt);

    // 이미 투표했는지 확인
    const hasVoted = await contract.methods.hasVoted(voter).call();
    console.log('Has already voted:', hasVoted);

    // Proposal 개수 확인
    const proposalCount = await contract.methods.proposalCount().call();
    const proposalCountNum = Number(proposalCount);
    console.log('\n=== Proposals ===');
    console.log('Total proposals:', proposalCountNum);

    for (let i = 0; i < proposalCountNum; i++) {
        const proposal = await contract.methods.getProposal(i).call();
        console.log(`Proposal ${i}: ${proposal.name} (${proposal.voteCount} votes)`);
    }

    // 투표 시도 (시뮬레이션)
    const proposalId = 0;
    console.log('\n=== Testing Vote for Proposal', proposalId, '===');

    try {
        // call()로 시뮬레이션 (실제 트랜잭션 없이 테스트)
        await contract.methods.vote(proposalId).call({ from: voter });
        console.log('✓ Vote call simulation succeeded');

        // 실제 가스 추정
        const gasEstimate = await contract.methods.vote(proposalId).estimateGas({ from: voter });
        console.log('Estimated gas:', gasEstimate);
    } catch (error) {
        console.log('✗ Vote would fail with error:');
        console.log(error.message);

        // 각 조건 개별 체크
        console.log('\n=== Detailed Checks ===');
        if (hasVoted) {
            console.log('❌ FAIL: Already voted');
        }
        if (now < opensAt) {
            console.log('❌ FAIL: Voting has not opened yet');
            console.log(`   Waiting ${opensAt - now} seconds`);
        }
        if (now > closesAt) {
            console.log('❌ FAIL: Voting has closed');
            console.log(`   Closed ${now - closesAt} seconds ago`);
        }
        if (proposalId >= proposalCountNum) {
            console.log('❌ FAIL: Proposal does not exist');
        }
    }
}

debugTransaction()
    .then(() => {
        console.log('\n✓ Debug completed');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Debug failed:', error.message);
        process.exit(1);
    });

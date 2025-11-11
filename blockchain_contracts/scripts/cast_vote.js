#!/usr/bin/env node
const Web3 = require('web3');
const fs = require('fs');
const path = require('path');

async function main() {
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

    const proposalId = parseInt(process.argv[2] || '0');

    console.log('Voter:', voter);
    console.log('Voting for proposal:', proposalId);

    // 투표 실행
    const receipt = await contract.methods.vote(proposalId).send({
        from: voter,
        gas: 300000
    });

    console.log('\n✓ Vote successful!');
    console.log('Transaction hash:', receipt.transactionHash);
    console.log('Token ID:', receipt.events.VoteCast.returnValues.tokenId);

    // 결과 확인
    const proposal = await contract.methods.getProposal(proposalId).call();
    console.log('\nProposal:', proposal.name);
    console.log('Total votes:', proposal.voteCount);
}

main().catch(console.error);

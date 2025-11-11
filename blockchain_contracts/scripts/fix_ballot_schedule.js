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
    const owner = deployment.deployer;

    console.log('Contract:', contractAddress);
    console.log('Owner:', owner);

    const contract = new web3.eth.Contract(abi, contractAddress);

    // 현재 블록의 나노초 timestamp 가져오기
    const block = await web3.currentProvider.send({
        jsonrpc: '2.0',
        method: 'eth_getBlockByNumber',
        params: ['latest', false],
        id: 1
    }, (err, result) => { });

    // 수동으로 promise 처리
    const blockData = await new Promise((resolve, reject) => {
        web3.currentProvider.send({
            jsonrpc: '2.0',
            method: 'eth_getBlockByNumber',
            params: ['latest', false],
            id: 1
        }, (err, result) => {
            if (err) reject(err);
            else resolve(result.result);
        });
    });

    const timestampHex = blockData.timestamp;
    const nowNs = BigInt(timestampHex);

    console.log('\nCurrent time (ns):', nowNs.toString());

    // 1시간 후 종료 (나노초)
    const oneHourNs = BigInt(3_600_000_000_000);
    const opensAtNs = nowNs;
    const closesAtNs = nowNs + oneHourNs;
    const announcesAtNs = closesAtNs + BigInt(180_000_000_000); // 3분

    console.log('New schedule (nanoseconds):');
    console.log('Opens at:', opensAtNs.toString());
    console.log('Closes at:', closesAtNs.toString());
    console.log('Announces at:', announcesAtNs.toString());

    console.log('\n Updating ballot schedule...');

    try {
        const receipt = await contract.methods
            .updateBallotSchedule(
                opensAtNs.toString(),
                closesAtNs.toString(),
                announcesAtNs.toString()
            )
            .send({
                from: owner,
                gas: 100000
            });

        console.log('✓ Schedule updated!');
        console.log('Transaction:', receipt.transactionHash);

        // 투표 테스트
        const accounts = await web3.eth.getAccounts();
        console.log('\nTesting vote...');
        await contract.methods.vote(0).call({ from: accounts[0] });
        console.log('✓ Vote would now succeed!');

    } catch (error) {
        console.error('✗ Failed:', error.message);
    }
}

main().catch(console.error);

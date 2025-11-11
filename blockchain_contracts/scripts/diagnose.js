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

        // 원시 RPC 호출로 블록 정보 가져오기
        const blockHex = await web3.eth.getBlockNumber();
        console.log('\nLatest block number:', blockHex);

        // raw RPC call
        const block = await web3.currentProvider.send({
            jsonrpc: '2.0',
            method: 'eth_getBlockByNumber',
            params: ['latest', false],
            id: 1
        }, (err, result) => {
            if (err) {
                console.error('Error:', err);
            } else {
                const timestampHex = result.result.timestamp;
                console.log('Raw timestamp (hex):', timestampHex);

                // hex를 BigInt로 변환
                const timestampBigInt = BigInt(timestampHex);
                console.log('Timestamp (full):', timestampBigInt.toString());

                // 나노초를 초로 변환
                const timestampSeconds = timestampBigInt / BigInt(1_000_000_000);
                console.log('Timestamp (seconds):', timestampSeconds.toString());

                // deployment.json의 시간과 비교
                const closesAt = deployment.contract.ballot.closesAt;
                console.log('\nCloses at:', closesAt);
                console.log('Current (s):', timestampSeconds.toString());
                console.log('Is closed?:', timestampSeconds > BigInt(closesAt));

                // 실제로 투표 시도
                console.log('\n=== Testing Vote ===');
                contract.methods.vote(0).call({ from: voter })
                    .then(() => {
                        console.log('✓ Vote would succeed!');
                        console.log('\n💡 The issue is that block.timestamp in Solidity');
                        console.log('   might be getting the nanosecond value instead of seconds!');
                    })
                    .catch(err => {
                        console.log('✗ Vote failed:', err.message);

                        if (err.message.includes('closed')) {
                            console.log('\n❌ Contract thinks voting is closed');
                            console.log('   This means block.timestamp in Solidity is in nanoseconds!');
                            console.log('\n   Solution: Deploy contract with timestamps in nanoseconds');
                            console.log('   Or: Configure Besu to use seconds for timestamp');
                        }
                    });
            }
        });

    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

main();

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

        // 현재 블록 시간
        const block = await web3.eth.getBlock('latest');
        const blockTime = parseInt(block.timestamp);

        console.log('\n=== Blockchain Time ===');
        console.log('Block timestamp:', blockTime);
        console.log('Block time (readable):', new Date(blockTime * 1000).toISOString());
        console.log('Block time (local):', new Date(blockTime * 1000).toLocaleString());

        // Ballot 메타데이터 - raw data로 가져오기
        console.log('\n=== Ballot Schedule (from contract) ===');

        try {
            // 직접 call로 가져오기
            const ballotData = await web3.eth.call({
                to: contractAddress,
                data: contract.methods.ballotMetadata().encodeABI()
            });

            console.log('Raw ballot data:', ballotData);

            // 수동으로 디코딩
            const decoded = web3.eth.abi.decodeParameters(
                [
                    'string',  // id
                    'string',  // title
                    'string',  // description
                    'uint256', // opensAt
                    'uint256', // closesAt
                    'uint256', // announcesAt
                    'uint256'  // expectedVoters
                ],
                ballotData
            );

            const opensAt = parseInt(decoded[3]);
            const closesAt = parseInt(decoded[4]);
            const announcesAt = parseInt(decoded[5]);

            console.log('\nBallot ID:', decoded[0]);
            console.log('Title:', decoded[1]);
            console.log('\nSchedule:');
            console.log('Opens At:', opensAt, new Date(opensAt * 1000).toLocaleString());
            console.log('Closes At:', closesAt, new Date(closesAt * 1000).toLocaleString());
            console.log('Announces At:', announcesAt, new Date(announcesAt * 1000).toLocaleString());

            console.log('\n=== Time Comparison ===');
            console.log('Current block time:', blockTime);
            console.log('Voting closes at:', closesAt);
            console.log('Difference:', closesAt - blockTime, 'seconds');

            if (blockTime < opensAt) {
                console.log('❌ Voting has NOT started yet');
                console.log('   Starts in:', opensAt - blockTime, 'seconds');
            } else if (blockTime > closesAt) {
                console.log('❌ Voting has CLOSED');
                console.log('   Closed', blockTime - closesAt, 'seconds ago');
            } else {
                console.log('✓ Voting is ACTIVE');
                console.log('   Time remaining:', closesAt - blockTime, 'seconds');
            }

        } catch (err) {
            console.log('Error getting ballot metadata:', err.message);
        }

        // deployment.json에서도 확인
        console.log('\n=== From deployment.json ===');
        if (deployment.contract.ballot) {
            const ballot = deployment.contract.ballot;
            console.log('Opens At:', ballot.opensAt, new Date(ballot.opensAt * 1000).toLocaleString());
            console.log('Closes At:', ballot.closesAt, new Date(ballot.closesAt * 1000).toLocaleString());
            console.log('Announces At:', ballot.announcesAt, new Date(ballot.announcesAt * 1000).toLocaleString());
        }

        // 현재 실제 시간
        console.log('\n=== Real World Time ===');
        const now = Math.floor(Date.now() / 1000);
        console.log('Current time (real):', now, new Date(now * 1000).toLocaleString());
        console.log('Time difference (blockchain vs real):', blockTime - now, 'seconds');

    } catch (error) {
        console.error('Error:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

main();

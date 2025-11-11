#!/usr/bin/env node
/**
 * 프론트엔드와 동일한 방식으로 ballot metadata를 테스트
 */

const fs = require('fs');
const Web3 = require('web3');

// Deployment artifact 로드
const artifact = JSON.parse(fs.readFileSync('artifacts/deployment.json', 'utf8'));

const rpcUrl = artifact.network.rpcUrl;
const contractAddress = artifact.contract.address;
const abi = artifact.contract.abi;

console.log('🔗 RPC URL:', rpcUrl);
console.log('📄 Contract Address:', contractAddress);
console.log('='.repeat(70));

// Web3 인스턴스 생성 (프론트엔드와 동일)
const web3 = new Web3(rpcUrl);

async function testBallotMetadata() {
    try {
        console.log('\n📡 블록체인 연결 확인...');
        const isConnected = await web3.eth.net.isListening();
        console.log('✅ 연결 상태:', isConnected);

        console.log('\n📋 Contract 인스턴스 생성...');
        const contract = new web3.eth.Contract(abi, contractAddress);

        console.log('\n🔍 ballotMetadata() 호출...');
        const metadata = await contract.methods.ballotMetadata().call();

        console.log('\n📦 Raw Response:');
        console.log(JSON.stringify(metadata, null, 2));

        // 프론트엔드 방식으로 파싱
        const structIndexMap = {
            id: 0,
            title: 1,
            description: 2,
            opensAt: 3,
            closesAt: 4,
            announcesAt: 5,
            expectedVoters: 6,
        };

        const getString = (key, fallback = "") => {
            if (typeof metadata[key] === "string" && metadata[key].length > 0) {
                return metadata[key];
            }
            const index = structIndexMap[key];
            if (typeof index === "number") {
                const value = metadata[index];
                if (typeof value === "string" && value.length > 0) {
                    return value;
                }
            }
            return fallback;
        };

        const getUint = (key) => {
            let value = metadata[key];
            if (value === undefined) {
                const index = structIndexMap[key];
                if (typeof index === "number") {
                    value = metadata[index];
                }
            }

            if (typeof value === "number") {
                return value;
            }
            if (typeof value === "bigint") {
                return Number(value);
            }
            if (typeof value === "string" && value) {
                const numeric = parseInt(value, 10);
                if (Number.isFinite(numeric)) {
                    return numeric;
                }
            }
            return 0;
        };

        const parsed = {
            id: getString("id"),
            title: getString("title"),
            description: getString("description"),
            opensAt: getUint("opensAt"),
            closesAt: getUint("closesAt"),
            announcesAt: getUint("announcesAt"),
            expectedVoters: getUint("expectedVoters"),
        };

        console.log('\n✅ Parsed Metadata:');
        console.log(JSON.stringify(parsed, null, 2));

        // 시간을 ISO 형식으로 변환
        const normalizeTimestamp = (value) => {
            if (!value || value <= 0) {
                return "";
            }
            return new Date(value * 1000).toISOString();
        };

        console.log('\n📅 ISO 형식 시간:');
        console.log('  opensAt:', normalizeTimestamp(parsed.opensAt));
        console.log('  closesAt:', normalizeTimestamp(parsed.closesAt));
        console.log('  announcesAt:', normalizeTimestamp(parsed.announcesAt));

    } catch (error) {
        console.error('\n❌ 오류 발생:', error.message);
        console.error('\n📚 Stack trace:');
        console.error(error.stack);
    }
}

testBallotMetadata();

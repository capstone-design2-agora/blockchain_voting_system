#!/bin/bash

set -euo pipefail

echo "========================================"
echo "VotingWithSBT 재배포 시작"
echo "========================================"
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTRACTS_DIR="$(realpath "${SCRIPT_DIR}/..")"
ARTIFACT_PATH="${CONTRACTS_DIR}/artifacts/sbt_deployment.json"
FRONTEND_DIR="${CONTRACTS_DIR}/../frontend"
FRONTEND_ENV="${FRONTEND_DIR}/.env.local"

cd "$CONTRACTS_DIR"

if [ -f "deploy.env" ]; then
  echo "📄 deploy.env 로드 중..."
  set -a
  source deploy.env
  set +a
  echo "✅ 환경 변수 로드 완료"
  echo ""
fi

echo "🔗 RPC 연결 확인 중..."
RPC_URL="${NODE_URL:-${RPC_URL:-http://localhost:9545}}"
if ! curl -s -X POST "$RPC_URL" \
  -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' > /dev/null 2>&1; then
  echo "❌ RPC 서버에 연결할 수 없습니다: $RPC_URL"
  exit 1
fi
echo "✅ RPC 연결 성공"
echo ""

if [ -f "$ARTIFACT_PATH" ]; then
  BACKUP_FILE="${ARTIFACT_PATH}.backup.$(date +%s)"
  echo "📦 기존 VotingWithSBT 배포 정보 백업: $BACKUP_FILE"
  cp "$ARTIFACT_PATH" "$BACKUP_FILE"
  echo ""
fi

echo "🚀 VotingWithSBT 단일 재배포 실행"
node "${SCRIPT_DIR}/redeploy_voting_contract.js"
echo ""

if [ ! -f "$ARTIFACT_PATH" ]; then
  echo "❌ 재배포 이후 artifact 파일을 찾을 수 없습니다"
  exit 1
fi

VOTING_ADDRESS=$(node -pe "JSON.parse(require('fs').readFileSync('$ARTIFACT_PATH','utf8')).contracts.VotingWithSBT.address")
SBT_ADDRESS=$(node -pe "JSON.parse(require('fs').readFileSync('$ARTIFACT_PATH','utf8')).contracts.CitizenSBT.address")
REWARD_ADDRESS=$(node -pe "JSON.parse(require('fs').readFileSync('$ARTIFACT_PATH','utf8')).contracts.VotingRewardNFT.address")
VERIFIER_ADDRESS=$(node -pe "try { JSON.parse(require('fs').readFileSync('$ARTIFACT_PATH','utf8')).contracts.CitizenSBT.verifier } catch(e) { '' }")

echo "📍 신규 VotingWithSBT 주소: $VOTING_ADDRESS"
echo ""

if [ -f "$FRONTEND_ENV" ]; then
  echo "🔄 프론트엔드 .env.local 업데이트 중..."
  cp "$FRONTEND_ENV" "${FRONTEND_ENV}.backup.$(date +%s)"
  sed -i "s|^REACT_APP_VOTING_CONTRACT_ADDRESS=.*|REACT_APP_VOTING_CONTRACT_ADDRESS=$VOTING_ADDRESS|" "$FRONTEND_ENV"
  sed -i "s|^REACT_APP_CITIZEN_SBT_ADDRESS=.*|REACT_APP_CITIZEN_SBT_ADDRESS=$SBT_ADDRESS|" "$FRONTEND_ENV"
  sed -i "s|^REACT_APP_REWARD_NFT_ADDRESS=.*|REACT_APP_REWARD_NFT_ADDRESS=$REWARD_ADDRESS|" "$FRONTEND_ENV"
  echo "✅ 프론트엔드 환경 변수 업데이트 완료"
  echo "  파일: $FRONTEND_ENV"
  echo ""
else
  echo "⚠️  프론트엔드 .env.local 파일을 찾을 수 없습니다. 수동 업데이트 필요"
fi

# 프론트엔드 config.json 업데이트
CONFIG_FILE="${FRONTEND_DIR}/public/config.json"
mkdir -p "$(dirname "$CONFIG_FILE")"

echo "🔄 프론트엔드 config.json 업데이트 중..."
cat > "$CONFIG_FILE" <<EOF
{
  "CITIZEN_SBT_ADDRESS": "$SBT_ADDRESS",
  "VOTING_CONTRACT_ADDRESS": "$VOTING_ADDRESS",
  "REWARD_NFT_ADDRESS": "$REWARD_ADDRESS",
  "VERIFIER_ADDRESS": "$VERIFIER_ADDRESS",
  "RPC_URL": "http://localhost:9545",
  "CHAIN_ID": "0x539",
  "CHAIN_NAME": "Quorum Local",
  "EXPECTED_VOTERS": 1000
}
EOF
echo "✅ config.json 업데이트 완료"

VOTING_ABI_SOURCE="${CONTRACTS_DIR}/artifacts/VotingWithSBT.abi.json"
VOTING_ABI_TARGET="${FRONTEND_DIR}/src/abi/VotingWithSBT.abi.json"
if [ -f "$VOTING_ABI_SOURCE" ]; then
  mkdir -p "$(dirname "$VOTING_ABI_TARGET")"
  cp "$VOTING_ABI_SOURCE" "$VOTING_ABI_TARGET"
  echo "📁 VotingWithSBT ABI를 프론트엔드에 복사했습니다"
  echo "  -> $VOTING_ABI_TARGET"
  echo ""
else
  echo "⚠️ VotingWithSBT ABI 파일을 찾을 수 없어 복사를 건너뜁니다"
fi

echo "========================================"
echo "✅ VotingWithSBT 재배포 완료"
echo "========================================"
echo "다음 단계를 수행하세요:"
echo "다음 단계를 수행하세요:"
echo "  1. 브라우저를 새로고침(F5)하여 새 주소를 반영하세요"
echo "  2. 필요한 경우 백엔드 환경 변수(CITIZEN_SBT_CONTRACT_ADDRESS 등)를 확인하세요"
echo "========================================"

#!/bin/bash

# 컨트랙트 재배포 스크립트
# CitizenSBT, VotingRewardNFT, VotingWithSBT를 모두 재배포합니다

set -e

echo "========================================"
echo "컨트랙트 재배포 시작"
echo "========================================"
echo ""

# 현재 디렉토리 확인
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BLOCKCHAIN_CONTRACTS_DIR="$(realpath "${SCRIPT_DIR}/..")"
cd "$BLOCKCHAIN_CONTRACTS_DIR"

# deploy.env 파일 로드
if [ -f "deploy.env" ]; then
    echo "📄 deploy.env 파일 로드 중..."
    # Export all variables from deploy.env
    set -a
    source deploy.env
    set +a
    
    # Helper function to convert date string to Unix timestamp in nanoseconds
    date_to_timestamp() {
        local input="$1"
        # If already a number (Unix timestamp)
        if [[ "$input" =~ ^[0-9]+$ ]]; then
            # Check if it's in seconds (< year 2286) or nanoseconds
            if [[ ${#input} -le 10 ]]; then
                # It's in seconds, convert to nanoseconds
                echo "${input}000000000"
            else
                # Already in nanoseconds
                echo "$input"
            fi
        else
            # Convert date string to Unix timestamp in nanoseconds
            local seconds
            seconds=$(date -d "$input" +%s 2>/dev/null || echo "")
            if [[ -n "$seconds" ]]; then
                echo "${seconds}000000000"
            else
                echo "$input"
            fi
        fi
    }
    
    # Convert timestamp variables if they exist
    if [ -n "${BALLOT_OPENS_AT:-}" ]; then
        export BALLOT_OPENS_AT=$(date_to_timestamp "$BALLOT_OPENS_AT")
    fi
    if [ -n "${BALLOT_CLOSES_AT:-}" ]; then
        export BALLOT_CLOSES_AT=$(date_to_timestamp "$BALLOT_CLOSES_AT")
    fi
    if [ -n "${BALLOT_ANNOUNCES_AT:-}" ]; then
        export BALLOT_ANNOUNCES_AT=$(date_to_timestamp "$BALLOT_ANNOUNCES_AT")
    fi
    
    echo "✅ 환경 변수 로드 완료"
    echo ""
fi

# 네트워크 상태 확인
echo "🔍 네트워크 상태 확인 중..."
if ! docker ps | grep -q "network"; then
    echo "❌ 오류: network가 실행 중이 아닙니다."
    echo "먼저 네트워크를 시작하세요: cd ../network && ./run.sh"
    exit 1
fi

# RPC 연결 확인
echo "🔗 RPC 연결 확인 중..."
if ! curl -s -X POST http://localhost:9545 \
    -H "Content-Type: application/json" \
    --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
    > /dev/null 2>&1; then
    echo "❌ 오류: RPC 서버에 연결할 수 없습니다."
    exit 1
fi
echo "✅ RPC 연결 성공"
echo ""

# 기존 deployment 백업
if [ -f "artifacts/sbt_deployment.json" ]; then
    BACKUP_FILE="artifacts/sbt_deployment.backup.$(date +%s).json"
    echo "📦 기존 SBT 배포 정보 백업: $BACKUP_FILE"
    cp artifacts/sbt_deployment.json "$BACKUP_FILE"
    echo ""
fi

# SBT 시스템 배포
echo "🚀 SBT 시스템 배포 중..."
echo "  - CitizenSBT (신원 SBT)"
echo "  - VotingRewardNFT (보상 NFT)"
echo "  - VotingWithSBT (투표 컨트랙트)"
echo ""

node "${SCRIPT_DIR}/deploy_sbt_system.js"

if [ $? -eq 0 ]; then
    echo ""
    echo "========================================"
    echo "✅ 컨트랙트 재배포 완료!"
    echo "========================================"
    echo ""
    
    # 배포 정보 출력
    if [ -f "artifacts/sbt_deployment.json" ]; then
        echo "📄 배포 정보:"
        echo "  파일: artifacts/sbt_deployment.json"
        
        # ABI 파일을 프론트엔드로 복사
        echo ""
        echo "📋 ABI 파일 동기화 중..."
        FRONTEND_ABI_DIR="../frontend/src/abi"
        mkdir -p "$FRONTEND_ABI_DIR"
        
        if [ -f "artifacts/CitizenSBT.abi.json" ]; then
            cp artifacts/CitizenSBT.abi.json "$FRONTEND_ABI_DIR/CitizenSBT.json"
            echo "  ✓ CitizenSBT.json"
        fi
        if [ -f "artifacts/VotingWithSBT.abi.json" ]; then
            cp artifacts/VotingWithSBT.abi.json "$FRONTEND_ABI_DIR/Voting.json"
            echo "  ✓ Voting.json"
        fi
        if [ -f "artifacts/VotingRewardNFT.abi.json" ]; then
            cp artifacts/VotingRewardNFT.abi.json "$FRONTEND_ABI_DIR/VotingRewardNFT.json"
            echo "  ✓ VotingRewardNFT.json"
        fi
        echo "✅ ABI 파일 동기화 완료"
        echo ""
        
        # 컨트랙트 주소 추출
        CITIZEN_SBT=$(node -pe "JSON.parse(require('fs').readFileSync('artifacts/sbt_deployment.json', 'utf8')).contracts.CitizenSBT.address")
        REWARD_NFT=$(node -pe "JSON.parse(require('fs').readFileSync('artifacts/sbt_deployment.json', 'utf8')).contracts.VotingRewardNFT.address")
        VOTING_CONTRACT=$(node -pe "JSON.parse(require('fs').readFileSync('artifacts/sbt_deployment.json', 'utf8')).contracts.VotingWithSBT.address")
        VERIFIER=$(node -pe "JSON.parse(require('fs').readFileSync('artifacts/sbt_deployment.json', 'utf8')).contracts.CitizenSBT.verifier")
        # Escrow는 하드햇으로 배포
        echo "🚀 SimpleNFTEscrow 배포 중 (Hardhat localhost)..."
        npx hardhat run scripts/deploy_simple_escrow.js --network localhost
        if [ -f "artifacts/escrow_deployment.json" ]; then
            ESCROW=$(node -pe "JSON.parse(require('fs').readFileSync('artifacts/escrow_deployment.json', 'utf8')).address")
        else
            ESCROW=""
        fi
        
        echo ""
        echo "📍 배포된 컨트랙트 주소:"
        echo "  CitizenSBT:        $CITIZEN_SBT"
        echo "  VotingRewardNFT:   $REWARD_NFT"
        echo "  VotingWithSBT:     $VOTING_CONTRACT"
        echo "  Verifier:          $VERIFIER"
        echo "  SimpleNFTEscrow:   ${ESCROW:-N/A}"
        echo ""

        # Escrow ABI sync (after deployment to ensure file exists)
        FRONTEND_ABI_DIR="../frontend/src/abi"
        mkdir -p "$FRONTEND_ABI_DIR"
        if [ -f "artifacts/SimpleNFTEscrow.abi.json" ]; then
            cp artifacts/SimpleNFTEscrow.abi.json "$FRONTEND_ABI_DIR/SimpleNFTEscrow.json"
            echo "  ✓ SimpleNFTEscrow.json"
        fi
        
        # 프론트엔드 .env.local 업데이트
        FRONTEND_ENV="../frontend/.env.local"
        if [ -f "$FRONTEND_ENV" ]; then
            echo "🔄 프론트엔드 설정 업데이트 중..."
            
            # 기존 파일 백업
            cp "$FRONTEND_ENV" "${FRONTEND_ENV}.backup.$(date +%s)"
            
            # .env.local 업데이트
            sed -i "s|REACT_APP_CITIZEN_SBT_ADDRESS=.*|REACT_APP_CITIZEN_SBT_ADDRESS=$CITIZEN_SBT|g" "$FRONTEND_ENV"
            sed -i "s|REACT_APP_VOTING_CONTRACT_ADDRESS=.*|REACT_APP_VOTING_CONTRACT_ADDRESS=$VOTING_CONTRACT|g" "$FRONTEND_ENV"
            sed -i "s|REACT_APP_REWARD_NFT_ADDRESS=.*|REACT_APP_REWARD_NFT_ADDRESS=$REWARD_NFT|g" "$FRONTEND_ENV"
            sed -i "s|REACT_APP_VERIFIER_ADDRESS=.*|REACT_APP_VERIFIER_ADDRESS=$VERIFIER|g" "$FRONTEND_ENV"
            if grep -q "REACT_APP_SIMPLE_ESCROW_ADDRESS" "$FRONTEND_ENV"; then
                sed -i "s|REACT_APP_SIMPLE_ESCROW_ADDRESS=.*|REACT_APP_SIMPLE_ESCROW_ADDRESS=${ESCROW:-<escrow-address>}|g" "$FRONTEND_ENV"
            else
                echo "REACT_APP_SIMPLE_ESCROW_ADDRESS=${ESCROW:-<escrow-address>}" >> "$FRONTEND_ENV"
            fi
            
            echo "✅ 프론트엔드 설정 업데이트 완료"
            echo "  파일: $FRONTEND_ENV"
            echo ""
            echo "  새 주소:"
            echo "    CITIZEN_SBT:     $CITIZEN_SBT"
            echo "    VOTING_CONTRACT: $VOTING_CONTRACT"
            echo "    REWARD_NFT:      $REWARD_NFT"
            echo "    VERIFIER:        $VERIFIER"
            echo "    SIMPLE_ESCROW:   ${ESCROW:-<escrow-address>}"
            echo ""
            echo "⚠️  프론트엔드를 재시작해야 변경사항이 적용됩니다:"
            echo "  cd ../frontend && npm start"
            echo ""
        else
            echo "⚠️  프론트엔드 .env.local 파일을 찾을 수 없습니다."
            echo "  수동으로 업데이트하세요: $FRONTEND_ENV"
            echo ""
        fi
        
        # 프론트엔드 config.json 업데이트
        CONFIG_FILE="../frontend/public/config.json"
        mkdir -p "$(dirname "$CONFIG_FILE")"
        
        echo "🔄 프론트엔드 config.json 업데이트 중..."
        cat > "$CONFIG_FILE" <<EOF
{
  "CITIZEN_SBT_ADDRESS": "$CITIZEN_SBT",
  "VOTING_CONTRACT_ADDRESS": "$VOTING_CONTRACT",
  "REWARD_NFT_ADDRESS": "$REWARD_NFT",
  "SIMPLE_ESCROW_ADDRESS": "${ESCROW:-<escrow-address>}",
  "VERIFIER_ADDRESS": "$VERIFIER",
  "RPC_URL": "http://localhost:9545",
  "CHAIN_ID": "0x539",
  "CHAIN_NAME": "Quorum Local",
  "EXPECTED_VOTERS": 1000
}
EOF
        echo "✅ config.json 업데이트 완료"
        # 인덱서 env 파일 작성 (기존 값 우선 유지)
        INDEXER_ENV_FILE="../scripts/indexer.env"
        read_env_var() {
            local file="$1"; local key="$2"; local fallback="$3"
            if [ -f "$file" ] && grep -q "^${key}=" "$file"; then
                grep "^${key}=" "$file" | head -n1 | cut -d '=' -f2-
            else
                echo "$fallback"
            fi
        }
        EXISTING_SUPABASE_URL=$(read_env_var "$INDEXER_ENV_FILE" "SUPABASE_URL" "${SUPABASE_URL:-<supabase-url>}")
        EXISTING_SUPABASE_KEY=$(read_env_var "$INDEXER_ENV_FILE" "SUPABASE_SERVICE_KEY" "${SUPABASE_SERVICE_KEY:-<supabase-service-key>}")

        cat > "$INDEXER_ENV_FILE" <<EOF
# Escrow indexer environment
RPC_URL=http://localhost:9545
SIMPLE_ESCROW_ADDRESS=${ESCROW:-<escrow-address>}
SUPABASE_URL=${EXISTING_SUPABASE_URL}
SUPABASE_SERVICE_KEY=${EXISTING_SUPABASE_KEY}
# Optional: START_BLOCK=0
EOF
        echo "✅ indexer.env 업데이트 완료"

        echo "💡 SBT 시스템 테스트:"
        echo "  node verify_sbt.js              # SBT 발급 테스트"
        echo "  node test_vote_with_sbt.js      # SBT 투표 테스트"
        echo "  node test_edge_cases.js         # 엣지 케이스 테스트"
        echo ""
    fi
else
    echo ""
    echo "❌ 컨트랙트 배포 실패"
    exit 1
fi

#!/bin/bash

# 투표 컨트랙트 재배포 스크립트
# 네트워크는 실행 중인 상태에서 컨트랙트만 새로 배포합니다

set -e

echo "========================================"
echo "투표 컨트랙트 재배포 시작"
echo "========================================"
echo ""

# 현재 디렉토리 확인
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 네트워크 상태 확인
echo "🔍 네트워크 상태 확인 중..."
if ! docker ps | grep -q "network"; then
    echo "❌ 오류: network가 실행 중이 아닙니다."
    echo "먼저 네트워크를 시작하세요: cd ../network && ./run.sh"
    exit 1
fi

# RPC 연결 확인
echo "🔗 RPC 연결 확인 중..."
if ! curl -s -X POST http://localhost:10545 \
    -H "Content-Type: application/json" \
    --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
    > /dev/null 2>&1; then
    echo "❌ 오류: RPC 서버에 연결할 수 없습니다."
    exit 1
fi
echo "✅ RPC 연결 성공"
echo ""

# 기존 deployment 백업
if [ -f "artifacts/deployment.json" ]; then
    BACKUP_FILE="artifacts/deployment.backup.$(date +%s).json"
    echo "📦 기존 배포 정보 백업: $BACKUP_FILE"
    cp artifacts/deployment.json "$BACKUP_FILE"
    echo ""
fi

# deploy.env 파일 로드
if [ ! -f "deploy.env" ]; then
    echo "❌ 오류: deploy.env 파일을 찾을 수 없습니다."
    exit 1
fi

echo "📄 deploy.env 설정 로드 중..."
# 환경 변수를 export하여 Node.js 프로세스에 전달
set -a  # 자동으로 모든 변수를 export
source deploy.env
set +a  # export 자동 설정 해제

# ISO 8601 날짜를 나노초 타임스탬프로 변환
if [ -n "$BALLOT_OPENS_AT" ]; then
    OPENS_TIMESTAMP=$(date -d "$BALLOT_OPENS_AT" +%s)
    export BALLOT_OPENS_AT="${OPENS_TIMESTAMP}000000000"
fi

if [ -n "$BALLOT_CLOSES_AT" ]; then
    CLOSES_TIMESTAMP=$(date -d "$BALLOT_CLOSES_AT" +%s)
    export BALLOT_CLOSES_AT="${CLOSES_TIMESTAMP}000000000"
fi

if [ -n "$BALLOT_ANNOUNCES_AT" ]; then
    ANNOUNCES_TIMESTAMP=$(date -d "$BALLOT_ANNOUNCES_AT" +%s)
    export BALLOT_ANNOUNCES_AT="${ANNOUNCES_TIMESTAMP}000000000"
fi

echo "📝 투표 정보 (deploy.env):"
echo "  ID: $BALLOT_ID"
echo "  제목: $BALLOT_TITLE"
echo "  설명: $BALLOT_DESCRIPTION"
echo "  투표 시작: $(date -d "$BALLOT_OPENS_AT" '+%Y-%m-%d %H:%M:%S' 2>/dev/null || echo $BALLOT_OPENS_AT)"
echo "  투표 종료: $(date -d "$BALLOT_CLOSES_AT" '+%Y-%m-%d %H:%M:%S' 2>/dev/null || echo $BALLOT_CLOSES_AT)"
echo "  결과 발표: $(date -d "$BALLOT_ANNOUNCES_AT" '+%Y-%m-%d %H:%M:%S' 2>/dev/null || echo $BALLOT_ANNOUNCES_AT)"
echo "  예상 투표자: $BALLOT_EXPECTED_VOTERS"
echo "  후보: $PROPOSALS"
echo ""

# 컨트랙트 배포
echo "🚀 투표 컨트랙트 배포 중..."
node deploy_contract.js

if [ $? -eq 0 ]; then
    echo ""
    echo "========================================"
    echo "✅ 컨트랙트 재배포 완료!"
    echo "========================================"
    echo ""
    
    # 배포 정보 출력
    if [ -f "artifacts/deployment.json" ]; then
        echo "📄 배포 정보:"
        echo "  파일: artifacts/deployment.json"
        
        # 컨트랙트 주소 추출
        CONTRACT_ADDRESS=$(node -pe "JSON.parse(require('fs').readFileSync('artifacts/deployment.json', 'utf8')).contract.address")
        echo "  컨트랙트 주소: $CONTRACT_ADDRESS"
        echo ""
        
        # 프론트엔드 .env.local 업데이트
        FRONTEND_ENV="../frontend/.env.local"
        if [ -f "$FRONTEND_ENV" ]; then
            echo "🔄 프론트엔드 설정 업데이트 중..."
            
            # 기존 파일 백업
            cp "$FRONTEND_ENV" "${FRONTEND_ENV}.backup.$(date +%s)"
            
            # .env.local 업데이트
            sed -i "s|REACT_APP_VOTING_ADDRESS=.*|REACT_APP_VOTING_ADDRESS=$CONTRACT_ADDRESS|g" "$FRONTEND_ENV"
            sed -i "s|REACT_APP_EXPECTED_VOTERS=.*|REACT_APP_EXPECTED_VOTERS=$BALLOT_EXPECTED_VOTERS|g" "$FRONTEND_ENV"
            
            echo "✅ 프론트엔드 설정 업데이트 완료"
            echo "  파일: $FRONTEND_ENV"
            echo "  새 컨트랙트 주소: $CONTRACT_ADDRESS"
            echo ""
            echo "⚠️  프론트엔드를 재시작해야 변경사항이 적용됩니다:"
            echo "  cd ../frontend && npm start"
            echo ""
        else
            echo "⚠️  프론트엔드 .env.local 파일을 찾을 수 없습니다."
            echo "  수동으로 업데이트하세요: $FRONTEND_ENV"
            echo ""
        fi
        
        echo "💡 다음 명령으로 투표 상태를 확인할 수 있습니다:"
        echo "  node check_vote.js"
        echo ""
        echo "💡 투표하기:"
        echo "  node cast_vote.js --proposal 0  # 노무현"
        echo "  node cast_vote.js --proposal 1  # 문재인"
        echo "  node cast_vote.js --proposal 2  # 이재명"
    fi
else
    echo ""
    echo "❌ 컨트랙트 배포 실패"
    exit 1
fi

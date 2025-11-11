#!/usr/bin/env bash
# 네트워크 시작 스크립트

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BLOCKCHAIN_CONTRACTS_DIR="$(realpath "${SCRIPT_DIR}/..")"
PROJECT_ROOT="$(realpath "${BLOCKCHAIN_CONTRACTS_DIR}/..")"
NETWORK_DIR="${PROJECT_ROOT}/network"

echo "========================================"
echo "Quorum 네트워크 시작"
echo "========================================"
echo ""

if [[ ! -d "${NETWORK_DIR}" ]]; then
    echo "❌ 네트워크 디렉토리를 찾을 수 없습니다: ${NETWORK_DIR}"
    exit 1
fi

cd "${NETWORK_DIR}"

echo "🚀 네트워크 시작 중..."
docker compose up -d

echo ""
echo "⏳ 네트워크 초기화 대기 중..."
sleep 5

echo ""
echo "📊 네트워크 상태:"
docker compose ps

echo ""
echo "========================================"
echo "✅ 네트워크 시작 완료!"
echo "========================================"
echo ""
echo "RPC 엔드포인트: http://localhost:9545"
echo "Explorer: http://localhost:25000"
echo ""
echo "네트워크 중지: ./stop_network.sh"
echo "네트워크 재시작: ./restart_network.sh"

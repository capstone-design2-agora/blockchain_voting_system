#!/usr/bin/env bash
# 네트워크 시작 및 스마트 컨트랙트 배포 자동화 스크립트

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BLOCKCHAIN_CONTRACTS_DIR="$(realpath "${SCRIPT_DIR}/..")"
PROJECT_ROOT="$(realpath "${BLOCKCHAIN_CONTRACTS_DIR}/..")"
NETWORK_DIR="${PROJECT_ROOT}/network"
ARTIFACTS_DIR="${BLOCKCHAIN_CONTRACTS_DIR}/artifacts"
FRONTEND_DIR="${PROJECT_ROOT}/frontend"
FRONTEND_ABI_DIR="${FRONTEND_DIR}/src/abi"
FRONTEND_ENV_EXAMPLE="${FRONTEND_DIR}/.env.example"
FRONTEND_ENV_LOCAL="${FRONTEND_DIR}/.env.local"
SIMPLE_ESCROW_DEPLOY_JSON="${ARTIFACTS_DIR}/escrow_deployment.json"
# Optional deployment metadata overrides are read from deploy.env.
DEPLOY_ENV_FILE="${BLOCKCHAIN_CONTRACTS_DIR}/deploy.env"
DEPLOY_ENV_SOURCED="false"

if [[ -f "${DEPLOY_ENV_FILE}" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "${DEPLOY_ENV_FILE}"
    set +a
    DEPLOY_ENV_SOURCED="true"
fi

DEFAULT_RPC_ENDPOINT="http://localhost:9545"
DEFAULT_EXPECTED_VOTERS="${REACT_APP_EXPECTED_VOTERS:-1000}"
DEFAULT_CHAIN_ID_HEX="${REACT_APP_CHAIN_ID:-0x539}"
DEFAULT_CHAIN_NAME="${REACT_APP_CHAIN_NAME:-Quorum Local}"
DEFAULT_PROPOSALS="Alice,Bob,Charlie"

# Helper function to convert date string to Unix timestamp in nanoseconds
# Accepts format: "YYYY-MM-DD HH:MM:SS" or Unix timestamp (auto-detects seconds/nanoseconds)
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

NOW_NANOSECONDS=$(date +%s%N)
DEFAULT_BALLOT_OPEN=${BALLOT_OPENS_AT:-$NOW_NANOSECONDS}
# 1시간 = 3,600,000,000,000 나노초, 7일 = 604,800,000,000,000 나노초
DEFAULT_BALLOT_CLOSE=${BALLOT_CLOSES_AT:-$((DEFAULT_BALLOT_OPEN + 3600000000000))}
DEFAULT_BALLOT_ANNOUNCE=${BALLOT_ANNOUNCES_AT:-$((DEFAULT_BALLOT_CLOSE + 180000000000))}
DEFAULT_BALLOT_ID="${BALLOT_ID:-citizen-2025}"
DEFAULT_BALLOT_TITLE="${BALLOT_TITLE:-제 25대 대통령 선거}"
DEFAULT_BALLOT_DESCRIPTION="${BALLOT_DESCRIPTION:-대한민국 제 25대 대통령을 선출하는 공식 선거입니다.}"

# Convert date strings to timestamps if needed
DEFAULT_BALLOT_OPEN=$(date_to_timestamp "${DEFAULT_BALLOT_OPEN}")
DEFAULT_BALLOT_CLOSE=$(date_to_timestamp "${DEFAULT_BALLOT_CLOSE}")
DEFAULT_BALLOT_ANNOUNCE=$(date_to_timestamp "${DEFAULT_BALLOT_ANNOUNCE}")

# 색상 출력
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

WITH_NGROK=false
while [[ $# -gt 0 ]]; do
    case "$1" in
        --with-ngrok)
            WITH_NGROK=true
            shift
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

NGROK_HELPER="${PROJECT_ROOT}/scripts/ngrok-utils.sh"
if [[ -f "${NGROK_HELPER}" ]]; then
    # shellcheck disable=SC1090
    source "${NGROK_HELPER}"
elif [[ "${WITH_NGROK}" == "true" ]]; then
    echo -e "${RED}✗ --with-ngrok requested but ${NGROK_HELPER} is missing${NC}"
    exit 1
fi

if [[ "${DEPLOY_ENV_SOURCED}" == "true" ]]; then
    echo -e "${YELLOW}Using deployment configuration from ${DEPLOY_ENV_FILE}${NC}"
else
    echo -e "${YELLOW}No deploy.env found. Using inline defaults for deployment metadata.${NC}"
fi

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Quorum Network Setup & Deployment${NC}"
echo -e "${GREEN}========================================${NC}"

escape_sed_replacement() {
    printf '%s' "$1" | sed -e 's/[&|]/\\&/g'
}

replace_or_append_env_key() {
    local file="$1"
    local key="$2"
    local value="$3"

    mkdir -p "$(dirname "${file}")"
    touch "${file}"

    local escaped
    escaped=$(escape_sed_replacement "${value}")

    if grep -q "^${key}=" "${file}"; then
        sed -i "s|^${key}=.*$|${key}=${escaped}|" "${file}"
    else
        echo "${key}=${value}" >> "${file}"
    fi
}

sync_frontend_abi() {
    local sbt_abi="${ARTIFACTS_DIR}/CitizenSBT.abi.json"
    local voting_abi="${ARTIFACTS_DIR}/VotingWithSBT.abi.json"
    local reward_abi="${ARTIFACTS_DIR}/VotingRewardNFT.abi.json"
    local escrow_abi="${ARTIFACTS_DIR}/SimpleNFTEscrow.abi.json"
    
    if [[ ! -f "${sbt_abi}" ]] || [[ ! -f "${voting_abi}" ]] || [[ ! -f "${reward_abi}" ]]; then
        echo -e "${RED}✗ ABI files not found in ${ARTIFACTS_DIR}${NC}"
        echo -e "${YELLOW}Please compile the contracts before re-running this script.${NC}"
        exit 1
    fi

    mkdir -p "${FRONTEND_ABI_DIR}"
    cp "${sbt_abi}" "${FRONTEND_ABI_DIR}/CitizenSBT.json"
    cp "${voting_abi}" "${FRONTEND_ABI_DIR}/Voting.json"
    cp "${reward_abi}" "${FRONTEND_ABI_DIR}/VotingRewardNFT.json"
    if [[ -f "${escrow_abi}" ]]; then
        cp "${escrow_abi}" "${FRONTEND_ABI_DIR}/SimpleNFTEscrow.json"
    fi
    echo -e "${GREEN}✓ ABIs synced to frontend at ${FRONTEND_ABI_DIR}${NC}"
}

write_env_example() {
    mkdir -p "${FRONTEND_DIR}"
    cat > "${FRONTEND_ENV_EXAMPLE}" <<'EOF'
# Frontend environment template for the Quorum voting UI.
# Copy this file to .env.local and update the values before running npm start.

# RPC endpoint for the local GoQuorum network
REACT_APP_RPC=http://localhost:10545

# Deployed VotingWithNFT contract address (from blockchain_contracts/artifacts/deployment.json)
REACT_APP_VOTING_ADDRESS=<deployed-contract-address>
# Optional: multiple voting contracts (space separated)
# REACT_APP_VOTING_CONTRACT_ADDRESSES=<address-1> <address-2>

# Optional expected voter turnout baseline (used for UI percentage)
REACT_APP_EXPECTED_VOTERS=1000

# Chain metadata used for network validation in the wallet flow
REACT_APP_CHAIN_ID=0x539
REACT_APP_CHAIN_NAME=Quorum Local

# Candidate metadata shown in the UI (comma separated names, pledges match deploy.env format)
REACT_APP_PROPOSAL_NAMES=Alice,Bob,Charlie
REACT_APP_PROPOSAL_PLEDGES=예산 투명성 강화|거버넌스 참여 확대|실시간 집계 공개;UX 혁신|모바일 최적화|다국어 지원;보안 점검 강화|이중 인증|사고 대응 체계
EOF
    echo -e "${GREEN}✓ Generated frontend/.env.example template${NC}"
}

ensure_env_template() {
    if [[ ! -f "${FRONTEND_ENV_EXAMPLE}" ]]; then
        write_env_example
    fi
}

ensure_env_file_exists() {
    local target="$1"
    ensure_env_template
    if [[ ! -f "${target}" ]]; then
        cp "${FRONTEND_ENV_EXAMPLE}" "${target}"
        echo -e "${GREEN}✓ Created ${target} from template${NC}"
    fi
}

sync_frontend_env_files() {
    local citizen_sbt_address="$1"
    local voting_address="$2"
    local reward_nft_address="$3"
    local verifier_address="$4"
    local escrow_address="$5"
    local voting_addresses_all="$6"

    ensure_env_template
    ensure_env_file_exists "${FRONTEND_ENV_LOCAL}"

    local sbt_value="${citizen_sbt_address:-<deployed-sbt-address>}"
    local voting_value="${voting_address:-<deployed-voting-address>}"
    local reward_value="${reward_nft_address:-<deployed-reward-address>}"
    local verifier_value="${verifier_address:-<deployed-verifier-address>}"

    replace_or_append_env_key "${FRONTEND_ENV_LOCAL}" "REACT_APP_RPC" "${DEFAULT_RPC_ENDPOINT}"
    replace_or_append_env_key "${FRONTEND_ENV_LOCAL}" "REACT_APP_EXPECTED_VOTERS" "${DEFAULT_EXPECTED_VOTERS}"
    replace_or_append_env_key "${FRONTEND_ENV_LOCAL}" "REACT_APP_CHAIN_ID" "${DEFAULT_CHAIN_ID_HEX}"
    replace_or_append_env_key "${FRONTEND_ENV_LOCAL}" "REACT_APP_CHAIN_NAME" "${DEFAULT_CHAIN_NAME}"
    replace_or_append_env_key "${FRONTEND_ENV_LOCAL}" "REACT_APP_CITIZEN_SBT_ADDRESS" "${sbt_value}"
    replace_or_append_env_key "${FRONTEND_ENV_LOCAL}" "REACT_APP_VOTING_CONTRACT_ADDRESS" "${voting_value}"
    replace_or_append_env_key "${FRONTEND_ENV_LOCAL}" "REACT_APP_REWARD_NFT_ADDRESS" "${reward_value}"
    replace_or_append_env_key "${FRONTEND_ENV_LOCAL}" "REACT_APP_VERIFIER_ADDRESS" "${verifier_value}"
    replace_or_append_env_key "${FRONTEND_ENV_LOCAL}" "REACT_APP_SIMPLE_ESCROW_ADDRESS" "${escrow_address:-<escrow-address>}"
    replace_or_append_env_key "${FRONTEND_ENV_LOCAL}" "REACT_APP_PROPOSAL_NAMES" "${PROPOSALS:-}"
    replace_or_append_env_key "${FRONTEND_ENV_LOCAL}" "REACT_APP_PROPOSAL_PLEDGES" "${PLEDGES:-}"
    if [[ -n "${voting_addresses_all:-}" ]]; then
        replace_or_append_env_key "${FRONTEND_ENV_LOCAL}" "REACT_APP_VOTING_CONTRACT_ADDRESSES" "${voting_addresses_all}"
    fi

    echo -e "${GREEN}✓ Updated frontend .env.local with contract metadata${NC}"
}

update_frontend_config_json() {
    local citizen_sbt_address="$1"
    local voting_address="$2"
    local reward_nft_address="$3"
    local verifier_address="$4"
    local escrow_address="$5"
    local voting_addresses_json="$6"
    local config_file="${FRONTEND_DIR}/public/config.json"

    mkdir -p "$(dirname "${config_file}")"

    if [[ -z "${voting_addresses_json:-}" ]]; then
        if [[ -n "${voting_address}" ]]; then
            voting_addresses_json="[\"${voting_address}\"]"
        else
            voting_addresses_json="[]"
        fi
    fi

    # Create JSON content
    cat > "${config_file}" <<EOF
{
  "CITIZEN_SBT_ADDRESS": "${citizen_sbt_address}",
  "VOTING_CONTRACT_ADDRESS": "${voting_address}",
  "VOTING_CONTRACT_ADDRESSES": ${voting_addresses_json},
  "REWARD_NFT_ADDRESS": "${reward_nft_address}",
  "SIMPLE_ESCROW_ADDRESS": "${escrow_address}",
  "VERIFIER_ADDRESS": "${verifier_address}",
  "RPC_URL": "${DEFAULT_RPC_ENDPOINT}",
  "CHAIN_ID": "${DEFAULT_CHAIN_ID_HEX}",
  "CHAIN_NAME": "${DEFAULT_CHAIN_NAME}",
  "EXPECTED_VOTERS": ${DEFAULT_EXPECTED_VOTERS}
}
EOF
    echo -e "${GREEN}✓ Updated frontend/public/config.json with contract metadata${NC}"
}

# Helper to resolve ballot-scoped variables with optional numeric suffix
get_ballot_var() {
    local field="$1"    # e.g., ID, TITLE, OPENS_AT
    local suffix="$2"   # "" or "2", "3" ...
    local fallback="$3"
    local key=""
    if [[ -z "$suffix" ]]; then
        key="BALLOT_${field}"
    else
        key="BALLOT${suffix}_${field}"
    fi
    local value="${!key:-}"
    if [[ -z "$value" ]]; then
        echo "$fallback"
    else
        echo "$value"
    fi
}

serialize_json_array() {
    if [[ $# -eq 0 ]]; then
        echo "[]"
        return
    fi
    local joined=""
    for item in "$@"; do
        [[ -z "$item" ]] && continue
        joined+=$(printf '"%s",' "$item")
    done
    if [[ -z "$joined" ]]; then
        echo "[]"
    else
        echo "[${joined%,}]"
    fi
}

# 1. 합의 알고리즘 확인
echo -e "\n${YELLOW}[1/6] Checking consensus algorithm...${NC}"
if [[ ! -f "${NETWORK_DIR}/.env" ]]; then
    echo -e "${RED}✗ .env file not found in network/${NC}"
    echo -e "${YELLOW}Please copy .env.example or create .env file with GOQUORUM_CONS_ALGO${NC}"
    echo -e "${YELLOW}Example: GOQUORUM_CONS_ALGO=raft${NC}"
    exit 1
fi

CONSENSUS=$(grep "^GOQUORUM_CONS_ALGO=" "${NETWORK_DIR}/.env" | cut -d= -f2)
if [[ -z "$CONSENSUS" ]]; then
    echo -e "${RED}✗ GOQUORUM_CONS_ALGO not set in .env${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Consensus algorithm: ${CONSENSUS}${NC}"

# 합의 알고리즘 변경 경고
if [[ -f "${ARTIFACTS_DIR}/sbt_deployment.json" ]]; then
    LAST_CONSENSUS=$(node -p "try { require('${ARTIFACTS_DIR}/sbt_deployment.json').network.consensus || '' } catch(e) { '' }" 2>/dev/null || echo "")
    if [[ -n "$LAST_CONSENSUS" ]] && [[ "$LAST_CONSENSUS" != "$CONSENSUS" ]]; then
        echo -e "${RED}⚠ WARNING: Consensus algorithm changed from ${LAST_CONSENSUS} to ${CONSENSUS}${NC}"
        echo -e "${YELLOW}You must reset the blockchain data:${NC}"
        echo -e "${YELLOW}  cd network && docker-compose down -v && docker-compose up -d${NC}"
        echo -e "${YELLOW}Press Ctrl+C to abort, or wait 5 seconds to continue...${NC}"
        sleep 5
    fi
fi

# Docker Compose 명령어 감지
if docker compose version &>/dev/null; then
    DOCKER_COMPOSE="docker compose"
elif command -v docker-compose &>/dev/null; then
    DOCKER_COMPOSE="docker-compose"
else
    echo -e "${RED}✗ Neither 'docker compose' nor 'docker-compose' found${NC}"
    exit 1
fi

# 2. 네트워크 상태 확인
echo -e "\n${YELLOW}[2/6] Checking network status...${NC}"
cd "${NETWORK_DIR}"

if $DOCKER_COMPOSE ps 2>/dev/null | grep -q "validator1.*Up"; then
    echo -e "${GREEN}✓ Network is already running${NC}"
else
    echo -e "${YELLOW}Starting network...${NC}"
    $DOCKER_COMPOSE up -d
    
    # 네트워크가 완전히 시작될 때까지 대기
    echo -e "${YELLOW}Waiting for network to be ready...${NC}"
    sleep 10
    
    # 노드 상태 확인
    MAX_RETRIES=30
    RETRY=0
    while [ $RETRY -lt $MAX_RETRIES ]; do
        if curl -s -X POST "${DEFAULT_RPC_ENDPOINT}" \
            -H "Content-Type: application/json" \
            --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
            > /dev/null 2>&1; then
            echo -e "${GREEN}✓ Network is ready${NC}"
            break
        fi
        RETRY=$((RETRY+1))
        echo -n "."
        sleep 2
    done
    
    if [ $RETRY -eq $MAX_RETRIES ]; then
        echo -e "\n${RED}✗ Network failed to start on ${DEFAULT_RPC_ENDPOINT}${NC}"
        exit 1
    fi
fi

EFFECTIVE_RPC_ENDPOINT="${DEFAULT_RPC_ENDPOINT}"
if [[ "${WITH_NGROK}" == "true" ]]; then
    if ! declare -f ngrok_start_rpc_tunnel >/dev/null 2>&1; then
        echo -e "${RED}✗ ngrok helper not loaded; cannot start tunnel${NC}"
        exit 1
    fi
    if NGROK_RPC_VALUE=$(ngrok_start_rpc_tunnel "${NGROK_DEFAULT_PORT}"); then
        EFFECTIVE_RPC_ENDPOINT="${NGROK_RPC_VALUE}"
        ngrok_update_root_rpc_url "${EFFECTIVE_RPC_ENDPOINT}"
        if [[ -f "${NGROK_TUNNEL_STATE_FILE}" ]]; then
            # shellcheck disable=SC1090
            source "${NGROK_TUNNEL_STATE_FILE}"
            echo -e "${GREEN}✓ ngrok tunnel ready${NC}"
            echo -e "${GREEN}  Public URL:${NC} ${NGROK_PUBLIC_URL}"
            echo -e "${GREEN}  Basic Auth:${NC} ${NGROK_USERNAME}:${NGROK_PASSWORD}"
        fi
    else
        echo -e "${RED}✗ Failed to start ngrok tunnel${NC}"
        exit 1
    fi
elif declare -f ngrok_update_root_rpc_url >/dev/null 2>&1; then
    ngrok_update_root_rpc_url "${DEFAULT_RPC_ENDPOINT}"
else
    replace_or_append_env_key "${PROJECT_ROOT}/.env" "RPC_URL" "${DEFAULT_RPC_ENDPOINT}"
fi

# 3. Node.js 의존성 확인
echo -e "\n${YELLOW}[3/6] Checking Node.js dependencies...${NC}"
cd "${SCRIPT_DIR}"

if [[ ! -d "node_modules" ]]; then
    echo -e "${YELLOW}Installing Node.js dependencies...${NC}"
    npm install solc@0.8.20 web3@1.10.2 @openzeppelin/contracts@5.0.0
else
    echo -e "${GREEN}✓ Node.js dependencies already installed${NC}"
fi

# 4. Python 의존성 확인
echo -e "\n${YELLOW}[4/6] Checking Python dependencies...${NC}"

if ! python3 -c "import web3" 2>/dev/null; then
    echo -e "${YELLOW}Installing Python dependencies...${NC}"
    pip3 install web3 eth-account python-dotenv 2>&1 | grep -v "Requirement already satisfied" || true
else
    echo -e "${GREEN}✓ Python dependencies already installed${NC}"
fi

# 5. 스마트 컨트랙트 배포 확인
echo -e "\n${YELLOW}[5/6] Checking smart contract deployment...${NC}"

SHOULD_DEPLOY=false

if [[ -f "${ARTIFACTS_DIR}/sbt_deployment.json" ]]; then
    echo -e "${YELLOW}Found existing sbt_deployment.json${NC}"
    
    # 배포된 컨트랙트가 실제로 존재하는지 확인
    CITIZEN_SBT_ADDRESS=$(node -p "require('${ARTIFACTS_DIR}/sbt_deployment.json').contracts.CitizenSBT.address")
    
    RESPONSE=$(curl -s -X POST "${DEFAULT_RPC_ENDPOINT}" \
        -H "Content-Type: application/json" \
        --data "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getCode\",\"params\":[\"${CITIZEN_SBT_ADDRESS}\",\"latest\"],\"id\":1}")
    
    CODE=$(echo "$RESPONSE" | node -p "JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8')).result")
    
    if [[ "$CODE" == "0x" ]]; then
        echo -e "${YELLOW}Contract not found on blockchain. Will redeploy.${NC}"
        SHOULD_DEPLOY=true
    else
        echo -e "${GREEN}✓ Contracts are deployed${NC}"
        echo -e "${GREEN}  CitizenSBT: ${CITIZEN_SBT_ADDRESS}${NC}"
    fi
else
    echo -e "${YELLOW}No sbt_deployment.json found. Will deploy contracts.${NC}"
    SHOULD_DEPLOY=true
fi

# 6. 스마트 컨트랙트 배포
if [ "$SHOULD_DEPLOY" = true ]; then
    echo -e "\n${YELLOW}[6/6] Deploying SBT system contracts...${NC}"

    if [[ -z "${PROPOSALS:-}" ]]; then
        PROPOSALS="${DEFAULT_PROPOSALS}"
    fi
    if [[ -z "${BALLOT_ID:-}" ]]; then
        BALLOT_ID="${DEFAULT_BALLOT_ID}"
    fi
    if [[ -z "${BALLOT_TITLE:-}" ]]; then
        BALLOT_TITLE="${DEFAULT_BALLOT_TITLE}"
    fi
    if [[ -z "${BALLOT_DESCRIPTION:-}" ]]; then
        BALLOT_DESCRIPTION="${DEFAULT_BALLOT_DESCRIPTION}"
    fi
    if [[ -z "${BALLOT_OPENS_AT:-}" ]]; then
        BALLOT_OPENS_AT="${DEFAULT_BALLOT_OPEN}"
    else
        BALLOT_OPENS_AT=$(date_to_timestamp "${BALLOT_OPENS_AT}")
    fi
    if [[ -z "${BALLOT_CLOSES_AT:-}" ]]; then
        BALLOT_CLOSES_AT="${DEFAULT_BALLOT_CLOSE}"
    else
        BALLOT_CLOSES_AT=$(date_to_timestamp "${BALLOT_CLOSES_AT}")
    fi
    if [[ -z "${BALLOT_ANNOUNCES_AT:-}" ]]; then
        BALLOT_ANNOUNCES_AT="${DEFAULT_BALLOT_ANNOUNCE}"
    else
        BALLOT_ANNOUNCES_AT=$(date_to_timestamp "${BALLOT_ANNOUNCES_AT}")
    fi
    if [[ -z "${BALLOT_EXPECTED_VOTERS:-}" ]]; then
        BALLOT_EXPECTED_VOTERS="${DEFAULT_EXPECTED_VOTERS}"
    fi

    export PROPOSALS BALLOT_ID BALLOT_TITLE BALLOT_DESCRIPTION
    export BALLOT_OPENS_AT BALLOT_CLOSES_AT BALLOT_ANNOUNCES_AT BALLOT_EXPECTED_VOTERS
    export GOQUORUM_CONS_ALGO="${CONSENSUS}"

    # Generate NFT metadata if configured
    if [[ -n "${NFT_NAME:-}" ]] && [[ -n "${MASCOT_CID:-}" ]] && [[ -n "${PINATA_API_KEY:-}" ]] && [[ -n "${PINATA_SECRET_KEY:-}" ]]; then
        echo -e "${YELLOW}Generating NFT metadata from image CID...${NC}"
        # Run metadata generator
        node "${PROJECT_ROOT}/scripts/generate_nft_metadata.js" \
            --image "${MASCOT_CID}" \
            --ballot "${BALLOT_ID}" \
            --name "${NFT_NAME}"
        
        if [[ -f ".last_metadata_cid" ]]; then
            METADATA_CID=$(cat ".last_metadata_cid")
            rm ".last_metadata_cid"
            echo -e "${GREEN}✓ Metadata generated: ${METADATA_CID}${NC}"
            echo -e "${YELLOW}  Overriding MASCOT_CID with metadata CID${NC}"
            export MASCOT_CID="${METADATA_CID}"
        else
            echo -e "${RED}✗ Metadata generation failed (CID file not found)${NC}"
            echo -e "${YELLOW}  Using original MASCOT_CID (image)${NC}"
        fi
    elif [[ -n "${NFT_NAME:-}" ]] && [[ -n "${MASCOT_CID:-}" ]]; then
        echo -e "${YELLOW}⚠️  NFT_NAME set but missing Pinata keys${NC}"
        echo -e "${YELLOW}  Using MASCOT_CID as-is (no metadata generation)${NC}"
    elif [[ -n "${MASCOT_CID:-}" ]]; then
        echo -e "${YELLOW}Using MASCOT_CID from deploy.env${NC}"
    fi

    node "${SCRIPT_DIR}/deploy_sbt_system.js"
    
    if [[ -f "${ARTIFACTS_DIR}/sbt_deployment.json" ]]; then
        CITIZEN_SBT_ADDRESS=$(node -p "require('${ARTIFACTS_DIR}/sbt_deployment.json').contracts.CitizenSBT.address")
        VOTING_ADDRESS=$(node -p "require('${ARTIFACTS_DIR}/sbt_deployment.json').contracts.VotingWithSBT.address")
        REWARD_NFT_ADDRESS=$(node -p "require('${ARTIFACTS_DIR}/sbt_deployment.json').contracts.VotingRewardNFT.address")
        VERIFIER_ADDRESS=$(node -p "require('${ARTIFACTS_DIR}/sbt_deployment.json').contracts.CitizenSBT.verifier")
        echo -e "${GREEN}✓ SBT system deployed successfully${NC}"
        echo -e "${GREEN}  CitizenSBT: ${CITIZEN_SBT_ADDRESS}${NC}"
        echo -e "${GREEN}  VotingWithSBT: ${VOTING_ADDRESS}${NC}"
        echo -e "${GREEN}  VotingRewardNFT: ${REWARD_NFT_ADDRESS}${NC}"
    else
        echo -e "${RED}✗ Deployment failed${NC}"
        exit 1
    fi
else
    echo -e "\n${YELLOW}[6/6] Skipping deployment (contracts already exist)${NC}"
fi

echo -e "\n${YELLOW}[6b] Deploying SimpleNFTEscrow via Hardhat...${NC}"
cd "${BLOCKCHAIN_CONTRACTS_DIR}"
npx hardhat run scripts/deploy_simple_escrow.js --network localhost
cd "${SCRIPT_DIR}"

echo -e "\n${YELLOW}Syncing ABI with frontend...${NC}"
sync_frontend_abi

CITIZEN_SBT_ADDRESS=$(node -p "try { require('${ARTIFACTS_DIR}/sbt_deployment.json').contracts.CitizenSBT.address || '' } catch(e) { '' }")
VOTING_ADDRESS=$(node -p "try { require('${ARTIFACTS_DIR}/sbt_deployment.json').contracts.VotingWithSBT.address || '' } catch(e) { '' }")
REWARD_NFT_ADDRESS=$(node -p "try { require('${ARTIFACTS_DIR}/sbt_deployment.json').contracts.VotingRewardNFT.address || '' } catch(e) { '' }")
VERIFIER_ADDRESS=$(node -p "try { require('${ARTIFACTS_DIR}/sbt_deployment.json').contracts.CitizenSBT.verifier || '' } catch(e) { '' }")
SIMPLE_ESCROW_ADDRESS=$(node -p "try { require('${ARTIFACTS_DIR}/escrow_deployment.json').address || '' } catch(e) { '' }")
VOTING_ADDRESSES=()
if [[ -n "${VOTING_ADDRESS}" ]]; then
    VOTING_ADDRESSES+=("${VOTING_ADDRESS}")
fi

deploy_additional_ballot() {
    local suffix="$1"
    echo -e "\n${YELLOW}→ Deploying additional VotingWithSBT for BALLOT${suffix:-1}${NC}"
    export BALLOT_ID="$(get_ballot_var ID "${suffix}" "${BALLOT_ID:-$DEFAULT_BALLOT_ID}")"
    export BALLOT_TITLE="$(get_ballot_var TITLE "${suffix}" "${BALLOT_TITLE:-$DEFAULT_BALLOT_TITLE}")"
    export BALLOT_DESCRIPTION="$(get_ballot_var DESCRIPTION "${suffix}" "${BALLOT_DESCRIPTION:-$DEFAULT_BALLOT_DESCRIPTION}")"
    export BALLOT_OPENS_AT=$(date_to_timestamp "$(get_ballot_var OPENS_AT "${suffix}" "${BALLOT_OPENS_AT:-$DEFAULT_BALLOT_OPEN}")")
    export BALLOT_CLOSES_AT=$(date_to_timestamp "$(get_ballot_var CLOSES_AT "${suffix}" "${BALLOT_CLOSES_AT:-$DEFAULT_BALLOT_CLOSE}")")
    export BALLOT_ANNOUNCES_AT=$(date_to_timestamp "$(get_ballot_var ANNOUNCES_AT "${suffix}" "${BALLOT_ANNOUNCES_AT:-$DEFAULT_BALLOT_ANNOUNCE}")")
    export BALLOT_EXPECTED_VOTERS="$(get_ballot_var EXPECTED_VOTERS "${suffix}" "${BALLOT_EXPECTED_VOTERS:-$DEFAULT_EXPECTED_VOTERS}")"
    export PROPOSALS="$(get_ballot_var PROPOSALS "${suffix}" "${PROPOSALS:-$DEFAULT_PROPOSALS}")"
    export PLEDGES="$(get_ballot_var PLEDGES "${suffix}" "${PLEDGES:-}")"

    local mascot_cid="${MASCOT_CID:-}"
    local nft_name_local="${NFT_NAME:-}"
    if [[ -n "${suffix}" ]]; then
        local mascot_var="MASCOT${suffix}_CID"
        local nftname_var="NFT${suffix}_NAME"
        mascot_cid="${!mascot_var:-$mascot_cid}"
        nft_name_local="${!nftname_var:-$nft_name_local}"
    fi
    export MASCOT_CID="${mascot_cid}"
    export NFT_NAME="${nft_name_local}"

    node "${SCRIPT_DIR}/redeploy_voting_contract.js"
    local new_address
    new_address=$(node -p "try { require('${ARTIFACTS_DIR}/sbt_deployment.json').contracts.VotingWithSBT.address || '' } catch(e) { '' }")
    if [[ -z "${new_address}" ]]; then
        echo -e "${RED}✗ Failed to read new VotingWithSBT address for BALLOT${suffix:-1}${NC}"
        exit 1
    fi
    VOTING_ADDRESSES+=("${new_address}")
    echo -e "${GREEN}✓ VotingWithSBT deployed for BALLOT${suffix:-1}: ${new_address}${NC}"
}

BALLOT_SUFFIXES=()
for n in 2 3 4 5; do
    if env | grep -q "^BALLOT${n}_ID="; then
        BALLOT_SUFFIXES+=("${n}")
    fi
done

if [[ ${#BALLOT_SUFFIXES[@]} -gt 0 ]]; then
    echo -e "\n${YELLOW}Deploying additional ballots defined in deploy.env...${NC}"
    for suffix in "${BALLOT_SUFFIXES[@]}"; do
        deploy_additional_ballot "${suffix}"
    done
fi

PRIMARY_VOTING_ADDRESS="${VOTING_ADDRESSES[0]:-${VOTING_ADDRESS:-}}"
VOTING_ADDRESSES_JSON=$(serialize_json_array "${VOTING_ADDRESSES[@]}")
VOTING_ADDRESSES_ENV="${VOTING_ADDRESSES[*]}"

if [[ -z "${CITIZEN_SBT_ADDRESS}" ]]; then
    echo -e "${YELLOW}Deployment addresses not found. Frontend env files will contain placeholders until deployment succeeds.${NC}"
fi
sync_frontend_env_files "${CITIZEN_SBT_ADDRESS}" "${PRIMARY_VOTING_ADDRESS}" "${REWARD_NFT_ADDRESS}" "${VERIFIER_ADDRESS}" "${SIMPLE_ESCROW_ADDRESS}" "${VOTING_ADDRESSES_ENV}"
update_frontend_config_json "${CITIZEN_SBT_ADDRESS}" "${PRIMARY_VOTING_ADDRESS}" "${REWARD_NFT_ADDRESS}" "${VERIFIER_ADDRESS}" "${SIMPLE_ESCROW_ADDRESS}" "${VOTING_ADDRESSES_JSON}"

# Write/refresh indexer env file (preserve existing values if present)
INDEXER_ENV_FILE="${PROJECT_ROOT}/scripts/indexer.env"
read_env_var() {
  local file="$1"; local key="$2"; local fallback="$3"
  if [[ -f "$file" ]] && grep -q "^${key}=" "$file"; then
    grep "^${key}=" "$file" | head -n1 | cut -d '=' -f2-
  else
    echo "$fallback"
  fi
}
EXISTING_SUPABASE_URL=$(read_env_var "$INDEXER_ENV_FILE" "SUPABASE_URL" "${SUPABASE_URL:-<supabase-url>}")
EXISTING_SUPABASE_KEY=$(read_env_var "$INDEXER_ENV_FILE" "SUPABASE_SERVICE_KEY" "${SUPABASE_SERVICE_KEY:-<supabase-service-key>}")

cat > "${INDEXER_ENV_FILE}" <<EOF
# Escrow indexer environment
RPC_URL=${EFFECTIVE_RPC_ENDPOINT}
SIMPLE_ESCROW_ADDRESS=${SIMPLE_ESCROW_ADDRESS}
SUPABASE_URL=${EXISTING_SUPABASE_URL}
SUPABASE_SERVICE_KEY=${EXISTING_SUPABASE_KEY}
# Optional: START_BLOCK=0
EOF
echo -e "${GREEN}✓ Wrote indexer env to ${INDEXER_ENV_FILE}${NC}"

# 완료
echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}  Setup Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Network:${NC} ${CONSENSUS}"
if [[ "${WITH_NGROK}" == "true" ]]; then
    echo -e "${GREEN}RPC Endpoint (public):${NC} ${EFFECTIVE_RPC_ENDPOINT}"
    echo -e "${GREEN}RPC Endpoint (local):${NC} ${DEFAULT_RPC_ENDPOINT}"
else
    echo -e "${GREEN}RPC Endpoint:${NC} ${EFFECTIVE_RPC_ENDPOINT}"
fi
echo -e "${GREEN}CitizenSBT:${NC} ${CITIZEN_SBT_ADDRESS:-N/A}"
echo -e "${GREEN}VotingWithSBT:${NC} ${PRIMARY_VOTING_ADDRESS:-N/A}"
if [[ ${#VOTING_ADDRESSES[@]} -gt 1 ]]; then
    echo -e "${GREEN}VotingWithSBT (all):${NC} ${VOTING_ADDRESSES[*]}"
fi
echo -e "${GREEN}VotingRewardNFT:${NC} ${REWARD_NFT_ADDRESS:-N/A}"
echo -e "${GREEN}SimpleNFTEscrow:${NC} ${SIMPLE_ESCROW_ADDRESS:-N/A}"
echo -e "${GREEN}Artifacts:${NC} ${ARTIFACTS_DIR}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo -e "  1. Test SBT system: ${GREEN}cd blockchain_contracts && node verify_sbt.js${NC}"
echo -e "  2. Check network: ${GREEN}cd network && docker compose ps${NC}"
echo -e "  3. View logs: ${GREEN}cd network && docker compose logs -f validator1${NC}"
echo ""

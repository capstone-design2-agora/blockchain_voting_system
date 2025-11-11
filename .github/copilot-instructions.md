## 목적

이 파일은 이 저장소에서 AI 기반 코딩 에이전트(Copilot 등)가 즉시 생산적으로 작업할 수 있도록 핵심 컨텍스트, 규칙, 실행 명령, 그리고 코드 위치를 빠르게 안내합니다. 아래 지침은 실제 파일과 스크립트에서 발견 가능한 패턴만을 기반으로 합니다.

## 한 줄 개요

- 목적: Quorum 테스트 네트워크를 사용한 블록체인 투표 웹앱 실행
- 아키텍처: Docker 기반 GoQuorum 네트워크(`network`) + SBT 기반 컨트랙트 시스템(`blockchain_contracts`) + React UI(`frontend`)
- 스마트컨트랙트 3종: `CitizenSBT.sol` (신원검증), `VotingWithSBT.sol` (투표), `VotingRewardNFT.sol` (리워드)

## 핵심 실행 흐름 (개발자 워크플로우)

### 통합 배포 흐름 (권장)
`./scripts/setup_and_deploy.sh`가 네트워크 시작, 컨트랙트 배포, 프론트엔드 환경 구성을 모두 처리합니다.

```bash
cd blockchain_contracts
./scripts/setup_and_deploy.sh
```

이 스크립트가 자동으로:
1. Quorum 네트워크 상태 확인 (없으면 `network`에서 Docker 컨테이너 시작)
2. Node.js & Python 의존성 확인
3. 3개 컨트랙트 배포 (CitizenSBT, VotingWithSBT, VotingRewardNFT)
4. 배포 결과 저장: `blockchain_contracts/artifacts/sbt_deployment.json`
5. ABI 동기화: `frontend/src/abi/` 에 JSON 복사
6. 프론트엔드 환경 파일 자동 생성/갱신: `frontend/.env` 및 `.env.local`

### 프론트엔드 실행
```bash
cd frontend
npm install
npm start  # localhost:3000 에서 실행, MetaMask 연결 후 투표 진행
```

### 수동 배포 흐름 (고급)
- 컨트랙트만 재배포: 
  ```bash
  cd blockchain_contracts
  cp deploy.env.example deploy.env  # 투표 일정, 후보 등 설정
  node deploy_sbt_system.js
  ```
- 환경 파일 수동 갱신:
  ```bash
  # frontend/.env.local 또는 .env 파일에 아래 설정
  REACT_APP_RPC=http://localhost:10545
  REACT_APP_CITIZEN_SBT_ADDRESS=0x...  # sbt_deployment.json에서 복사
  REACT_APP_VOTING_CONTRACT_ADDRESS=0x...
  REACT_APP_REWARD_NFT_ADDRESS=0x...
  REACT_APP_VERIFIER_ADDRESS=0x...  # CitizenSBT의 verifier
  ```

## 프로젝트 특이 패턴 및 규칙 (AI가 알아야 할 것)

### 3-컨트랙트 아키텍처 (SBT 기반 투표)
- **CitizenSBT** (`CitizenSBT.sol`): 신원 검증 및 지갑 바인딩. 각 유권자마다 비이전 SBT(Soulbound Token) 발급.
  - 주요 함수: `mint(address to)`, `isCitizen(address account)`, `verifier` (검증자 주소)
  - 배포 완료 후 주소 저장: `sbt_deployment.json` > `contracts.CitizenSBT.address`
  
- **VotingWithSBT** (`VotingWithSBT.sol`): 투표 컨트랙트. CitizenSBT 소유자만 투표 가능.
  - 주요 함수: `vote(uint256 proposalId)`, `getResults()`, `getVoteCount(uint256 proposalId)`
  - 초기화 파라미터: `proposals[]` (후보 목록), 투표 일정 (nanoseconds)
  
- **VotingRewardNFT** (`VotingRewardNFT.sol`): 투표 참여 보상 NFT. 이전 가능한 ERC-721.
  - 주요 함수: `issueReward(address voter, string memory metadataURI)`

### 환경변수 및 타임스탬프
- **RPC 엔드포인트**: 기본값 `http://localhost:10545` (env: `REACT_APP_RPC`)
- **Quorum의 타임스탐프**: 나노초 단위 (1초 = 1,000,000,000 ns). `setup_and_deploy.sh`의 `date_to_timestamp()` 함수로 자동 변환.
  - 예: 투표 일정 설정 시 `BALLOT_OPENS_AT="2025-11-11 15:00:00"` 형식 사용 가능
- **환경변수 우선순위 예**: `deploy_sbt_system.js`는 `PROPOSALS`, `BALLOT_ID`, `BALLOT_TITLE`, `BALLOT_OPENS_AT` 등을 참고. `deploy.env`에서 설정하면 `setup_and_deploy.sh`가 읽음.

### ABI 및 아티팩트 동기화
- **단일 소스 오브 트루스**: `blockchain_contracts/artifacts/sbt_deployment.json`
  - 구조:
    ```json
    {
      "contracts": {
        "CitizenSBT": { "address": "0x...", "abi": [...] },
        "VotingWithSBT": { "address": "0x...", "abi": [...] },
        "VotingRewardNFT": { "address": "0x...", "abi": [...] }
      },
      "network": { "rpcUrl": "http://localhost:9545", "consensus": "qbft", ... }
    }
    ```
- **프론트엔드 ABI 경로**: `frontend/src/abi/`
  - `CitizenSBT.json` / `Voting.json` / `VotingRewardNFT.json`
  - `setup_and_deploy.sh`가 자동으로 동기화
  
- **프론트엔드 환경 파일**: `frontend/.env` 또는 `frontend/.env.local`
  - `setup_and_deploy.sh`가 자동으로 생성/갱신
  - 키: `REACT_APP_RPC`, `REACT_APP_CITIZEN_SBT_ADDRESS`, `REACT_APP_VOTING_CONTRACT_ADDRESS`, `REACT_APP_REWARD_NFT_ADDRESS`, `REACT_APP_VERIFIER_ADDRESS`

### 컴파일 설정 (수정 금지)
- Solidity 컴파일러: `solc@0.8.20`
- 옵션: optimizer enabled (`runs: 200`), EVM version `london`
- 위치: `deploy_sbt_system.js` 라인 ~65

## 변경/수정 시 주의사항 (안전 장치)

1. **합의 알고리즘 변경**: 데이터 초기화(볼륨 삭제) 필수
   - `cd network && docker-compose down -v` 후 `.env`에서 `GOQUORUM_CONS_ALGO` 변경 (raft/qbft/ibft)
   - 단순 재시작(`docker-compose restart`)으로는 genesis가 재적용되지 않음

2. **컨트랙트 주소 관리**: 단일 소스 오브 트루스는 `blockchain_contracts/artifacts/sbt_deployment.json`
   - 프론트엔드, 배포 스크립트, 환경 파일 모두 이 파일을 참고
   - 수동으로 여러 위치를 변경하지 말 것

3. **배포 실패 시 확인 사항**:
   - RPC 접근 가능 여부: `curl -X POST http://localhost:9545 -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'`
   - 언락된 계정 확인: `node -e "const Web3 = require('web3'); const w3 = new Web3('http://localhost:9545'); w3.eth.getAccounts().then(console.log)"`
   - 네트워크 상태: `cd network && docker-compose ps`

## 빠른 예시(작업 단위)

### 전체 시스템 처음부터 시작
```bash
# 1. 네트워크 시작 + 컨트랙트 배포 + 환경 구성 (한 번에)
cd blockchain_contracts
./scripts/setup_and_deploy.sh

# 2. 프론트엔드 실행 (다른 터미널에서)
cd frontend
npm install
npm start  # localhost:3000 에서 실행
```

### 새 투표 이벤트 배포 (후보 또는 일정 변경)
```bash
cd blockchain_contracts
cp deploy.env.example deploy.env
# deploy.env 편집: PROPOSALS, BALLOT_TITLE, BALLOT_OPENS_AT 등
./scripts/redeploy_sbt_system.sh  # 새 컨트랙트 배포 및 환경파일 갱신
```

### 프로덕션 빌드
```bash
cd frontend
npm run build  # build/ 폴더에 최적화된 정적파일 생성
npx serve -s build  # 배포용 빌드 로컬 테스트
```

## 주요 파일 및 경로(참고용)

- 프로젝트 루트 README: `/README.md` (큰 그림과 실험 재현 방법)
- 프론트엔드 실행 가이드: `/frontend/RUN_GUIDE.md` 및 `/frontend/package.json`
- 배포 자동화 / 배포 템플릿: `/blockchain_contracts/scripts/setup_and_deploy.sh` (초기 배포), `/blockchain_contracts/scripts/redeploy_sbt_system.sh` (재배포), `/blockchain_contracts/scripts/deploy_sbt_system.js`, `/blockchain_contracts/deploy.env.example`
- 네트워크 실행: `/network/docker-compose.yml`
- 스마트컨트랙트 소스: `/blockchain_contracts/contracts/` (CitizenSBT.sol, VotingWithSBT.sol, VotingRewardNFT.sol)
- 산출물/ABI: `/blockchain_contracts/artifacts/sbt_deployment.json`, `/frontend/src/abi/`

## 작업 제약 (AI 에이전트가 지켜야 할 룰)

1. 변경 제안 시 항상 관련 환경 파일(`deploy.env`, `.env.local`)과 `artifacts/deployment.json`의 연계성을 검증할 것.
2. 합의 알고리즘·네트워크 관련 변경(예: genesis, docker-compose)은 수동으로 진행하거나 사용자에게 사전 승인 요청을 할 것 — 데이터 초기화 위험이 있음.
3. 프론트엔드/컨트랙트 간 주소/ABI 충돌을 막기 위해, 배포 이후에는 `blockchain_contracts/artifacts/deployment.json`을 단일 소스 오브 트루스로 사용할 것.

## 피드백 요청

이 항목을 검토하고 추가로 포함시킬 파일/명령(예: CI, 비밀관리, 특정 포트/계정 정보)이 있으면 알려주세요. 수정 요청을 반영해 바로 업데이트하겠습니다.

````markdown
# Blockchain-Based Voting System with SBT

이 저장소는 **SBT(Soulbound Token) 기반 신원 검증**을 활용한 블록체인 투표 시스템입니다. Quorum 네트워크에서 시민권 검증, 투표, 그리고 참여 보상 NFT 발급까지 완전한 투표 프로세스를 구현합니다.

## ⚡ 빠른 시작

```bash
# 1. 저장소 클론
git clone https://github.com/capstone-design2-agora/blockchain_voting_system.git
cd blockchain_voting_system

# 2. 사전 요구사항 확인
# - Docker & Docker Compose
# - Python 3.8+
# - Node.js 16+

# 3. 네트워크 시작 + SBT 시스템 배포 (한 번에!)
cd blockchain_contracts
./setup_and_deploy.sh

# 4. 프론트엔드 실행
cd ../frontend
npm install
npm start
```

브라우저에서 `http://localhost:3000` 접속하여 MetaMask로 투표하세요! 🎉

---

## 🔗 기반 프로젝트

이 프로젝트는 [Quorum Dev Quickstart](https://github.com/ConsenSys/quorum-dev-quickstart)를 기반으로 구성되었습니다.

---

## 🏗 시스템 아키텍처

### 3-컨트랙트 구조

1. **CitizenSBT** (신원 검증)
   - 비이전 SBT(Soulbound Token) 발급
   - 시민권 검증 및 지갑 바인딩
   - 이중 투표 방지

2. **VotingWithSBT** (투표)
   - CitizenSBT 소유자만 투표 가능
   - 투표 일정 관리 (나노초 단위)
   - 실시간 투표 집계

3. **VotingRewardNFT** (보상)
   - 투표 참여자에게 NFT 발급
   - 이전 가능한 ERC-721 토큰
   - 마스코트 이미지 포함

## 📁 프로젝트 구조

```
blockchain_voting_system/
├── network/                  # Quorum 테스트 네트워크
│   ├── docker-compose.yml   # 7-validator 네트워크 구성
│   ├── .env                 # 합의 알고리즘 설정 (qbft/raft/ibft)
│   └── config/              # 노드 설정 파일
│
├── blockchain_contracts/     # 스마트 컨트랙트 & 배포 스크립트
│   ├── contracts/
│   │   ├── CitizenSBT.sol          # 신원 검증 SBT
│   │   ├── VotingWithSBT.sol       # 투표 컨트랙트
│   │   └── VotingRewardNFT.sol     # 참여 보상 NFT
│   ├── deploy_sbt_system.js        # SBT 시스템 배포 스크립트
│   ├── deploy.env.example          # 배포 설정 템플릿 (투표 일정, 후보)
│   ├── setup_and_deploy.sh         # 통합 배포 자동화
│   ├── redeploy_sbt_system.sh      # 재배포 스크립트
│   ├── artifacts/
│   │   └── sbt_deployment.json     # 배포 정보 (주소, ABI)
│   └── monitoring/                 # 벤치마크 도구 (선택사항)
│
├── frontend/                 # React 투표 UI
│   ├── src/
│   │   ├── components/             # UI 컴포넌트
│   │   ├── lib/                    # Web3 연동 로직
│   │   └── abi/                    # 컨트랙트 ABI (자동 동기화)
│   ├── .env.local                  # 환경 설정 (자동 생성)
│   └── package.json
│
├── .github/
│   └── copilot-instructions.md     # AI 에이전트 가이드
└── README.md                       # 이 문서
```

## 🎯 주요 기능

### 신원 검증 (CitizenSBT)
- ✅ 비이전 SBT로 시민권 검증
- ✅ Verifier 주소를 통한 SBT 발급 관리
- ✅ 1인 1투표 보장

### 투표 시스템 (VotingWithSBT)
- ✅ 나노초 단위 정밀 투표 일정 관리
- ✅ 실시간 투표 집계 및 결과 조회
- ✅ 투표 기간 전/중/후 상태 자동 관리
- ✅ 후보자 정보 및 공약 저장

### 보상 시스템 (VotingRewardNFT)
- ✅ 투표 참여자에게 NFT 발급
- ✅ 마스코트 이미지 메타데이터
- ✅ 이전 가능한 ERC-721 토큰

### 웹 인터페이스
- ✅ MetaMask 연동
- ✅ 후보자 목록 및 공약 표시
- ✅ 투표 및 NFT 수령
- ✅ 실시간 투표 결과 확인

## 🚀 상세 설정 가이드

### 방법 1: 통합 배포 (권장)

`setup_and_deploy.sh` 스크립트가 모든 것을 자동으로 처리합니다:

```bash
cd blockchain_contracts
./setup_and_deploy.sh
```

**자동 처리 내역:**
- ✅ Quorum 네트워크 상태 확인 및 시작
- ✅ Node.js 의존성 설치
- ✅ 3개 컨트랙트 배포 (CitizenSBT, VotingWithSBT, VotingRewardNFT)
- ✅ 배포 정보 저장: `artifacts/sbt_deployment.json`
- ✅ ABI 파일 동기화: `frontend/src/abi/`
- ✅ 프론트엔드 환경 파일 생성: `frontend/.env.local`

### 방법 2: 수동 설정

#### 1. 사전 요구사항

- Docker & Docker Compose
- Python 3.8+
- Node.js 16+
- MetaMask 브라우저 확장

#### 2. 네트워크 시작

```bash
cd network

# .env 파일 설정 (기본값: qbft)
cp .env.example .env

# 네트워크 시작
docker compose up -d

# 상태 확인
docker compose ps
```

#### 3. SBT 시스템 배포

```bash
cd blockchain_contracts

# Node.js 의존성 설치
npm install

# 배포 설정 (선택사항)
cp deploy.env.example deploy.env
# deploy.env에서 투표 일정, 후보자 등 수정 가능

# SBT 시스템 배포
node deploy_sbt_system.js
```

배포가 완료되면:
- `artifacts/sbt_deployment.json`: 컨트랙트 주소 및 ABI
- `frontend/src/abi/`: ABI 파일 자동 복사
- `frontend/.env.local`: 환경 변수 자동 생성

#### 4. 프론트엔드 실행

```bash
cd frontend

# 의존성 설치
npm install

# 개발 서버 시작
npm start
```

브라우저에서 `http://localhost:3000` 접속

**MetaMask 설정:**
1. 네트워크 추가:
   - RPC URL: `http://localhost:10545`
   - Chain ID: `1337`
   - 통화: `ETH`
2. 계정 가져오기 (테스트용):
   - Private Key: `8f2a55949038a9610f50fb23b5883af3b4ecb3c3bb792cbcefbd1542c692be63`
   - 주소: `0xfe3b557e8fb62b89f4916b721be55ceb828dbd73`

#### 5. 새 투표 이벤트 배포

투표 일정이나 후보자를 변경하려면:

```bash
cd blockchain_contracts

# 1. deploy.env 수정
cp deploy.env.example deploy.env
nano deploy.env  # 투표 일정, 후보자 수정

# 2. 재배포
./redeploy_sbt_system.sh
```

**deploy.env 주요 설정:**
```bash
PROPOSALS="Alice,Bob,Charlie"
BALLOT_TITLE="2025 Student Council Election"
BALLOT_OPENS_AT="2025-12-01 09:00:00"
BALLOT_CLOSES_AT="2025-12-07 18:00:00"
RESULTS_ANNOUNCED_AT="2025-12-08 10:00:00"
```

## ⚙️ 고급 설정

### 합의 알고리즘 변경

**중요:** 합의 알고리즘 변경 시 블록체인 데이터 완전 초기화 필수!

```bash
cd network

# 1. 네트워크 중지 및 볼륨 삭제
docker compose down -v

# 2. .env에서 합의 알고리즘 변경
# GOQUORUM_CONS_ALGO=qbft  (또는 raft, ibft)

# 3. 네트워크 재시작
docker compose up -d

# 4. SBT 시스템 재배포
cd ../blockchain_contracts
node deploy_sbt_system.js
```

**이유:** 각 합의 알고리즘은 서로 다른 genesis 파일을 사용하므로 볼륨 삭제(`-v`)가 필수입니다.

### Verifier 주소 변경

CitizenSBT의 verifier를 변경하려면:

```bash
cd blockchain_contracts
node update_verifier.js --new-verifier <새_주소>
```

### 배포 정보 확인

```bash
# 컨트랙트 주소 및 ABI 확인
cat blockchain_contracts/artifacts/sbt_deployment.json

# 특정 주소만 확인
cat blockchain_contracts/artifacts/sbt_deployment.json | grep -A 2 "CitizenSBT"
```

## � 주요 파일

### 스마트 컨트랙트
- `blockchain_contracts/contracts/CitizenSBT.sol`: 신원 검증 SBT
- `blockchain_contracts/contracts/VotingWithSBT.sol`: 투표 컨트랙트
- `blockchain_contracts/contracts/VotingRewardNFT.sol`: 보상 NFT

### 배포 & 자동화
- `blockchain_contracts/deploy_sbt_system.js`: SBT 시스템 배포
- `blockchain_contracts/setup_and_deploy.sh`: 통합 배포 자동화
- `blockchain_contracts/redeploy_sbt_system.sh`: 재배포 스크립트
- `blockchain_contracts/deploy.env.example`: 배포 설정 템플릿

### 프론트엔드
- `frontend/src/pages/VotingPage.tsx`: 메인 투표 페이지
- `frontend/src/lib/voting.ts`: 컨트랙트 연동 로직
- `frontend/src/lib/web3.ts`: Web3 연결 관리

### 유틸리티 (선택사항)
- `blockchain_contracts/verify_sbt.js`: SBT 보유 확인
- `blockchain_contracts/test_vote_with_sbt.js`: 투표 테스트
- `blockchain_contracts/monitoring/`: 성능 벤치마크 도구

### 네트워크 재시작
```bash
cd network
docker compose down -v
docker compose up -d
```

### 로그 확인
```bash
docker compose logs -f [서비스명]
# 예: docker compose logs -f validator1
```

### 완전 초기화 후 재시작
```bash
cd network
docker compose down -v  # 볼륨까지 삭제
cd ../blockchain_contracts
./setup_and_deploy.sh   # 자동으로 재배포 포함
```

## 🛠 문제 해결

### 네트워크 재시작
```bash
cd network
docker compose restart
```

### 완전 초기화 (블록체인 데이터 삭제)
```bash
cd network
docker compose down -v
cd ../blockchain_contracts
./setup_and_deploy.sh
```

### 로그 확인
```bash
cd network
docker compose logs -f validator1
```

### 컨트랙트 주소 확인
```bash
cat blockchain_contracts/artifacts/sbt_deployment.json
```

### RPC 연결 테스트
```bash
curl -X POST http://localhost:10545 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
```

## ✅ 시작 체크리스트

처음 시작하는 환경에서 다음을 확인하세요:

- [ ] Docker 설치: `docker --version`
- [ ] Docker Compose 설치: `docker compose version`
- [ ] Node.js 설치: `node --version` (16+)
- [ ] Python 설치: `python3 --version` (3.8+)
- [ ] 저장소 클론: `git clone https://github.com/capstone-design2-agora/blockchain_voting_system.git`
- [ ] 배포 스크립트 실행: `cd blockchain_contracts && ./setup_and_deploy.sh`
- [ ] 네트워크 상태 확인: `cd network && docker compose ps`
- [ ] 컨트랙트 배포 확인: `cat blockchain_contracts/artifacts/sbt_deployment.json`
- [ ] 프론트엔드 실행: `cd frontend && npm install && npm start`
- [ ] MetaMask 연결 및 투표 테스트

모든 체크리스트 통과 → 시스템 준비 완료! ✨

## 📄 라이선스

이 프로젝트는 MIT 라이선스 하에 배포됩니다. 자세한 내용은 [LICENSE](LICENSE) 파일을 참조하세요.

### 기반 프로젝트

- **Quorum Dev Quickstart** (ConsenSys) - Apache-2.0 License
  - Repository: https://github.com/ConsenSys/quorum-dev-quickstart
  - 사용: `network/` 디렉토리 기반

- **OpenZeppelin Contracts** - MIT License
  - Repository: https://github.com/OpenZeppelin/openzeppelin-contracts
  - 사용: ERC-721, ERC-4973(SBT) 구현

### 우리의 기여

- SBT 기반 투표 시스템 설계 및 구현
- 3-컨트랙트 아키텍처 (CitizenSBT, VotingWithSBT, VotingRewardNFT)
- 자동 배포 및 환경 구성 스크립트
- React 기반 투표 웹 인터페이스
- 통합 문서화 및 가이드

## 📚 참고 문서

- [GoQuorum Documentation](https://consensys.net/docs/goquorum/)
- [Quorum Dev Quickstart](https://github.com/ConsenSys/quorum-dev-quickstart)
- [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts/)
- [ERC-4973: Account-bound Tokens](https://eips.ethereum.org/EIPS/eip-4973)
- [Web3.js Documentation](https://web3js.readthedocs.io/)

---

**Made with ❤️ by Capstone Design Team 2 - Agora**

````

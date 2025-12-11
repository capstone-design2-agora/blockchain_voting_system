# 🎓 서강대학교 2025-2 캡스톤디자인 2 - 5조

**프로젝트명**: 블록체인 기반의 투표 시스템 및 합의 알고리즘 성능 분석 연구  
**팀**: 5조 (Team 5)

---

이 저장소는 **2025년 2학기 캡스톤디자인 2** 프로젝트의 최종 결과물을 총괄하는 아카이브입니다.  
본 프로젝트는 **'어떤 블록체인 합의 알고리즘이 투표 시스템에 가장 적합한가?'**라는 연구 질문에서 출발하여, 이론적 성능 분석 실험과 이를 바탕으로 한 실제 응용 애플리케이션 구현까지의 전 과정을 포함합니다.

## � 프로젝트 구성 요소 (Project Components)

이 프로젝트는 크게 **이론적 연구(Research)**와 **시스템 구현(Implementation)**의 두 축으로 구성됩니다.

### 1. 📚 이론적 연구 및 검증 (Research)
블록체인 투표 시스템의 신뢰성을 확보하기 위해, 다양한 합의 알고리즘의 성능을 선행적으로 검증하였습니다.

- **[성능 분석 레포지토리 (blockchain-test)](https://github.com/capstone-design2-agora/blockchain-test)**
  - **내용**: Raft, IBFT, QBFT 알고리즘의 트랜잭션 처리량(TPS)과 지연 시간(Latency) 비교 실험
  - **역할**: 투표 시스템의 최적 합의 엔진 선정 근거 마련

- **[결과 논문 (KSC 2025 발표)](./KSC2025_투표.pdf)**
  - **내용**: 시스템 아키텍처 설계 및 성능 분석 실험 결과 종합
  - **자료**: `KSC2025_투표.pdf` (본 저장소 포함)

---

### 2. 📱 블록체인 투표 시스템 구현 (Application)
위의 연구 결과를 바탕으로 구축된 실제 투표 애플리케이션입니다.

**SBT(Soulbound Token) 기반 신원 검증**과 **이메일 인증**을 활용한 안전한 블록체인 투표 시스템입니다. 
Quorum 테스트 네트워크에서 시민권 검증, 투표, 참여 보상 NFT 발급, 그리고 **NFT 거래 에스크로우** 기능까지 완전한 투표 및 거래 플랫폼을 제공합니다.


## ⚡ 빠른 시작

```bash
# 1. 저장소 클론
git clone https://github.com/capstone-design2-agora/blockchain_voting_system.git
cd blockchain_voting_system

# 2. 사전 요구사항 확인
# - Docker & Docker Compose 최신 버전
# - Python 3.8+
# - Node.js 16+
# - MetaMask 브라우저 확장

# 3. 네트워크 시작 + SBT 시스템 배포 (자동으로 모든 설정 처리)
cd blockchain_contracts
./scripts/setup_and_deploy.sh

# 4. 프론트엔드 실행 (새 터미널에서)
cd ../frontend
npm install
npm start
```

---

## 📹 시연 영상

**[유튜브 시연 동영상](https://www.youtube.com/watch?v=6SxlvCTTfl4)** - 전체 시스템 실행 및 투표 프로세스 데모

---

## 🔗 기반 프로젝트

- [Quorum Dev Quickstart](https://github.com/ConsenSys/quorum-dev-quickstart) - Docker 기반 멀티 노드 블록체인 네트워크
- [OpenZeppelin Contracts](https://github.com/OpenZeppelin/openzeppelin-contracts) - SBT 및 ERC-721 표준 구현

---

## 🏗 시스템 아키텍처

### 3-컨트랙트 SBT 투표 시스템

1. **CitizenSBT** (신원 검증)
   - 비이전 SBT(Soulbound Token) 발급으로 1인 1투표 보장
   - 이메일 검증을 통한 시민권 확인
   - 지갑 주소와 신원 연계

2. **VotingWithSBT** (투표)
   - CitizenSBT 소유자만 투표 가능
   - 나노초 단위 정밀한 투표 일정 관리
   - 실시간 투표 집계 및 결과 조회
   - VotingRewardNFT와 연동

3. **VotingRewardNFT** (보상)
   - 투표 참여자에게 NFT 자동 발급
   - 이전 가능한 ERC-721 토큰
   - 마스코트 이미지 메타데이터

### NFT 거래 에스크로우 시스템

- **NFTEscrow** (스마트 컨트랙트)
  - 2개 유저 간 NFT 스왑 기능
  - 동시성 안전 에스크로우 메커니즘
  - 각 디포지트별 상태 관리 (ACTIVE → WITHDRAWN)

- **백엔드 API** (Vercel Serverless)
  - `POST /deposits` - NFT 디포지트 등록
  - `POST /swap` - 두 NFT 거래
  - `POST /withdraw` - NFT 철수
  - `GET /deposits` - 거래 가능한 목록 조회

## 📁 프로젝트 구조

```
blockchain_voting_system/
├── network/                    # Quorum 테스트 네트워크
│   ├── docker-compose.yml     # 7-validator 네트워크 구성
│   ├── .env                   # 합의 알고리즘 설정 (qbft/raft/ibft)
│   └── config/                # 노드 설정 파일
│
├── blockchain_contracts/       # 스마트 컨트랙트 & 배포 스크립트
│   ├── contracts/
│   │   ├── CitizenSBT.sol            # 신원 검증 SBT
│   │   ├── VotingWithSBT.sol         # 투표 컨트랙트
│   │   ├── VotingRewardNFT.sol       # 참여 보상 NFT
│   │   └── NFTEscrow.sol             # NFT 거래 에스크로우
│   ├── deploy_sbt_system.js          # SBT 시스템 배포 스크립트
│   ├── deploy.env.example            # 배포 설정 템플릿 (투표 일정, 후보)
│   ├── scripts/
│   │   ├── setup_and_deploy.sh       # 통합 배포 자동화 (권장)
│   │   └── redeploy_contract.sh      # 재배포 스크립트
│   ├── artifacts/
│   │   └── sbt_deployment.json       # 배포 정보 (주소, ABI)
│   └── monitoring/                   # 벤치마크 도구
│
├── frontend/                   # React 투표 & 거래 UI
│   ├── src/
│   │   ├── pages/
│   │   │   ├── EmailVerificationPage.tsx    # 이메일 인증 (Phase 2)
│   │   │   ├── VotingApp.tsx                # 투표 페이지
│   │   │   ├── MyNFTsPage.tsx               # 보유 NFT 조회
│   │   │   └── NFTExchangePage.tsx          # NFT 거래소
│   │   ├── components/                     # UI 컴포넌트
│   │   ├── stores/                         # Zustand 상태 관리
│   │   ├── lib/
│   │   │   ├── web3.ts                     # Web3 연동
│   │   │   ├── sbt.ts                      # CitizenSBT 상호작용
│   │   │   ├── voting.ts                   # 투표 및 보상 NFT
│   │   │   ├── emailVerificationApi.ts     # 이메일 검증 API
│   │   │   └── nftEscrowApi.ts             # NFT 거래 API
│   │   └── abi/                            # 컨트랙트 ABI (자동 동기화)
│   ├── .env.local                          # 환경 설정 (자동 생성)
│   └── package.json
│
├── api/                        # Vercel Serverless Functions
│   ├── request-code.js                     # 이메일 인증 코드 요청
│   ├── verify-and-sign.js                  # 코드 검증 및 서명 생성
│   ├── complete-verification.js            # 트랜잭션 완료 알림
│   ├── check-status.js                     # 인증 상태 확인
│   ├── nft-trading/
│   │   ├── deposits.js                     # NFT 디포지트 관리
│   │   ├── swap.js                         # NFT 스왑 실행
│   │   └── withdraw.js                     # NFT 철수
│   └── _lib/                               # 공용 유틸리티
│       ├── crypto.js                       # 암호화/해싱
│       ├── email.js                        # 이메일 전송 (Resend)
│       ├── supabase.js                     # DB 연동
│       └── rate-limit.js                   # API 레이트 제한
│
├── supabase/                   # Supabase 설정
│   ├── config.toml             # 프로젝트 설정
│   └── migrations/             # 데이터베이스 스키마
│
└── README.md                   # 이 문서
```

## 🎯 핵심 기능

### Phase 1: SBT 기반 투표 시스템

#### 신원 검증 (CitizenSBT)
- ✅ 비이전 SBT(Soulbound Token)로 시민권 검증
- ✅ 지갑과 신원 정보의 일대일 매핑
- ✅ 1인 1투표 보장

#### 투표 시스템 (VotingWithSBT)
- ✅ SBT 소유자만 투표 가능
- ✅ 나노초 단위 정밀 투표 일정 관리
- ✅ 실시간 투표 집계 및 결과 조회
- ✅ 투표 기간 전/중/후 자동 상태 관리
- ✅ 후보자 정보 및 공약 저장

#### 보상 시스템 (VotingRewardNFT)
- ✅ 투표 참여자에게 자동 NFT 발급
- ✅ 마스코트 이미지 메타데이터
- ✅ 이전 가능한 ERC-721 토큰
- ✅ 거래소에서 판매 및 구매 가능

### Phase 2: 이메일 검증 및 서명 시스템

#### 안전한 신원 검증 (Email Verification)
- ✅ 이메일 OTP(One-Time Password) 기반 인증
- ✅ 5분 만료 시간 제한
- ✅ 3회 재시도 제한 및 레이트 제한
- ✅ 검증 상태 Supabase 저장

#### 서명 생성 및 검증
- ✅ 서버 사이드 EIP-191 메시지 서명
- ✅ 서명 만료 및 재생 공격 방지
- ✅ 페이지 새로고침 후 상태 복구

#### 온체인 SBT 민팅
- ✅ 서명을 활용한 안전한 민팅
- ✅ 트랜잭션 상태 추적
- ✅ 에러 복구 및 재시도

### Phase 3: NFT 거래 에스크로우 시스템

#### NFT 스왑 기능
- ✅ 2개 유저 간 NFT 동시 스왑
- ✅ 에스크로우 기반 원자성 보장
- ✅ 각 디포지트별 ACTIVE/WITHDRAWN 상태 관리

#### 거래 API
- ✅ 이메일 인증된 사용자만 거래 가능
- ✅ 레이트 제한으로 스팸 방지
- ✅ 온체인 트랜잭션 검증
- ✅ 거래 가능 NFT 목록 조회

#### NFT 거래소 UI
- ✅ 마켓 탭: 거래 가능한 NFT 목록
- ✅ 나의 디포지트 탭: 내가 등록한 NFT
- ✅ 거래 내역 탭: 완료된 스왑 기록

### 웹 인터페이스
- ✅ MetaMask 자동 지갑 연동
- ✅ 다중 단계 이메일 인증 플로우
- ✅ 후보자 목록 및 공약 표시
- ✅ 실시간 투표 결과 대시보드
- ✅ NFT 컬렉션 및 거래소 통합 UI
- ✅ 거래 상태 실시간 추적

## 🚀 상세 설정 및 실행 가이드

### 방법 1: 통합 배포 (권장) ✨

**`setup_and_deploy.sh` 스크립트가 모든 것을 자동으로 처리합니다:**

```bash
cd blockchain_contracts
./scripts/setup_and_deploy.sh
```

**자동 처리 내역:**
- ✅ Quorum 네트워크 상태 확인 및 시작 (없으면 Docker로 생성)
- ✅ Node.js & Python 의존성 설치
- ✅ 3개 스마트 컨트랙트 배포 (CitizenSBT, VotingWithSBT, VotingRewardNFT)
- ✅ 배포 정보 저장: `artifacts/sbt_deployment.json`
- ✅ ABI 파일 동기화: `frontend/src/abi/`
- ✅ 프론트엔드 환경 파일 생성: `frontend/.env.local`

이제 프론트엔드를 실행하면 됩니다:

```bash
cd ../frontend
npm install
npm start
```

### 방법 2: 단계별 수동 설정

#### 1단계: 사전 요구사항

다음을 확인하세요:

```bash
docker --version        # Docker 설치 확인
docker compose version  # Docker Compose 설치 확인
node --version          # Node.js 16+ 확인
python3 --version       # Python 3.8+ 확인
```

#### 2단계: 네트워크 시작

```bash
cd network

# 환경 파일 설정 (기본값: QBFT 합의)
cp .env.example .env
# 필요시 합의 알고리즘 변경: GOQUORUM_CONS_ALGO=qbft (또는 raft, ibft)

# 네트워크 시작
docker compose up -d

# 상태 확인 (모든 validator가 healthy 상태여야 함)
docker compose ps
```

#### 3단계: SBT 시스템 배포

```bash
cd ../blockchain_contracts

# Node.js 의존성 설치
npm install

# (선택) 배포 설정 커스터마이징
cp deploy.env.example deploy.env
# deploy.env에서 다음 설정 가능:
# - PROPOSALS: 후보자 목록 (쉼표로 구분)
# - BALLOT_TITLE: 투표 주제
# - BALLOT_OPENS_AT: 투표 시작 시간 (예: "2025-12-01 09:00:00")
# - BALLOT_CLOSES_AT: 투표 종료 시간
# - RESULTS_ANNOUNCED_AT: 결과 발표 시간

# SBT 시스템 배포
node scripts/deploy_sbt_system.js
```

배포 완료 후:
- `artifacts/sbt_deployment.json`: 컨트랙트 주소 및 ABI 저장
- `frontend/src/abi/`: ABI 파일 자동 복사됨
- `frontend/.env.local`: 환경 변수 자동 생성됨

#### 4단계: 프론트엔드 실행

```bash
cd ../frontend

npm install
npm start
```

**MetaMask 설정:**

1. 네트워크 추가:
   - 네트워크 이름: `Quorum Test Network`
   - Chain ID: `1337`
   - 통화: `ETH`
   - RPC URL: 배포된 네트워크의 RPC 엔드포인트 주소

2. 테스트 계정 가져오기:
   - MetaMask: "계정 가져오기" → "Private Key 사용"
   - Quorum 환경에서 제공하는 테스트 계정의 Private Key 입력
   - (개발 환경에서 `docker compose logs validator1`로 확인 가능)

### 방법 3: 새 투표 이벤트 배포

투표 일정이나 후보자를 변경하려면:

```bash
cd blockchain_contracts

# 1. 설정 파일 수정
cp deploy.env.example deploy.env
nano deploy.env  # 투표 일정, 후보자 등을 변경

# 2. 재배포
./scripts/redeploy_contract.sh
```

**deploy.env 설정 예시:**

```bash
# 투표 일정 및 후보자
PROPOSALS="김철수,이영희,박민수,최지우"
BALLOT_TITLE="2025년 학생회장 선거"
BALLOT_OPENS_AT="2025-12-01 09:00:00"
BALLOT_CLOSES_AT="2025-12-07 18:00:00"
RESULTS_ANNOUNCED_AT="2025-12-08 10:00:00"

# verifier 주소 (선택사항, 기본값 사용 시 생략)
VERIFIER_ADDRESS=0x...
```

**시간대 변환:**
- 형식: `YYYY-MM-DD HH:MM:SS` (예: `2025-12-01 09:00:00`)
- 자동으로 나노초 단위로 변환됨

## ⚙️ 고급 설정

### 합의 알고리즘 변경

**⚠️ 중요:** 합의 알고리즘 변경 시 블록체인 데이터가 완전히 초기화됩니다!

```bash
cd network

# 1. 네트워크 중지 및 모든 데이터 삭제
docker compose down -v

# 2. .env에서 합의 알고리즘 변경
# 기본값: GOQUORUM_CONS_ALGO=qbft
# 옵션: qbft, raft, ibft
nano .env

# 3. 네트워크 재시작
docker compose up -d

# 4. 네트워크 안정화 대기 (30초 정도)
sleep 30

# 5. SBT 시스템 재배포
cd ../blockchain_contracts
./scripts/setup_and_deploy.sh
```

**이유:** 각 합의 알고리즘은 서로 다른 genesis 블록을 사용하므로 볼륨(`-v`) 삭제가 필수입니다.

### Verifier 주소 변경

CitizenSBT의 검증자 주소를 변경하려면:

```bash
cd blockchain_contracts
node scripts/update_verifier.js --new-verifier <0x새로운_주소>
```

### 환경 파일 수동 설정

자동 생성이 실패한 경우, 수동으로 설정할 수 있습니다:

```bash
# frontend/.env 또는 frontend/.env.local에 다음 추가:
REACT_APP_RPC=<배포된_RPC_엔드포인트>
REACT_APP_CITIZEN_SBT_ADDRESS=0x...         # sbt_deployment.json에서 복사
REACT_APP_VOTING_CONTRACT_ADDRESS=0x...
REACT_APP_REWARD_NFT_ADDRESS=0x...
REACT_APP_ESCROW_ADDRESS=0x...              # NFT 거래용
REACT_APP_VERIFIER_ADDRESS=0x...            # CitizenSBT의 검증자
REACT_APP_API_BASE_URL=<배포된_API_서버_URL>
```

### 배포 정보 확인

```bash
# 전체 배포 정보 확인
cat blockchain_contracts/artifacts/sbt_deployment.json | jq

# 특정 컨트랙트 주소만 확인
cat blockchain_contracts/artifacts/sbt_deployment.json | jq '.contracts.CitizenSBT.address'

# ABI 파일 확인
ls -la frontend/src/abi/
```

#### 5. 새 투표 이벤트 배포

투표 일정이나 후보자를 변경하려면:

```bash
cd blockchain_contracts

# 1. deploy.env 수정
cp deploy.env.example deploy.env
nano deploy.env  # 투표 일정, 후보자 수정

# 2. 재배포
./scripts/redeploy_contract.sh
```

## 🔗 API 엔드포인트 (Vercel Serverless)

### 이메일 검증 API

```
POST /api/request-code
- 요청: { email, walletAddress, recaptchaToken? }
- 응답: 이메일로 6자리 OTP 전송

POST /api/verify-and-sign
- 요청: { email, walletAddress, code }
- 응답: { success, signature, identityHash, nonce, expiresAt }

GET /api/check-status?wallet=0x...
- 응답: { status: "PENDING" | "COMPLETED" | "NOT_FOUND", ... }

POST /api/complete-verification
- 요청: { walletAddress, txHash }
- 응답: SBT 민팅 트랜잭션 확인

POST /api/reset-verification
- 요청: { email, walletAddress }
- 응답: 재인증 프로세스 초기화
```

### NFT 거래 API

```
GET /api/nft-trading/deposits?status=ACTIVE
- 요청: Header: x-wallet-address
- 응답: { deposits: [{ id, owner_wallet, nft_contract, token_id, status, ... }] }

POST /api/nft-trading/deposits
- 요청: { depositId, nftContract, tokenId, txHash?, wallet }
- 응답: { depositId }

POST /api/nft-trading/swap
- 요청: { myDepositId, targetDepositId, txHash?, wallet }
- 응답: { swapped: boolean }

POST /api/nft-trading/withdraw
- 요청: { depositId, txHash?, wallet }
- 응답: { withdrawn: boolean }
```

## 📊 데이터베이스 스키마 (Supabase)

### email_verifications 테이블

```sql
CREATE TABLE email_verifications (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL,
  wallet_address TEXT NOT NULL UNIQUE,
  code_hash BYTEA NOT NULL,
  identity_hash BYTEA UNIQUE,
  status TEXT DEFAULT 'PENDING', -- PENDING, COMPLETED, FAILED
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP,
  attempt_count INT DEFAULT 0
);
```

### escrow_deposits 테이블

```sql
CREATE TABLE escrow_deposits (
  id BIGINT PRIMARY KEY,
  owner_wallet TEXT NOT NULL,
  nft_contract TEXT NOT NULL,
  token_id TEXT NOT NULL,
  status TEXT DEFAULT 'ACTIVE', -- ACTIVE, WITHDRAWN
  tx_hash TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
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
node scripts/deploy_sbt_system.js
```

**이유:** 각 합의 알고리즘은 서로 다른 genesis 파일을 사용하므로 볼륨 삭제(`-v`)가 필수입니다.

### Verifier 주소 변경

CitizenSBT의 verifier를 변경하려면:

```bash
cd blockchain_contracts
node scripts/update_verifier.js --new-verifier <새_주소>
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
- `blockchain_contracts/scripts/deploy_sbt_system.js`: SBT 시스템 배포
- `blockchain_contracts/scripts/setup_and_deploy.sh`: 통합 배포 자동화
- `blockchain_contracts/scripts/redeploy_contract.sh`: 재배포 스크립트
- `blockchain_contracts/deploy.env.example`: 배포 설정 템플릿

### 프론트엔드
- `frontend/src/pages/VotingPage.tsx`: 메인 투표 페이지
- `frontend/src/lib/voting.ts`: 컨트랙트 연동 로직
- `frontend/src/lib/web3.ts`: Web3 연결 관리

## 📂 파일 위치 정리

### 스마트 컨트랙트 소스

| 파일 | 설명 |
|------|------|
| `blockchain_contracts/contracts/CitizenSBT.sol` | 신원 검증 SBT (비이전) |
| `blockchain_contracts/contracts/VotingWithSBT.sol` | 투표 컨트랙트 |
| `blockchain_contracts/contracts/VotingRewardNFT.sol` | 참여 보상 NFT (ERC-721) |
| `blockchain_contracts/contracts/NFTEscrow.sol` | NFT 거래 에스크로우 |

### 배포 및 자동화

| 파일 | 설명 |
|------|------|
| `blockchain_contracts/scripts/setup_and_deploy.sh` | 통합 배포 (권장) |
| `blockchain_contracts/scripts/deploy_sbt_system.js` | SBT 시스템 배포 |
| `blockchain_contracts/scripts/redeploy_contract.sh` | 재배포 스크립트 |
| `blockchain_contracts/deploy.env.example` | 배포 설정 템플릿 |

### 프론트엔드 핵심 파일

| 파일 | 설명 |
|------|------|
| `frontend/src/pages/EmailVerificationPage.tsx` | 이메일 인증 플로우 |
| `frontend/src/pages/VotingApp.tsx` | 투표 페이지 |
| `frontend/src/pages/MyNFTsPage.tsx` | NFT 컬렉션 조회 |
| `frontend/src/pages/NFTExchangePage.tsx` | NFT 거래소 |
| `frontend/src/lib/emailVerificationApi.ts` | 이메일 API 클라이언트 |
| `frontend/src/lib/nftEscrowApi.ts` | NFT 거래 API 클라이언트 |

### 백엔드 API

| 파일 | 설명 |
|------|------|
| `api/request-code.js` | OTP 요청 |
| `api/verify-and-sign.js` | OTP 검증 및 서명 |
| `api/check-status.js` | 인증 상태 확인 |
| `api/nft-trading/deposits.js` | 디포지트 관리 |
| `api/nft-trading/swap.js` | NFT 스왑 |
| `api/nft-trading/withdraw.js` | NFT 철수 |

### NFT 마켓 인덱싱 (선택사항)

NFT 거래 이벤트를 자동으로 추적하려면 escrow_indexer를 실행하세요:

```bash
# 환경 변수 설정
cat > scripts/indexer.env << EOF
RPC_URL=<배포된_RPC_엔드포인트>
SIMPLE_ESCROW_ADDRESS=0x...  # sbt_deployment.json에서 NFTEscrow 주소 복사
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
START_BLOCK=0  # 처음부터 인덱싱 (선택, 기본값: 최신 블록)
EOF

# 인덱서 실행
node scripts/escrow_indexer.js
```

**escrow_indexer 역할:**
- ✅ 블록체인의 Deposited, Withdrawn, Swapped 이벤트 감시
- ✅ 이벤트를 Supabase `deposits`, `swap_events` 테이블에 저장
- ✅ 마지막 처리된 블록을 `scripts/.escrow_indexer_state.json`에 기록
- ✅ 1초 간격으로 계속 실행 (데몬 프로세스)

**처리되는 이벤트:**
- `Deposited`: NFT 디포지트 추가 (상태: ACTIVE)
- `Withdrawn`: NFT 철수 (상태: WITHDRAWN)
- `Swapped`: NFT 스왑 완료 (상태: CLOSED)

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
./scripts/setup_and_deploy.sh  # 자동으로 네트워크 시작 및 재배포
```

### 컨트랙트 주소 확인

```bash
cat blockchain_contracts/artifacts/sbt_deployment.json | jq '.contracts'
```

### RPC 연결 테스트

```bash
curl -X POST <RPC_엔드포인트> \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
```

### MetaMask 연결 실패

```bash
1. MetaMask 리셋
2. 네트워크 재추가 (배포된 RPC 엔드포인트 및 Chain ID: 1337)
3. 계정 재가져오기
```

### 이메일 인증 실패

```bash
# 1. Supabase email_verifications 테이블 확인
# 2. 레이트 제한 확인 (5분 max 3회)
# 3. Resend API 키 확인: echo $RESEND_API_KEY
```

## ✅ 시작 체크리스트

처음 시작하는 환경:

- [ ] Docker 설치
- [ ] Node.js 16+ 설치
- [ ] Python 3.8+ 설치
- [ ] Git 저장소 클론
- [ ] SBT 시스템 배포: `cd blockchain_contracts && ./scripts/setup_and_deploy.sh`
- [ ] 프론트엔드 실행: `cd frontend && npm install && npm start`
- [ ] MetaMask 설정 및 테스트

모든 체크리스트 통과 → 시스템 준비 완료! ✨

## 📚 추가 문서

- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) - 시스템 아키텍처
- [`frontend/RUN_GUIDE.md`](./frontend/RUN_GUIDE.md) - 프론트엔드 실행 가이드
- [`.github/copilot-instructions.md`](./.github/copilot-instructions.md) - 개발 가이드

## 📄 라이선스

MIT License - 자세한 내용은 [LICENSE](LICENSE) 파일 참조

### 기반 프로젝트

- **Quorum Dev Quickstart** (ConsenSys) - Apache-2.0
- **OpenZeppelin Contracts** - MIT

### 우리의 기여

- ✨ SBT 기반 신원 검증 투표 시스템
- 🏗 3-컨트랙트 아키텍처
- 📧 이메일 OTP 인증 시스템
- 🔄 NFT 에스크로우 거래
- 🤖 자동화된 배포 스크립트
- 🎨 React 통합 UI
- 📖 완벽한 문서화

---

**마지막 업데이트**: 2025년 12월 5일  
**버전**: 3.0.0 (NFT 거래 시스템 통합)


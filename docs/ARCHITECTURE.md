# Blockchain Voting System - 코드 아키텍처 가이드

## 📋 개요

**목적**: SBT(Soulbound Token) 기반 신원 검증을 통한 블록체인 투표 시스템

**핵심 특징**:
- Quorum 테스트 네트워크 기반
- 3-컨트랙트 분리 아키텍처 (신원검증, 투표, 리워드)
- React 기반 투표 UI
- 자동화된 배포 및 환경 관리
- 나노초 정밀도 투표 스케줄 관리

---

## 🏗 시스템 아키텍처 개요

```
┌─────────────────────────────────────────────────────────────────┐
│                     Blockchain Voting System                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    Frontend (React)                      │  │
│  │  - AuthPage: 지갑 연결 + 이름 인증                        │  │
│  │  - RegisterPage: SBT 발급                                │  │
│  │  - VotingApp: 투표 UI                                   │  │
│  │  - MyNFTsPage: 리워드 NFT 조회                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                           ↓                                      │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                   Web3 Integration Layer                 │  │
│  │  - web3.ts: Web3 인스턴스 관리                            │  │
│  │  - sbt.ts: CitizenSBT 상호작용                          │  │
│  │  - voting.ts: VotingWithSBT + VotingRewardNFT 상호작용  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                           ↓                                      │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                   Smart Contracts                        │  │
│  │  ┌─────────────────────────────────────────────────────┐ │  │
│  │  │  CitizenSBT (신원 검증)                             │ │  │
│  │  │  - 비이전 ERC721 토큰                               │ │  │
│  │  │  - 1인 1투표 보장                                   │ │  │
│  │  │  - Identity Hash → Wallet 매핑                      │ │  │
│  │  └─────────────────────────────────────────────────────┘ │  │
│  │  ┌─────────────────────────────────────────────────────┐ │  │
│  │  │  VotingWithSBT (투표)                               │ │  │
│  │  │  - SBT 소유자 검증                                  │ │  │
│  │  │  - 투표 일정 관리 (나노초)                          │ │  │
│  │  │  - 실시간 결과 집계                                 │ │  │
│  │  │  - 리워드 NFT 발급 연동                             │ │  │
│  │  └─────────────────────────────────────────────────────┘ │  │
│  │  ┌─────────────────────────────────────────────────────┐ │  │
│  │  │  VotingRewardNFT (리워드)                           │ │  │
│  │  │  - 이전 가능 ERC721 토큰                            │ │  │
│  │  │  - 투표 참여 보상                                   │ │  │
│  │  │  - 메타데이터 + 마스코트 이미지                     │ │  │
│  │  └─────────────────────────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────────────────┘  │
│                           ↓                                      │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Quorum Blockchain Network                   │  │
│  │  - 7-validator 테스트 네트워크                           │  │
│  │  - 합의 알고리즘: QBFT (기본)                           │  │
│  │  - RPC 엔드포인트: http://localhost:9545               │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📁 프로젝트 디렉토리 구조 및 설명

### 1. `network/` - Quorum 테스트 네트워크

**역할**: 블록체인 노드 실행 및 관리

```
network/
├── docker-compose.yml          # Docker 기반 7-validator 네트워크 정의
├── .env                        # 네트워크 환경설정 (합의 알고리즘, 포트 등)
├── config/
│   ├── goquorum/              # GoQuorum 기본 설정
│   ├── goquorum-qbft/         # QBFT 합의 설정
│   ├── goquorum-raft/         # RAFT 합의 설정
│   ├── nodes/                 # 각 validator 노드 설정
│   ├── permissions/           # 권한 관리 파일
│   ├── tessera/               # 트랜잭션 매니저 설정
│   └── prometheus/            # 메트릭 수집 설정
├── chainlens/                  # 블록체인 탐색기 설정
└── dapps/                      # 스마트 컨트랙트 예제
```

**주요 환경변수** (`.env`):
- `GOQUORUM_CONS_ALGO`: 합의 알고리즘 (qbft, raft, ibft)
- `NETWORK_NAME`: 네트워크 이름
- `RPC_PORT`: RPC 엔드포인트 포트 (기본: 9545)

**실행 명령어**:
```bash
cd network
docker-compose up -d  # 네트워크 시작
docker-compose ps     # 상태 확인
docker-compose down   # 종료
```

---

### 2. `blockchain_contracts/` - 스마트 컨트랙트 및 배포 자동화

**역할**: 스마트 컨트랙트 개발, 컴파일, 배포, 관리

```
blockchain_contracts/
├── contracts/
│   ├── CitizenSBT.sol           # 신원 검증 SBT 컨트랙트
│   ├── VotingWithSBT.sol        # 투표 컨트랙트
│   └── VotingRewardNFT.sol      # 리워드 NFT 컨트랙트
│
├── scripts/
│   ├── setup_and_deploy.sh      # ⭐ 통합 배포 자동화 메인 스크립트
│   ├── deploy_sbt_system.js     # 컨트랙트 배포 핵심 로직 (Node.js)
│   ├── redeploy_contract.sh     # 재배포 스크립트
│   ├── start_network.sh         # 네트워크 시작 헬퍼
│   ├── stop_network.sh          # 네트워크 종료 헬퍼
│   ├── restart_network.sh       # 네트워크 재시작 헬퍼
│   ├── cast_vote.js             # 투표 테스트 스크립트
│   ├── check_vote.js            # 투표 결과 조회 스크립트
│   ├── verify_sbt.js            # SBT 검증 테스트 스크립트
│   └── ...                      # 기타 유틸리티 스크립트
│
├── artifacts/
│   ├── sbt_deployment.json      # ⭐ 배포 정보 저장소 (단일 소스)
│   ├── sbt_deployment.backup.*  # 배포 백업 파일들
│   ├── CitizenSBT.abi.json      # CitizenSBT ABI
│   ├── VotingWithSBT.abi.json   # VotingWithSBT ABI
│   └── VotingRewardNFT.abi.json # VotingRewardNFT ABI
│
├── monitoring/
│   ├── prometheus.yml           # 메트릭 수집 설정
│   └── prometheus.service       # Prometheus 서비스 파일
│
├── package.json                 # Node.js 의존성 (web3, solc, openzeppelin)
├── deploy.env                   # 배포 환경 설정 (투표 일정, 후보 등)
└── deploy.env.example           # 배포 환경 설정 템플릿
```

## 🚀 Admin 배포 구성 분리

배포 UI를 운영하기 위해 선거별 ballot config, 템플릿 엔진, 민감한 시크릿을 명확하게 분리합니다.

| 구분 | 위치 | 접근 주체 |
| --- | --- | --- |
| `BallotConfig` (title, schedule, proposals 등) | `blockchain_contracts/deploy.templates.env` + 프론트에서 렌더링 후 `blockchain_contracts/tmp/deploy-<uuid>.env` | React admin 페이지와 backend runner (Vercel 함수) |
| 민감 환경 변수 (Verifer 키, RPC, Supabase 등) | 배포 환경 (`process.env`) | 운영 서버 또는 Vercel 시크릿, 프론트에서 노출 없음 |
| 배포 기록 및 로그 | `artifacts/admin-history/*.json` / `.log` (Git-tracked 제외) | 내부 기록/감사 및 UI prefill |

이 구조 덕분에 `/api/internal/deploy` 같은 보호된 엔드포인트만 UI에서 새 ballot 설정을 제출할 수 있고, 장기 시크릿은 절대 클라이언트에 전달되지 않습니다.

#### 스마트 컨트랙트 상세 설명

##### 2.1 CitizenSBT.sol - 신원 검증

```solidity
// 특징
- ERC721 기반 비이전 토큰
- 1인 1토큰 (Soulbound)
- Identity Hash 기반 중복 등록 방지
- Verifier 주소로 발급 권한 관리

// 주요 매핑
identityToWallet: bytes32 → address    // 신원 → 지갑 단방향 매핑
hasSBT: address → bool                 // 빠른 소유 확인
tokenToIdentity: uint256 → bytes32     // 토큰 → 신원 추적

// 주요 함수
mint(address to, bytes32 identityHash) → uint256
  └─ 신원 검증된 사용자에게 SBT 발급
isCitizen(address account) → bool
  └─ 지갑이 SBT를 소유하는지 확인
```

**역할**: 
- 유권자 신원 검증 및 지갑 바인딩
- 이중 투표 방지
- 블록체인 상의 신원 증명

---

##### 2.2 VotingWithSBT.sol - 투표

```solidity
// 특징
- CitizenSBT 소유 여부 검증
- 나노초 단위 투표 일정 관리
- 실시간 투표 결과 계산
- VotingRewardNFT 자동 발급

// 주요 구조체
struct Proposal {
    string name;           // 후보 이름
    uint256 voteCount;     // 투표 수
}

struct BallotMetadata {
    string id;             // 투표 고유 ID
    string title;          // 투표 제목
    string description;    // 설명
    uint256 opensAt;       // 투표 시작 (나노초)
    uint256 closesAt;      // 투표 종료 (나노초)
    uint256 announcesAt;   // 결과 발표 (나노초)
    uint256 expectedVoters; // 예상 투표자
}

// 주요 매핑
hasVoted: address → bool               // 투표 이력
voterChoice: address → uint256         // 투표자의 선택

// 주요 함수
vote(uint256 proposalId) → uint256
  └─ SBT 검증 후 투표 진행, 리워드 NFT 발급
getResults() → Proposal[]
  └─ 현재 투표 결과 반환
getVoteCount(uint256 proposalId) → uint256
  └─ 특정 후보의 투표 수 반환
```

**역할**:
- 투표 진행 및 결과 관리
- SBT 기반 투표권 검증
- 투표 일정 (시작/종료/발표) 관리
- 참여 보상 NFT 자동 발급

**특이사항**:
- 나노초(nanosecond) 단위 시간 관리
  - 1초 = 1,000,000,000 나노초
  - `setup_and_deploy.sh`의 `date_to_timestamp()` 함수로 자동 변환
  - 예: "2025-11-11 15:00:00" → 1762836000000000000 ns

---

##### 2.3 VotingRewardNFT.sol - 리워드

```solidity
// 특징
- ERC721URIStorage 기반 이전 가능 NFT
- 투표 참여 증명 및 보상
- 메타데이터 + 마스코트 이미지 저장
- 투표 기록 추적

// 주요 매핑
tokenToBallot: uint256 → string        // NFT → 투표 연결
ballotMascots: string → string         // 투표별 마스코트 이미지
voteRecords: uint256 → VoteRecord      // NFT → 투표 기록

// 주요 함수
mint(address to, string ballotId, uint256 proposalId) → uint256
  └─ 투표자에게 리워드 NFT 발급
setMascot(string ballotId, string imageURI)
  └─ 투표별 마스코트 이미지 설정
authorizeM Minter(address minter, bool authorized)
  └─ 투표 컨트랙트 권한 부여
```

**역할**:
- 투표 참여 증명서 역할
- 이전 가능한 기념 NFT
- 투표별 고유 마스코트 이미지 포함

---

#### 배포 자동화 스크립트

##### setup_and_deploy.sh - 통합 배포 (⭐ 권장)

**역할**: 네트워크 시작 → 컨트랙트 배포 → 환경 파일 자동 생성

```bash
./scripts/setup_and_deploy.sh

# 자동으로 수행:
# 1. 네트워크 상태 확인 (없으면 docker-compose up)
# 2. Node.js/Python 의존성 확인
# 3. 컨트랙트 컴파일 및 배포 (deploy_sbt_system.js 실행)
# 4. artifacts/sbt_deployment.json 생성
# 5. frontend/src/abi/ 에 ABI 복사
# 6. frontend/.env.local 자동 생성/갱신
```

**생성되는 아티팩트**:
```json
{
  "contracts": {
    "CitizenSBT": {
      "address": "0x...",
      "abi": [...]
    },
    "VotingWithSBT": {
      "address": "0x...",
      "abi": [...]
    },
    "VotingRewardNFT": {
      "address": "0x...",
      "abi": [...]
    }
  },
  "network": {
    "rpcUrl": "http://localhost:9545",
    "consensus": "qbft"
  }
}
```

##### deploy_sbt_system.js - 배포 핵심 로직

**주요 기능**:
1. **컨트랙트 컴파일** (`solc@0.8.20`)
   - Optimizer: enabled (runs: 200)
   - EVM: london
   - 자동 import resolver (node_modules, local)

2. **배포 순서** (의존성 관리)
   ```
   CitizenSBT 배포
   └─ VotingRewardNFT 배포
      └─ VotingWithSBT 배포 (CitizenSBT, VotingRewardNFT 참조)
   ```

3. **배포 환경설정** (`deploy.env`)
   ```bash
   # 투표 일정 (ISO 8601 형식)
   BALLOT_OPENS_AT="2025-11-12 09:00:00"
   BALLOT_CLOSES_AT="2025-11-12 18:00:00"
   BALLOT_ANNOUNCES_AT="2025-11-12 19:00:00"
   
   # 투표 정보
   BALLOT_ID="ballot_2025_11"
   BALLOT_TITLE="2025 가을 대선"
   BALLOT_DESCRIPTION="..."
   
   # 후보 목록 (쉼표 분리)
   PROPOSALS="후보A,후보B,후보C"
   
   # Verifier 주소 (SBT 발급자)
   VERIFIER_ADDRESS="0x..."
   ```

4. **ABI 추출 및 저장**
   - `artifacts/sbt_deployment.json` 생성
   - 각 컨트랙트 ABI를 개별 JSON 파일로 저장

---

### 3. `frontend/` - React 투표 UI

**역할**: 웹 기반 투표 인터페이스

```
frontend/
├── src/
│   ├── pages/
│   │   ├── AuthPage.tsx         # 1단계: 지갑 연결 + 이름 입력
│   │   ├── RegisterPage.tsx     # 2단계: SBT 발급 신청
│   │   ├── VotingApp.tsx        # 3단계: 투표 UI
│   │   └── MyNFTsPage.tsx       # 리워드 NFT 조회
│   │
│   ├── lib/
│   │   ├── web3.ts             # Web3 인스턴스 및 설정
│   │   ├── sbt.ts              # CitizenSBT 상호작용
│   │   └── voting.ts           # VotingWithSBT + VotingRewardNFT 상호작용
│   │
│   ├── abi/                     # 컨트랙트 ABI (자동 동기화)
│   │   ├── CitizenSBT.json
│   │   ├── Voting.json
│   │   └── VotingRewardNFT.json
│   │
│   ├── App.tsx                  # 라우팅 설정
│   ├── App.css                  # 전체 스타일
│   ├── index.tsx                # 진입점
│   └── ...
│
├── .env                         # 프로덕션 환경 (선택)
├── .env.local                   # 개발 환경 (자동 생성)
├── package.json                 # 의존성 (React 19, Web3 4, TypeScript)
├── tsconfig.json                # TypeScript 설정
└── RUN_GUIDE.md                 # 실행 가이드
```

#### 주요 컴포넌트 및 데이터 흐름

##### 3.1 AuthPage.tsx - 인증 페이지

```typescript
// 역할: 지갑 연결 + 사용자 이름 입력
// Flow:
// 1. MetaMask 연결 (web3.ts의 connectWallet())
// 2. 사용자 이름 입력
// 3. /register로 라우팅 (상태 전달)

// 상태:
- connectedAddress: string        // 연결된 지갑 주소
- userName: string                // 사용자 입력 이름
```

**사용자 경험**:
```
[지갑 선택] → [MetaMask 승인] → [이름 입력] → [다음] → RegisterPage
```

---

##### 3.2 RegisterPage.tsx - SBT 발급 페이지

```typescript
// 역할: 신원 검증 후 SBT 발급
// Flow:
// 1. 사용자 이름으로 Identity Hash 생성
//    (keccak256 해시)
// 2. CitizenSBT.mint() 호출
// 3. 트랜잭션 완료 후 /voting으로 라우팅

// 상태:
- identityHash: bytes32           // keccak256(userName)
- sbtTokenId: uint256             // 발급된 토큰 ID
- isLoading: boolean              // 트랜잭션 진행 중
- error: string                   // 에러 메시지
```

**SBT 발급 로직** (`sbt.ts`):
```typescript
export async function mintSBT(
  userAddress: string,
  identityHash: string,
  verifierAddress: string
): Promise<string> {
  // CitizenSBT.mint() 트랜잭션 실행
  // 반환: txHash (트랜잭션 해시)
}

export async function checkSBTStatus(
  userAddress: string
): Promise<boolean> {
  // CitizenSBT.isCitizen() 호출
  // 반환: true (SBT 소유), false (미소유)
}
```

---

##### 3.3 VotingApp.tsx - 투표 페이지

```typescript
// 역할: 투표 진행 및 결과 표시
// 선행 조건: SBT 소유 필수 (RegisterPage에서 발급)
// Flow:
// 1. VotingWithSBT 컨트랙트에서 후보 목록 로드
// 2. 사용자가 후보 선택
// 3. VotingWithSBT.vote() 호출
// 4. 투표 완료 시 리워드 NFT 자동 발급
// 5. MyNFTsPage로 이동 가능

// 상태:
- proposals: Proposal[]           // 후보 목록
- selectedProposal: number        // 선택된 후보 ID
- hasVoted: boolean               // 투표 여부
- results: VoteResult[]           // 실시간 결과
- rewardNFT: NFT | null           // 발급된 NFT
- isVoting: boolean               // 투표 진행 중

// 구조체
interface Proposal {
  id: number;
  name: string;
  voteCount: uint256;
}

interface VoteResult {
  proposalName: string;
  votes: number;
  percentage: number;
}
```

**투표 로직** (`voting.ts`):
```typescript
export async function vote(
  userAddress: string,
  proposalId: number
): Promise<{ txHash: string; nftTokenId: number }> {
  // 1. CitizenSBT.isCitizen() 검증
  // 2. VotingWithSBT.vote() 호출
  // 3. 반환: txHash, 발급된 NFT ID
  // → VotingRewardNFT 자동 발급됨
}

export async function getProposals(): Promise<Proposal[]> {
  // VotingWithSBT.getProposals() 호출
  // 반환: 후보 목록
}

export async function getResults(): Promise<Proposal[]> {
  // VotingWithSBT.getResults() 호출
  // 반환: 실시간 투표 결과
}
```

---

##### 3.4 MyNFTsPage.tsx - NFT 컬렉션

```typescript
// 역할: 사용자가 획득한 리워드 NFT 조회
// Flow:
// 1. 사용자 주소로 VotingRewardNFT 잔액 조회
// 2. 각 NFT의 메타데이터 로드
// 3. 마스코트 이미지 표시

// 상태:
- nfts: NFT[]                     // 사용자 소유 NFT 목록
- isLoading: boolean              // 로딩 중

// 구조체
interface NFT {
  tokenId: number;
  ballotId: string;
  ballotTitle: string;
  imageURI: string;               // 마스코트 이미지
  voter: string;
  timestamp: number;
}
```

**NFT 조회 로직** (`voting.ts`):
```typescript
export async function getUserNFTs(
  userAddress: string
): Promise<NFT[]> {
  // ERC721 balance_of, token_of_owner_by_index 호출
  // 각 NFT의 메타데이터 조회
  // 반환: 사용자의 모든 리워드 NFT
}
```

---

#### Web3 통합 레이어 (`lib/` 폴더)

##### web3.ts - Web3 초기화 및 관리

```typescript
import Web3 from 'web3';

export const web3 = new Web3(
  new Web3.providers.HttpProvider(
    process.env.REACT_APP_RPC || 'http://localhost:10545'
  )
);

export async function connectWallet(): Promise<string> {
  // MetaMask 연결 요청
  // 반환: 연결된 지갑 주소
}

export function getContractInstance(
  contractName: 'CitizenSBT' | 'VotingWithSBT' | 'VotingRewardNFT'
): Contract {
  // ABI와 배포된 주소로 컨트랙트 인스턴스 생성
}
```

**환경 변수** (`.env.local` - 자동 생성):
```bash
REACT_APP_RPC=http://localhost:10545
REACT_APP_CITIZEN_SBT_ADDRESS=0x...
REACT_APP_VOTING_CONTRACT_ADDRESS=0x...
REACT_APP_REWARD_NFT_ADDRESS=0x...
REACT_APP_VERIFIER_ADDRESS=0x...
```

---

##### sbt.ts - CitizenSBT 상호작용

```typescript
// 주요 함수

export async function mintSBT(
  toAddress: string,
  identityHash: string,
  verifierAddress: string
): Promise<TransactionReceipt> {
  // CitizenSBT.mint() 호출
  // 트랜잭션 마이닝 대기
}

export async function isCitizen(
  address: string
): Promise<boolean> {
  // CitizenSBT.isCitizen() 호출 (읽기 전용)
}

export async function getSBTTokenId(
  address: string
): Promise<number | null> {
  // 사용자의 SBT 토큰 ID 조회
}
```

---

##### voting.ts - VotingWithSBT + VotingRewardNFT 상호작용

```typescript
// 주요 함수

export async function castVote(
  voterAddress: string,
  proposalId: number
): Promise<{ txHash: string; nftTokenId: number }> {
  // 1. 사전 검증 (SBT 소유 확인)
  // 2. VotingWithSBT.vote() 호출
  // 3. VotingRewardNFT 발급 확인
  // 4. 반환: 트랜잭션 해시 + NFT ID
}

export async function getProposals(): Promise<Proposal[]> {
  // VotingWithSBT에서 모든 후보 정보 조회
}

export async function getResults(): Promise<Proposal[]> {
  // 실시간 투표 결과 조회
}

export async function getUserNFTs(
  address: string
): Promise<NFTMetadata[]> {
  // 사용자의 모든 리워드 NFT 조회
}

export async function getVotingSchedule(): Promise<{
  opensAt: number;
  closesAt: number;
  announcesAt: number;
}> {
  // 현재 투표의 일정 (나노초)
}
```

---

## 🔄 사용자 투표 플로우

```
┌─────────────────────────────────────────────────────────────┐
│           전체 투표 프로세스 시퀀스 다이어그램             │
└─────────────────────────────────────────────────────────────┘

1️⃣  AuthPage
    ├─ MetaMask 연결
    └─ 사용자 이름 입력
        ↓
2️⃣  RegisterPage
    ├─ Identity Hash = keccak256(userName)
    ├─ CitizenSBT.mint(userAddress, identityHash)
    ├─ 트랜잭션 완료 대기
    └─ SBT 토큰 발급 완료
        ↓
3️⃣  VotingApp
    ├─ 후보 목록 로드: VotingWithSBT.getProposals()
    ├─ 후보 선택
    ├─ VotingWithSBT.vote(proposalId)
    │  └─ 내부: CitizenSBT.isCitizen() 검증
    ├─ 투표 완료
    ├─ VotingRewardNFT.mint(userAddress, ballotId, proposalId)
    └─ 리워드 NFT 자동 발급
        ↓
4️⃣  MyNFTsPage
    ├─ VotingRewardNFT.balanceOf(userAddress)
    ├─ 사용자의 모든 NFT 조회
    └─ 마스코트 이미지 + 메타데이터 표시
```

---

## ⚙️ 배포 및 실행 플로우

### 초기 배포 (개발 환경)

```bash
# 1단계: 네트워크 + 컨트랙트 + 환경 자동 배포
cd blockchain_contracts
./scripts/setup_and_deploy.sh

# 2단계: 프론트엔드 실행 (별도 터미널)
cd frontend
npm install
npm start
# 브라우저: http://localhost:3000
```

**자동으로 생성되는 파일**:
- `blockchain_contracts/artifacts/sbt_deployment.json` - 배포 정보
- `frontend/.env.local` - 환경변수 자동 설정
- `frontend/src/abi/*.json` - 컨트랙트 ABI 복사

### 재배포 (투표 일정/후보 변경)

```bash
cd blockchain_contracts

# deploy.env 파일 수정
cp deploy.env.example deploy.env
# 파일 편집: PROPOSALS, BALLOT_TITLE, BALLOT_OPENS_AT 등

# 재배포 실행
./scripts/redeploy_contract.sh
# → 새 컨트랙트 배포
# → artifacts/sbt_deployment.json 업데이트
# → frontend/.env.local 자동 갱신
```

### 수동 배포 (고급)

```bash
cd blockchain_contracts

# 1. 컨트랙트만 배포
node scripts/deploy_sbt_system.js

# 2. 환경파일 수동 갱신
# frontend/.env.local:
REACT_APP_RPC=http://localhost:10545
REACT_APP_CITIZEN_SBT_ADDRESS=0x... (artifacts/sbt_deployment.json에서 복사)
REACT_APP_VOTING_CONTRACT_ADDRESS=0x...
REACT_APP_REWARD_NFT_ADDRESS=0x...
REACT_APP_VERIFIER_ADDRESS=0x...
```

---

## 🗄️ 데이터 흐름 다이어그램

### 신원 검증 흐름 (SBT 발급)

```
RegisterPage
    ↓
userName → keccak256(userName) → identityHash
    ↓
CitizenSBT.mint(userAddress, identityHash)
    ↓
    ├─ identityToWallet[identityHash] = userAddress (중복 방지)
    ├─ hasSBT[userAddress] = true
    ├─ _safeMint(userAddress, tokenId)
    ├─ tokenToIdentity[tokenId] = identityHash
    └─ emit SBTMinted(userAddress, tokenId, identityHash)
    ↓
SBT 발급 완료 → VotingApp 접근 가능
```

### 투표 흐름 (투표 진행)

```
VotingApp (후보 선택)
    ↓
VotingWithSBT.vote(proposalId)
    ↓
    ├─ require(block.timestamp >= opensAt)      ✅ 투표 시작 확인
    ├─ require(block.timestamp < closesAt)      ✅ 투표 종료 확인
    ├─ require(!hasVoted[msg.sender])           ✅ 중복 투표 확인
    ├─ require(citizenSBT.isCitizen(msg.sender))✅ SBT 소유 확인
    └─ require(proposalId < _proposals.length)  ✅ 후보 존재 확인
    ↓
    ├─ _proposals[proposalId].voteCount++
    ├─ hasVoted[msg.sender] = true
    ├─ voterChoice[msg.sender] = proposalId
    ├─ emit VoteCast(msg.sender, proposalId, nftTokenId)
    └─
        └─ rewardNFT.mint(msg.sender, ballotId, proposalId)
            ├─ 리워드 NFT 발급
            └─ tokenToBallot[tokenId] = ballotId
    ↓
투표 완료 → NFT 발급 → MyNFTsPage에서 조회 가능
```

### 결과 조회 흐름

```
VotingApp (결과 보기)
    ↓
VotingWithSBT.getResults()
    ↓
    ├─ Proposal[] 배열 반환
    ├─ 각 Proposal: {name, voteCount}
    └─ 프론트엔드: 실시간 계산 (비율, 순위 등)
    ↓
결과 시각화 (차트, 퍼센티지 등)
```

---

## 🔐 보안 메커니즘

### 1. 신원 검증 (CitizenSBT)

| 메커니즘 | 설명 | 방지 대상 |
|----------|------|----------|
| **SBT (Soulbound)** | 비이전 토큰 | 투표권 거래 |
| **Identity Hash 매핑** | `identityToWallet` 단방향 매핑 | 신원 도용 |
| **1-to-1 바인딩** | 하나의 지갑 = 하나의 SBT | 중복 계정 |
| **Verifier 권한** | 발급자 주소 제한 | 무단 SBT 발급 |

### 2. 투표 무결성 (VotingWithSBT)

| 메커니즘 | 설명 | 방지 대상 |
|----------|------|----------|
| **SBT 검증** | `citizenSBT.isCitizen()` | 미검증 사용자 투표 |
| **시간 검증** | `opensAt` ≤ `block.timestamp` < `closesAt` | 시간 외 투표 |
| **중복 투표 방지** | `hasVoted` 매핑 | 이중 투표 |
| **제안 범위 검증** | `proposalId < _proposals.length` | 범위 초과 공격 |

### 3. 나노초 정밀도

```
// 투표 일정 (나노초 단위)
BALLOT_OPENS_AT:  2025-11-12 09:00:00 → 1762857600000000000 ns
BALLOT_CLOSES_AT: 2025-11-12 18:00:00 → 1762893600000000000 ns
BALLOT_ANNOUNCES: 2025-11-12 19:00:00 → 1762897200000000000 ns

// Quorum의 block.timestamp도 나노초 → 오차 없음
```

---

## 📊 주요 데이터 구조

### CitizenSBT

```json
{
  "name": "CitizenSBT",
  "symbol": "CSBT",
  "verifier": "0x...",
  "tokens": [
    {
      "tokenId": 1,
      "owner": "0x...",
      "identityHash": "0x...",
      "transferable": false
    }
  ],
  "mappings": {
    "identityToWallet": "bytes32 → address",
    "hasSBT": "address → bool",
    "tokenToIdentity": "uint256 → bytes32"
  }
}
```

### VotingWithSBT

```json
{
  "name": "VotingWithSBT",
  "ballot": {
    "id": "ballot_2025_11",
    "title": "2025 가을 대선",
    "opensAt": 1762857600000000000,
    "closesAt": 1762893600000000000,
    "announcesAt": 1762897200000000000
  },
  "proposals": [
    {
      "id": 0,
      "name": "후보A",
      "voteCount": 45
    },
    {
      "id": 1,
      "name": "후보B",
      "voteCount": 38
    }
  ],
  "voters": [
    {
      "address": "0x...",
      "hasVoted": true,
      "choice": 0
    }
  ]
}
```

### VotingRewardNFT

```json
{
  "name": "VotingRewardNFT",
  "symbol": "VRNFT",
  "tokens": [
    {
      "tokenId": 1,
      "owner": "0x...",
      "ballotId": "ballot_2025_11",
      "proposalId": 0,
      "timestamp": 1762862400000000000,
      "imageURI": "ipfs://..."
    }
  ],
  "ballotMascots": {
    "ballot_2025_11": "ipfs://Qm..."
  }
}
```

---

## 🚀 프로덕션 체크리스트

### 배포 전 확인사항

- [ ] **네트워크 설정**
  - [ ] `network/.env` 합의 알고리즘 확인 (권장: qbft)
  - [ ] RPC 포트 확인 (기본: 9545)
  - [ ] 모든 validator 노드 실행 확인

- [ ] **컨트랙트 배포**
  - [ ] `deploy.env` 파일 설정
    - [ ] BALLOT_TITLE, PROPOSALS 설정
    - [ ] BALLOT_OPENS_AT, CLOSES_AT 설정
    - [ ] VERIFIER_ADDRESS 설정
  - [ ] `setup_and_deploy.sh` 실행
  - [ ] `artifacts/sbt_deployment.json` 생성 확인

- [ ] **프론트엔드 설정**
  - [ ] `.env.local` 자동 생성 확인
  - [ ] 환경변수 유효성 검증
  - [ ] `frontend/src/abi/` ABI 파일 존재 확인

- [ ] **MetaMask 설정**
  - [ ] RPC 주소: `http://localhost:10545`
  - [ ] 체인 ID: 1337 (테스트넷 기본값)
  - [ ] 통화: ETH

### 테스트 시나리오

```bash
# 1. 네트워크 상태 확인
curl -X POST http://localhost:9545 \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'

# 2. 배포 정보 확인
cat blockchain_contracts/artifacts/sbt_deployment.json

# 3. 컨트랙트 상호작용 테스트
node blockchain_contracts/scripts/verify_sbt.js
node blockchain_contracts/scripts/cast_vote.js

# 4. 프론트엔드 테스트
cd frontend && npm start
# → http://localhost:3000 접속
# → AuthPage → RegisterPage → VotingApp 플로우 테스트
```

---

## 📝 추가 리소스

- **프로젝트 루트 README**: `README.md` (큰 그림)
- **프론트엔드 가이드**: `frontend/RUN_GUIDE.md`
- **AI 에이전트 가이드**: `.github/copilot-instructions.md`
- **기본 Quorum 프로젝트**: [ConsenSys/quorum-dev-quickstart](https://github.com/ConsenSys/quorum-dev-quickstart)
- **OpenZeppelin 계약**: [openzeppelin/contracts](https://docs.openzeppelin.com/contracts/)
- **Solidity 문서**: [soliditylang.org](https://soliditylang.org/)
- **Web3.js 문서**: [web3js.org](https://web3js.org/)

---

## 🔧 문제 해결

### 배포 실패

```bash
# 1. RPC 접근성 확인
curl -X POST http://localhost:9545 \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'

# 2. 네트워크 상태 확인
cd network && docker-compose ps

# 3. 네트워크 재시작
docker-compose down -v
docker-compose up -d
```

### 프론트엔드 연결 실패

```bash
# 1. 환경변수 확인
cat frontend/.env.local

# 2. RPC 연결 테스트
curl http://localhost:9545

# 3. MetaMask 설정 확인
# - RPC: http://localhost:10545
# - 체인 ID: 1337
```

### 투표 권한 없음 (SBT 미발급)

```bash
# 1. SBT 발급 확인
node blockchain_contracts/scripts/verify_sbt.js

# 2. CitizenSBT 컨트랙트 상태 확인
node -e "
const Web3 = require('web3');
const w3 = new Web3('http://localhost:9545');
const deployment = require('./blockchain_contracts/artifacts/sbt_deployment.json');
const contract = new w3.eth.Contract(deployment.contracts.CitizenSBT.abi, deployment.contracts.CitizenSBT.address);
contract.methods.isCitizen('YOUR_ADDRESS').call().then(console.log);
"
```

---

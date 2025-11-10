# Blockchain Consensus Algorithm Performance Testing

이 저장소는 Quorum 블록체인의 다양한 합의 알고리즘(IBFT, QBFT, Raft)의 성능을 비교 분석하기 위한 실험 환경입니다.

## ⚡ 빠른 시작 (완전히 새로운 환경)

```bash
# 1. 저장소 클론
git clone https://github.com/capstone-design2-agora/blockchain-test.git
cd blockchain-test

# 2. 사전 요구사항 확인
# - Docker & Docker Compose
# - Python 3.8+
# - Node.js 16+
# - pip3

# 3. 모든 설정 자동 실행 (네트워크 시작 + 의존성 설치 + 컨트랙트 배포)
cd quorum-lab
./setup_and_deploy.sh

# 4. 벤치마크 실행
./run_raft_benchmarks.sh
```

그게 전부입니다! 🎉

---

## 🔗 기반 프로젝트

이 프로젝트는 [Quorum Dev Quickstart](https://github.com/ConsenSys/quorum-dev-quickstart)를 기반으로 구성되었습니다.

## 📁 프로젝트 구조

```
blockchain-test/
├── quorum-test-network/          # Quorum 테스트 네트워크 (실험에 사용)
│   ├── docker-compose.yml        # 메인 compose 파일 (.env로 합의 알고리즘 선택)
│   └── ...
├── quorum-lab/                   # 실험 스크립트 및 결과
│   ├── contracts/VotingWithNFT.sol       # NFT 기반 투표 컨트랙트
│   ├── deploy_contract.js                # 컨트랙트 배포 스크립트
│   ├── deploy.env.example                # [신규] 배포 설정 템플릿
│   ├── redeploy_contract.sh              # [신규] 컨트랙트 재배포 스크립트
│   ├── setup_and_deploy.sh               # 네트워크 시작 + 배포 자동화
│   ├── benchmark.py                      # 성능 벤치마크 스크립트
│   ├── run_raft_benchmarks.sh            # Raft 벤치마크 실행 스크립트
│   ├── run_qbft_benchmarks.sh            # QBFT 벤치마크 실행 스크립트
│   ├── cast_vote.js                      # [신규] 투표 트랜잭션 전송
│   ├── check_vote.js                     # [신규] 투표 상태 확인
│   ├── debug_transaction.js              # [신규] 트랜잭션 디버깅
│   └── check_nft_receipt.py              # NFT 트랜잭션 검증 스크립트
├── frontend/                     # [신규] React 기반 투표 UI
│   ├── src/
│   │   ├── components/VotingApp.tsx      # 투표 메인 컴포넌트
│   │   ├── lib/voting.ts                 # 투표 로직
│   │   └── lib/web3.ts                   # Web3 연결
│   ├── package.json
│   └── README.md
├── test_result/                  # 실험 결과 (gitignored, 샘플만 포함)
│   ├── ibft/                     # IBFT 벤치마크 결과
│   ├── qbft/                     # QBFT 벤치마크 결과
│   ├── raft/                     # Raft 벤치마크 결과
│   └── BENCHMARK_ANALYSIS_REPORT.md  # 종합 분석 리포트
└── quorum-besu-network/          # Besu 네트워크 (참고용)
```

## 🎯 실험 목적

서로 다른 합의 알고리즘에서 NFT 기반 투표 시스템의 성능을 측정하고 비교:
- **처리량 (TPS)**: 초당 트랜잭션 처리 수
- **블록 생성 간격**: 블록 생성 주기 및 안정성
- **확인 지연 시간**: 트랜잭션 전송부터 확인까지의 시간

## 🚀 실험 재현 방법

### 방법 1: 자동 설정 스크립트 (권장)

```bash
cd quorum-lab

# 네트워크 시작 + 스마트 컨트랙트 배포 (한 번에 처리)
./setup_and_deploy.sh
```

이 스크립트는 다음을 자동으로 처리합니다:
- 합의 알고리즘 확인 (.env 파일)
- 네트워크 시작 및 상태 확인
- Node.js 의존성 설치
- 스마트 컨트랙트 배포 (필요한 경우에만)

### 방법 2: 수동 설정

#### 1. 사전 요구사항

- Docker & Docker Compose
- Python 3.8+
- Node.js 16+

#### 2. 네트워크 실행

```bash
cd quorum-test-network

# .env.example을 복사하여 .env 생성
cp .env.example .env

# 합의 알고리즘 선택 (raft, qbft, istanbul 중 하나)
# .env 파일에서 GOQUORUM_CONS_ALGO 값을 변경
# 예: GOQUORUM_CONS_ALGO=raft

# 네트워크 시작
docker compose up -d

# 네트워크 상태 확인
docker compose ps
```

**참고**: 
- `.env.example` 파일에는 기본 설정(qbft)이 포함되어 있습니다
- `GOQUORUM_CONS_ALGO` 값은 소문자로 입력: `raft`, `qbft`, `istanbul`

#### 3. 스마트 컨트랙트 배포

```bash
cd quorum-lab

# Node.js 의존성 설치 (최초 1회)
npm install solc@0.8.20 web3@1.10.2 @openzeppelin/contracts@5.0.0

# 컨트랙트 배포
node deploy_contract.js
```

배포가 성공하면 `quorum-lab/artifacts/` 디렉토리에 deployment.json과 ABI 파일이 생성됩니다.

**참고**: 
- 컨트랙트는 **블록체인에 영구 저장**되므로 한 번만 배포하면 됩니다
- `deployment.json`은 컨트랙트 주소를 기록하는 참조 파일입니다
- 네트워크 재시작(`docker compose restart` 또는 `down/up`)시 재배포 불필요
- 완전 초기화(`docker compose down -v`)시에만 재배포 필요

**컨트랙트 재배포**:

네트워크는 유지한 채 새로운 컨트랙트를 배포하려면:

```bash
cd quorum-lab

# 1. deploy.env 파일 수정 (투표 시간, 후보자 등)
cp deploy.env.example deploy.env
nano deploy.env  # 또는 원하는 에디터 사용

# 2. 재배포 (자동으로 .env.local도 업데이트)
./redeploy_contract.sh
```

#### 4. 프론트엔드 실행 (선택사항)

웹 UI를 통해 투표하려면:

```bash
cd frontend

# Node.js 의존성 설치 (최초 1회)
npm install

# .env.local 파일 설정
cp .env.example .env.local
# REACT_APP_VOTING_ADDRESS는 redeploy_contract.sh 실행 시 자동 업데이트됨

# 개발 서버 시작
npm start
```

브라우저에서 `http://localhost:3000` 접속하여 투표 UI 사용

**주요 기능**:
- MetaMask 연결
- 후보자 목록 및 공약 확인
- 투표 및 NFT 영수증 발행
- 결과 발표 시간 이후 최다득표자 당선 표시

#### 5. 벤치마크 실행

```bash
cd quorum-lab

# Python 의존성 설치
pip install web3 eth-account python-dotenv

# Raft 벤치마크 실행 (TPS: 50, 100, 250, 500 / 각 5회 반복)
./run_raft_benchmarks.sh

# QBFT 벤치마크 실행
./run_qbft_benchmarks.sh
```

벤치마크 결과는 `test_result/[consensus]/[tps]/` 디렉토리에 저장됩니다.

#### 6. 투표 테스트 (선택사항)

CLI로 투표를 테스트하려면:

```bash
cd quorum-lab

# 투표 상태 확인
node check_vote.js

# 투표하기 (proposal ID: 0, 1, 2...)
node cast_vote.js --proposal 0

# 트랜잭션 디버깅
node debug_transaction.js
```

### ⚠️ 합의 알고리즘 변경 시 주의사항

**IBFT ↔ QBFT ↔ Raft 간 변경 시 블록체인 데이터 완전 초기화 필수!**

각 합의 알고리즘은 서로 다른 genesis 파일(extraData 포함)을 사용합니다. 알고리즘을 변경할 때:

```bash
cd quorum-test-network

# 1. 네트워크 중지 및 볼륨 삭제 (블록체인 데이터 완전 초기화)
docker-compose down -v

# 2. .env에서 합의 알고리즘 변경
sed -i 's/GOQUORUM_CONS_ALGO=.*/GOQUORUM_CONS_ALGO=raft/' .env

# 3. 네트워크 재시작 (자동으로 새 genesis 적용)
docker-compose up -d

# 4. 스마트 컨트랙트 재배포
cd ../quorum-lab
node deploy_contract.js
```

**작동 원리**:
- 각 노드의 entrypoint가 `${GOQUORUM_CONS_ALGO}-standard-genesis.json` 파일을 자동 선택
- `geth init`으로 올바른 extraData를 가진 genesis 블록 생성
- 볼륨 삭제(`-v`)로 기존 블록체인 데이터 완전 제거

**중요**: `docker-compose restart`나 `down/up`(볼륨 유지)는 genesis를 재적용하지 않으므로 `-v` 옵션이 필수입니다.

#### 7. 결과 분석

실험 결과는 `test_result/BENCHMARK_ANALYSIS_REPORT.md`에서 확인할 수 있습니다.

## 📊 실험 결과 샘플

`test_result/` 디렉토리에는 각 합의 알고리즘별 벤치마크 결과가 TPS별로 정리되어 있습니다:

```
test_result/
├── raft/
│   ├── 50/    # 50 TPS 벤치마크 결과 (5회)
│   ├── 100/   # 100 TPS 벤치마크 결과 (5회)
│   ├── 250/   # 250 TPS 벤치마크 결과 (5회)
│   └── 500/   # 500 TPS 벤치마크 결과 (5회)
├── qbft/      # 동일한 구조
└── ibft/      # 동일한 구조
```

## 🔧 주요 추가/수정 파일

### 프론트엔드
- `frontend/src/components/VotingApp.tsx`: 메인 투표 UI 컴포넌트
- `frontend/src/lib/voting.ts`: 투표 스마트 컨트랙트 연동
- `frontend/src/lib/web3.ts`: Web3 연결 및 지갑 관리
- `frontend/src/App.css`: UI 스타일링 (당선자 배지 포함)

### 스마트 컨트랙트 & 배포
- `quorum-lab/contracts/VotingWithNFT.sol`: NFT 기반 투표 컨트랙트
- `quorum-lab/deploy_contract.js`: 컨트랙트 배포 스크립트
- `quorum-lab/deploy.env.example`: 배포 설정 템플릿
- `quorum-lab/redeploy_contract.sh`: 컨트랙트 재배포 자동화
- `quorum-lab/setup_and_deploy.sh`: 네트워크 시작 + 배포 자동화

### 투표 도구
- `quorum-lab/cast_vote.js`: 투표 트랜잭션 전송
- `quorum-lab/check_vote.js`: 투표 상태 및 메타데이터 확인
- `quorum-lab/debug_transaction.js`: 트랜잭션 디버깅

### 벤치마크 스크립트
- `quorum-lab/benchmark.py`: 성능 측정 메인 스크립트
- `quorum-lab/run_raft_benchmarks.sh`: Raft 벤치마크 자동화
- `quorum-lab/run_qbft_benchmarks.sh`: QBFT 벤치마크 자동화
- `quorum-lab/check_nft_receipt.py`: NFT 트랜잭션 검증
- `quorum-lab/check_csv_results.py`: CSV 결과 분석

### 디버깅 도구
- `quorum-lab/diagnose.js`: 종합 진단
- `quorum-lab/check_time.js`: 블록체인 시간 확인
- `quorum-lab/check_ballot_times.py`: 투표 시간 검증
- `quorum-lab/fix_ballot_schedule.js`: 투표 일정 수정
- `quorum-lab/test_ballot_metadata.js`: 메타데이터 테스트

## 📝 실험 설정

- **네트워크 구성**: 7-validator 노드
- **테스트 워크로드**: 1000개 투표 트랜잭션 (alwaysburst 모드)
- **TPS 타겟**: 50, 100, 250, 500
- **반복 횟수**: 각 TPS당 5회
- **타임아웃**: 240초
- **Receipt Workers**: 20

## 🛠 문제 해결

### 네트워크 재시작
```bash
cd quorum-test-network
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
cd quorum-test-network
docker compose down -v  # 볼륨까지 삭제
cd ../quorum-lab
./setup_and_deploy.sh   # 자동으로 재배포 포함
```

## ✅ 재현 확인 체크리스트

처음 시작하는 환경에서 다음을 확인하세요:

- [ ] Docker 설치 확인: `docker --version`
- [ ] Docker Compose 설치 확인: `docker compose version`
- [ ] Python 3 설치 확인: `python3 --version`
- [ ] Node.js 설치 확인: `node --version`
- [ ] pip3 설치 확인: `pip3 --version`
- [ ] 저장소 클론: `git clone https://github.com/capstone-design2-agora/blockchain-test.git`
- [ ] 설정 스크립트 실행: `cd quorum-lab && ./setup_and_deploy.sh`
- [ ] 네트워크 상태 확인: `cd quorum-test-network && docker compose ps`
- [ ] 컨트랙트 주소 확인: `cat quorum-lab/artifacts/deployment.json | grep address`
- [ ] 벤치마크 실행: `cd quorum-lab && ./run_raft_benchmarks.sh`

모든 체크리스트가 통과하면 실험 재현 성공! ✨

## 📄 라이선스

이 프로젝트는 MIT 라이선스 하에 배포됩니다. 자세한 내용은 [LICENSE](LICENSE) 파일을 참조하세요.

### Third-Party Licenses

이 프로젝트는 다음 오픈소스 프로젝트를 기반으로 합니다:

- **Quorum Dev Quickstart** (ConsenSys) - Apache-2.0 License
  - Repository: https://github.com/ConsenSys/quorum-dev-quickstart
  - Used: `quorum-test-network/`, `quorum-besu-network/` 디렉토리
  - 원본 코드에서 수정: Docker 설정, 네트워크 구성

- **OpenZeppelin Contracts** - MIT License
  - Repository: https://github.com/OpenZeppelin/openzeppelin-contracts
  - Used: ERC-721 implementation in VotingWithNFT.sol

### 우리의 기여

이 저장소에서 추가한 원본 작업:
- NFT 기반 투표 스마트 컨트랙트 (`quorum-lab/contracts/VotingWithNFT.sol`)
- 성능 벤치마크 도구 (`quorum-lab/benchmark.py`, `run_*_benchmarks.sh`)
- 자동화 스크립트 (`quorum-lab/setup_and_deploy.sh`, `deploy_contract.js`)
- 실험 결과 및 분석 (`test_result/`, `BENCHMARK_ANALYSIS_REPORT.md`)
- 문서화 (이 README 및 관련 가이드)

## 📚 참고 문서

- [GoQuorum Documentation](https://consensys.net/docs/goquorum/)
- [Quorum Dev Quickstart](https://github.com/ConsenSys/quorum-dev-quickstart)
- [Web3.py Documentation](https://web3py.readthedocs.io/)

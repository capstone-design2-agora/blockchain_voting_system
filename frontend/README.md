# Agora Voting Frontend

React 기반의 Agora 투표 UI는 GoQuorum 네트워크에 배포된 `VotingWithNFT` 컨트랙트와 직접 통신합니다. 아래 순서를 따르면 환경 변수 설정과 실행을 한 번에 끝낼 수 있습니다.

## 빠른 시작
1. 루트에서 `./blockchain_contracts/setup_and_deploy.sh`를 실행하면 네트워크 부팅, 컨트랙트 배포, ABI 복사, `.env.local` 동기화가 자동으로 진행됩니다.
2. 프런트엔드 디렉터리로 이동해 의존성을 설치합니다.
   ```bash
   cd frontend
   npm install
   ```
3. 개발 서버를 실행합니다.
   ```bash
   npm start
   ```
   브라우저가 자동으로 `http://localhost:3000`을 엽니다. 최초 로딩 시 지갑을 연결하고 체인이 일치하는지 확인해 주세요.

## 환경 변수
`frontend/.env.example`은 스크립트가 항상 최신 값으로 갱신해 주는 템플릿입니다. 필요 시 아래 값을 수정한 뒤 `.env.local`에 반영하세요.

| 키 | 설명 | 기본값 |
| --- | --- | --- |
| `REACT_APP_RPC` | GoQuorum JSON-RPC 엔드포인트 | `http://localhost:9545` |
| `REACT_APP_VOTING_ADDRESS` | 배포된 `VotingWithNFT` 컨트랙트 주소 | 배포 결과 자동 입력 |
| `REACT_APP_EXPECTED_VOTERS` | 투표율 계산 시 사용할 기준 인원 | `1000` |
| `REACT_APP_CHAIN_ID` | 예상 체인 ID(16진수) | `0x539` |
| `REACT_APP_CHAIN_NAME` | UI에 노출할 체인 이름 | `Quorum Local` |

`.env.local`이 존재하지 않으면 `setup_and_deploy.sh`가 템플릿을 복사하고, 컨트랙트 주소가 바뀔 때마다 자동으로 최신 주소를 주입합니다.

## npm 스크립트
- `npm start`: 개발 서버 실행.
- `npm run build`: 최적화된 정적 산출물을 `build/`에 생성.
- `npm test`: CRA 테스트 러너 실행.

## 문제 해결
- **지갑이 감지되지 않는 경우**: MetaMask 또는 호환 지갑을 설치하고 `http://localhost:9545` RPC와 체인 ID `1337 (0x539)`을 등록하세요.
- **잘못된 체인 경고**: `.env.local`의 `REACT_APP_CHAIN_ID`가 실제 메타마스크 네트워크와 일치하는지 확인하세요.
- **컨트랙트 주소 미설정 오류**: `blockchain_contracts/artifacts/deployment.json`에서 `contract.address`를 복사해 `REACT_APP_VOTING_ADDRESS`에 넣거나, 배포 스크립트를 다시 실행해 자동으로 동기화하세요.

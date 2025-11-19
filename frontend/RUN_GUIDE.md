# Frontend Build & Run Guide

## 0. 사전 준비
1. 루트 디렉터리에서 `./blockchain_contracts/setup_and_deploy.sh`를 실행합니다.
   - GoQuorum 네트워크가 부팅되고 컨트랙트가 배포됩니다.
   - `frontend/.env.local`, `.env.example`이 자동으로 최신 값으로 채워집니다.
   - ABI(`frontend/src/abi/Voting.json`)도 동기화됩니다.
2. 환경 파일을 직접 수정하고 싶은 경우:
   ```bash
   cd frontend
   cp .env.example .env.local
   # REACT_APP_VOTING_ADDRESS 등 값을 원하는 대로 수정
   ```

## 1. 의존성 설치 (최초 1회)
```bash
npm install
```

## 2. 개발 서버 실행
```bash
npm start
```
- 기본 브라우저에서 `http://localhost:3000`이 자동으로 열립니다.
- 자동으로 열리지 않는 경우 브라우저 주소창에 직접 입력하세요.
- 코드 수정 시 핫 리로드로 즉시 반영됩니다.
- 최초 로딩 시 MetaMask 등 지갑을 연결하고 체인 ID(`1337`)가 일치하는지 확인합니다.

## 3. 프로덕션 빌드
```bash
npm run build
```
- 최적화된 정적 파일이 `build/` 폴더에 생성됩니다.
- 이 폴더의 내용을 웹 서버에 배포할 수 있습니다.

## 4. 빌드 결과 확인 (선택 사항)
```bash
npx serve -s build
```
- 위 명령 실행 후 브라우저에서 안내되는 주소(`http://localhost:3000` 등)로 접속해 배포용 빌드를 확인합니다.
- `npx serve` 패키지가 없으면 자동으로 설치를 진행합니다.

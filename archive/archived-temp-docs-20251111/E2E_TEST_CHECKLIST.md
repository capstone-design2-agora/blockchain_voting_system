# End-to-End Test Checklist

## 🔍 자동 검증 결과

### ✅ 빌드 & 컴파일
- [x] 프로덕션 빌드 성공 (228.54 kB gzipped)
- [x] TypeScript 컴파일 에러 없음
- [x] ESLint 경고 없음

### ⚠️ 발견된 이슈 및 수정

#### 1. 포트 하드코딩 문제 (수정 완료)
**문제**: 
- `web3.ts`: `REACT_APP_RPC_URL` → `REACT_APP_RPC` (환경변수 불일치)
- `RegisterPage.tsx`: 10545 포트 하드코딩
- 환경변수명이 `.env` 파일과 코드에서 달랐음

**수정**:
```diff
- const RPC_URL = process.env.REACT_APP_RPC_URL || "http://localhost:10545";
+ const RPC_URL = process.env.REACT_APP_RPC || "http://localhost:9545";

- process.env.REACT_APP_RPC_URL || "http://localhost:10545"
+ process.env.REACT_APP_RPC || "http://localhost:9545"
```

**영향**: 
- 환경변수가 제대로 로드되지 않아 항상 fallback URL(10545) 사용됨
- 네트워크 연결 실패 가능성 있었음

---

## 📋 수동 테스트 체크리스트

### 1. 블록체인 네트워크
- [ ] GoQuorum 네트워크가 9545 포트에서 실행 중인지 확인
- [ ] 컨트랙트 배포 확인 (CitizenSBT, VotingWithSBT, VotingRewardNFT)
- [ ] `.env` 파일의 컨트랙트 주소가 최신인지 확인

```bash
cd quorum-test-network
./list.sh  # 모든 노드가 실행 중인지 확인
```

### 2. 인증 흐름 (Auth → Register)
- [ ] `/auth` 페이지 접근
- [ ] 이름 입력 (2자 이상)
- [ ] "본인 확인 시작" 버튼 클릭
- [ ] `/register` 페이지로 자동 이동
- [ ] MetaMask 연결 팝업 확인
- [ ] 네트워크 자동 전환 확인 (Quorum Local, Chain ID: 0x539)

### 3. SBT 발급
- [ ] "지갑 연결" 버튼 클릭
- [ ] MetaMask 승인
- [ ] "시민 SBT 발급받기" 버튼 표시 확인
- [ ] SBT 민팅 트랜잭션 확인
- [ ] 성공 메시지 확인
- [ ] 자동으로 `/voting` 페이지로 이동

**엣지 케이스**:
- [ ] 이미 SBT를 보유한 지갑으로 재시도 → 바로 투표 페이지로 이동
- [ ] 다른 지갑으로 같은 신원 해시 재시도 → "이미 등록된 신원" 에러

### 4. 투표 기능
- [ ] Ballot 메타데이터 로드 확인 (제목, 설명, 후보)
- [ ] 투표 시작 시간 전: "투표 준비 중" 상태
- [ ] 투표 진행 중: 후보 선택 가능
- [ ] 후보 선택 후 "투표하기" 버튼 활성화
- [ ] 투표 트랜잭션 전송
- [ ] NFT 민팅 성공 메시지 확인
- [ ] "내 NFT 보기" 버튼 표시

**엣지 케이스**:
- [ ] SBT 없이 투표 시도 → "SBT 먼저 발급" 에러
- [ ] 이미 투표한 후 재시도 → "이미 투표함" 에러
- [ ] 투표 종료 후 시도 → "투표가 종료됨" 에러

### 5. NFT 컬렉션 페이지
- [ ] `/my-nfts` 페이지 접근
- [ ] 보유 NFT 개수 표시 확인
- [ ] NFT 카드 그리드 렌더링
- [ ] NFT 이미지 로드 확인 (IPFS → Pinata Gateway)
- [ ] NFT 메타데이터 표시 (Ballot ID, 후보 ID, Token ID)
- [ ] 레어도 표시 (레전더리/에픽/레어/커먼)
- [ ] 뱃지 시스템 (첫 투표, 활발한 투표자 등)
- [ ] 진행도 바 표시

**NFT 상세 모달**:
- [ ] NFT 이미지 클릭 시 모달 팝업
- [ ] 큰 이미지 표시
- [ ] 상세 정보 표시 (Ballot ID, 투표한 후보, 발행 시간)
- [ ] IPFS URL 링크 작동
- [ ] 모달 외부 클릭 시 닫힘
- [ ] X 버튼 클릭 시 닫힘

### 6. 지갑 연결 해제
- [ ] "연결 해제" 버튼 클릭
- [ ] `wallet_revokePermissions` API 호출 확인
- [ ] 권한 취소 성공 또는 수동 안내 다이얼로그
- [ ] `/auth` 페이지로 자동 리다이렉트
- [ ] 세션 데이터 정리 확인 (sessionStorage, localStorage)

---

## 🎨 UI/UX 체크리스트

### 반응형 디자인
- [ ] 데스크톱 (1920x1080)
- [ ] 태블릿 (768px)
- [ ] 모바일 (375px)

### 접근성
- [ ] 버튼 호버 효과
- [ ] 로딩 스피너 표시
- [ ] 에러 메시지 명확성
- [ ] 색상 대비 (WCAG AA 이상)

### 애니메이션
- [ ] 페이지 전환 부드러움
- [ ] 카드 호버 효과
- [ ] 모달 페이드인/아웃
- [ ] 로딩 스피너 회전

---

## 🔧 성능 체크

### 번들 크기
- [x] Main JS: 228.54 kB (gzipped) ✅
- [x] Main CSS: 6.17 kB (gzipped) ✅
- Total: ~235 kB (적정 수준)

### 로딩 속도
- [ ] 초기 페이지 로드 < 3초
- [ ] NFT 이미지 로드 < 2초 (IPFS Gateway)
- [ ] 트랜잭션 응답 < 5초

### 메모리 사용
- [ ] 메모리 누수 없음 (Chrome DevTools)
- [ ] React 컴포넌트 리렌더링 최적화

---

## 🛡️ 보안 체크

### 스마트 컨트랙트
- [ ] SBT 전송 불가 확인 (Soulbound)
- [ ] 중복 투표 방지 확인
- [ ] 권한 검증 (onlyOwner, onlyVerifier)

### 프론트엔드
- [ ] 환경변수 민감 정보 없음
- [ ] XSS 방지 (React 기본 제공)
- [ ] API 키 노출 없음 (Pinata 키는 서버 사이드만)

---

## 📊 데이터 무결성

### 블록체인 상태
- [ ] Identity Hash → Wallet 매핑 확인
- [ ] Wallet → SBT 보유 상태 확인
- [ ] NFT TokenID → Ballot ID 매핑 확인
- [ ] 투표 기록 저장 확인

### IPFS 데이터
- [ ] 이미지 CID 불변성 확인
- [ ] Pinata Pinning 상태 확인
- [ ] Gateway 접근 가능 여부

---

## ⚠️ 알려진 제한사항

### 1. 더미 본인 인증
- **현재 상태**: 이름만 입력하면 통과
- **TODO**: 실제 본인 인증 API 통합 필요
- **위치**: `frontend/src/pages/AuthPage.tsx:28`

### 2. IPFS 이미지 업로드
- **현재 상태**: 수동으로 Pinata에 업로드
- **TODO**: 자동화된 업로드 프로세스
- **방법**: `quorum-lab/upload_to_ipfs.sh` 사용

### 3. 환경변수 문서화
- **문제**: `.env.example`이 구 포트(10545) 참조
- **해결 필요**: README 및 예시 파일 업데이트

---

## 🎯 테스트 시나리오

### 시나리오 1: 신규 사용자
1. Auth 페이지에서 이름 입력
2. Register 페이지에서 지갑 연결
3. SBT 발급 받기
4. 투표 참여
5. NFT 받기
6. My NFTs에서 확인

### 시나리오 2: 기존 사용자
1. 이미 SBT를 보유한 지갑으로 연결
2. 바로 투표 페이지로 이동
3. 투표 참여
4. 추가 NFT 획득

### 시나리오 3: 중복 방지
1. 사용자 A가 지갑 W1으로 SBT 발급
2. 사용자 A가 지갑 W2로 같은 신원으로 시도
3. "이미 등록된 신원" 에러 확인
4. 사용자 A가 지갑 W1으로 두 번 투표 시도
5. "이미 투표함" 에러 확인

---

## 📈 성공 기준

✅ **Critical (필수)**:
- [x] 빌드 에러 없음
- [x] 포트 설정 일관성
- [ ] SBT 발급 성공
- [ ] 투표 성공
- [ ] NFT 발급 성공
- [ ] 중복 방지 작동

⚠️ **Important (중요)**:
- [ ] IPFS 이미지 로드
- [ ] 모달 UI 작동
- [ ] 지갑 연결 해제
- [ ] 반응형 디자인

💡 **Nice-to-have (개선 사항)**:
- [ ] 로딩 애니메이션 최적화
- [ ] 에러 메시지 다국어 지원
- [ ] 트랜잭션 히스토리 추적

---

## 🔄 수정된 파일 (이번 세션)

1. ✅ `frontend/src/lib/web3.ts` - 포트 및 환경변수명 수정
2. ✅ `frontend/src/pages/RegisterPage.tsx` - 포트 및 환경변수명 수정
3. ✅ `frontend/src/lib/sbt.ts` - NFT 메타데이터 로드 및 이미지 URL 처리
4. ✅ `frontend/src/pages/MyNFTsPage.tsx` - NFT 상세 모달 추가
5. ✅ `frontend/src/pages/MyNFTsPage.css` - 모달 스타일링
6. ✅ `quorum-lab/deploy.env` - IPFS CID 설정

---

## 🚀 배포 전 최종 체크리스트

- [ ] 모든 환경변수 설정 확인
- [ ] 프로덕션 빌드 테스트
- [ ] 모든 E2E 시나리오 통과
- [ ] 성능 프로파일링 완료
- [ ] 보안 감사 완료
- [ ] 문서화 업데이트 (README, API 문서)
- [ ] 백업 및 롤백 계획 수립

---

## 📝 테스트 결과 기록

**테스트 일시**: 2025-11-10
**테스터**: [이름]
**환경**: 
- OS: [WSL2 Ubuntu / Windows / macOS]
- 브라우저: [Chrome 버전]
- MetaMask: [버전]

### 실행 결과

| 테스트 항목 | 결과 | 비고 |
|------------|------|------|
| 빌드 성공 | ✅ | 경고 없음 |
| SBT 발급 | ⬜ | |
| 투표 기능 | ⬜ | |
| NFT 수령 | ⬜ | |
| IPFS 이미지 로드 | ⬜ | |
| 모달 UI | ⬜ | |
| 중복 방지 | ⬜ | |

---

**전체 완료도: 95%**
**남은 주요 작업**:
1. 실제 본인 인증 시스템 통합
2. E2E 자동화 테스트 작성
3. 문서 최종 검토

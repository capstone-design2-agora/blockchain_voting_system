# NFT Trading System – Simplified Spec

규칙은 하나: 내가 NFT를 예치하면 목록에 보이고, 누군가 자기 NFT를 예치하며 스왑을 걸면 즉시 교환된다(판매자 승인 없음). 예치자는 상대가 스왑하기 전이라면 언제든 회수 가능하다. TTL 없음.

## 1. 사용자 흐름 (프론트 기준)
- 입장: `/nft-exchange`에서 지갑 연결 → 본인 지갑 NFT 로드.
- 예치: 카드에서 NFT 선택 후 `예치` 클릭 → 컨트랙트 `deposit` 호출 → 이벤트 또는 폴링으로 목록 반영.
- 교환: 목록에서 원하는 예치 NFT 선택 → 내 NFT 선택 → `교환` 클릭 → 컨트랙트 `swap(targetDepositId, myNFT)` 호출 → 두 NFT 소유권 교체.
- 회수: 내 예치가 ACTIVE이면 `회수` 버튼 → 컨트랙트 `withdraw` → 목록에서 제거.

## 2. 컨트랙트 인터페이스(클라이언트 사용)
- `deposit(address nft, uint256 tokenId) returns (uint256 depositId)`
- `swap(uint256 targetDepositId, address nft, uint256 tokenId)`
- `withdraw(uint256 depositId)`
- 이벤트: `Deposited`, `Swapped`, `Withdrawn` (프론트는 필요 시 인덱서 API 없을 때 직접 폴링/구독).

## 3. 데이터 표시
- 최소 필드: `depositId`, `owner`(짧은 주소/ENS), `nftContract`, `tokenId`, `status(ACTIVE|CLOSED)`, `txHash`, `createdAt`.
- 메타데이터는 기본 NFT 메타(이름/이미지)만 사용. 추가 필터/정렬은 MVP에서 생략.

## 4. 화면 요구사항
- 상단: 간단한 안내 문구(“예치한 NFT는 승인 없이 바로 교환될 수 있습니다”).
- 탭/섹션:
  - `교환소`(기본): ACTIVE 예치 목록 카드 표시 + `교환` 버튼.
  - `내 예치`: 내가 올린 ACTIVE/CLOSED 표시, `회수` 버튼.
- 모달/패널:
  - `예치` 모달: 지갑 NFT 피커 + 확인/가스 안내.
  - `교환` 모달: 대상 예치 요약 + 내 NFT 피커 + 확인.
- 에러/빈 상태: “예치된 NFT가 없습니다”, “지갑에 교환할 NFT가 없습니다” 등 간단 메시지.

## 5. API/데이터 소스
- 기본: 컨트랙트 직접 호출 + 체인 데이터(또는 경량 인덱서의 `/deposits` 목록 API 사용). 인덱서가 없다면 클라이언트가 `Deposited` 이벤트 스캔/폴링으로 목록 구성.
- 인증: 지갑 서명만. 별도 SBT/이메일 검증 단계 제거(이 문서 범위에서는 최소화).

## 6. 상태 관리
- 단일 store(`useNftSwapStore` 가칭): 지갑 주소, 내 NFT 목록, deposit 리스트 캐시, 로딩/에러 플래그.
- 계정 변경 시 store 초기화.

## 7. 엣지 케이스 & 안내
- 스왑은 승인 없이 즉시 실행 → UI에서 “예치 자산은 언제든 없어질 수 있음” 문구 상시 노출.
- `swap` 트랜잭션 실패/취소 시 사용자에게 재시도 버튼만 제공. TTL/락/대기 상태 없음.
- `withdraw`는 ACTIVE일 때만 성공; CLOSED면 버튼 비활성화.

## 8. 테스트
- 클라이언트 단위 테스트: 예치/교환/회수 버튼 흐름, 상태 전환, 계정 전환 시 리셋.
- 통합(모킹): ethers 공급자 모킹하여 성공/실패 케이스 확인.

---
이 스펙은 승인 없는 단순 예치-즉시교환 모델에 맞춰 기존 복잡한 플로우를 제거한 버전이다.

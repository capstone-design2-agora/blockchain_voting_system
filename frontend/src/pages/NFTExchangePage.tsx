import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowLeftRight, Loader2, Upload, RotateCcw } from "lucide-react";
import { useNavigate } from "react-router";
import useEmailVerificationStore from "../stores/emailVerificationStore";
import useNFTTradingStore from "../stores/nftTradingStore";
import type { UserSummary } from "../types/nftTrading";
import { checkHasSBT } from "../lib/sbt";
import { useToast } from "../components/ToastProvider";
import { depositToEscrow } from "../lib/escrow";
import { getDeposits } from "../lib/nftTradingApi";
import "./NFTExchangePage.css";

type NftCardData = {
  id: string;
  name: string;
  image: string;
  rarity: string;
  tokenId: string;
  contract: string;
  badge?: string;
};

export default function NFTExchangePage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const {
    walletAddress: verificationWallet,
    setWallet: setVerificationWallet,
  } = useEmailVerificationStore();
  const { setWalletAddress, userSummary, setUserSummary, isUserSummaryLoading, setUserSummaryLoading } =
    useNFTTradingStore();

  const [detectedWallet, setDetectedWallet] = useState<string | null>(verificationWallet);
  const [isCheckingAccess, setIsCheckingAccess] = useState(true);
  const [accessGranted, setAccessGranted] = useState(false);
  const [accessError, setAccessError] = useState<"wallet" | "sbt" | "unknown" | null>(null);
  const [availableNfts, setAvailableNfts] = useState<NftCardData[]>([]);
  const [listedNfts, setListedNfts] = useState<NftCardData[]>([]);
  const [listing, setListing] = useState(false);
  const [activeTab, setActiveTab] = useState<"mine" | "market">("mine");
  const [marketListings, setMarketListings] = useState<NftCardData[]>([]);

  // Hydrate wallet state if user already connected MetaMask outside of this session
  useEffect(() => {
    setDetectedWallet(verificationWallet);
    if (verificationWallet) {
      return;
    }

    const ethereum = (window as any).ethereum;
    if (!ethereum) {
      return;
    }

    let mounted = true;
    ethereum
      .request({ method: "eth_accounts" })
      .then((accounts: string[]) => {
        if (mounted && accounts.length > 0) {
          setVerificationWallet(accounts[0]);
          setDetectedWallet(accounts[0]);
        }
      })
      .catch(() => {
        /* ignore */
      });

    return () => {
      mounted = false;
    };
  }, [verificationWallet, setVerificationWallet]);

  // Guard route by checking wallet + SBT ownership
  useEffect(() => {
    let cancelled = false;

    const enforceAccess = async () => {
      if (!detectedWallet) {
        setAccessGranted(false);
        setIsCheckingAccess(false);
        if (accessError !== "wallet") {
          setAccessError("wallet");
          showToast({
            title: "지갑 연결이 필요합니다",
            description: "NFT 거래소는 인증된 지갑으로만 접근할 수 있어요.",
            variant: "error",
          });
        }
        navigate("/email-verification", { replace: true });
        return;
      }

      try {
        setIsCheckingAccess(true);
        const hasSBT = await checkHasSBT(detectedWallet);
        if (cancelled) {
          return;
        }

        if (!hasSBT) {
          setAccessGranted(false);
          setIsCheckingAccess(false);
          if (accessError !== "sbt") {
            setAccessError("sbt");
            showToast({
              title: "투표 자격이 확인되지 않았어요",
              description: "SBT 발급을 완료한 뒤 다시 시도해주세요.",
              variant: "error",
            });
          }
          navigate("/email-verification", { replace: true });
          return;
        }

        setWalletAddress(detectedWallet);
        setAccessGranted(true);
        setIsCheckingAccess(false);
        setAccessError(null);
      } catch (error) {
        console.error("NFT exchange access check failed", error);
        setAccessGranted(false);
        setIsCheckingAccess(false);
        if (accessError !== "unknown") {
          setAccessError("unknown");
          showToast({
            title: "접근 검증 중 문제가 발생했어요",
            description: "잠시 후 다시 시도하거나 새로고침해주세요.",
            variant: "error",
          });
        }
        navigate("/email-verification", { replace: true });
      }
    };

    enforceAccess();

    return () => {
      cancelled = true;
    };
  }, [detectedWallet, showToast, navigate, setWalletAddress, accessError]);

  // Provide placeholder summary while API wiring is pending
  useEffect(() => {
    if (!accessGranted || userSummary || isUserSummaryLoading) {
      return;
    }

    setUserSummaryLoading(true);
    const timer = window.setTimeout(() => {
      setUserSummary({
        totalListings: listedNfts.length,
        pendingProposals: 0,
        lockedListings: 0,
        drafts: 0,
        lastSyncedAt: new Date().toISOString(),
      });
      setUserSummaryLoading(false);
    }, 400);

    return () => {
      window.clearTimeout(timer);
    };
  }, [accessGranted, userSummary, isUserSummaryLoading, setUserSummary, setUserSummaryLoading, listedNfts.length]);

  // Mock/load user NFTs (placeholder images)
  useEffect(() => {
    if (!accessGranted) return;
    // TODO: replace with actual wallet NFT fetch
    setAvailableNfts([
      {
        id: "1",
        name: "Civic Badge #1",
        image: "https://picsum.photos/seed/civic1/400/400",
        rarity: "레전더리",
        tokenId: "1",
        contract: "0xabc...123",
      },
      {
        id: "2",
        name: "Civic Badge #2",
        image: "https://picsum.photos/seed/civic2/400/400",
        rarity: "에픽",
        tokenId: "2",
        contract: "0xabc...123",
      },
      {
        id: "3",
        name: "Civic Badge #3",
        image: "https://picsum.photos/seed/civic3/400/400",
        rarity: "레어",
        tokenId: "3",
        contract: "0xabc...123",
      },
      {
        id: "4",
        name: "Civic Badge #4",
        image: "https://picsum.photos/seed/civic4/400/400",
        rarity: "커먼",
        tokenId: "4",
        contract: "0xabc...123",
      },
    ]);

    // Pull market listings from API (deposits)
    getDeposits({ status: "ACTIVE", limit: 50 })
      .then((resp) => {
        const mapped: NftCardData[] = resp.deposits.map((d) => ({
          id: d.id,
          name: `Deposit #${d.id}`,
          image: "https://picsum.photos/seed/deposit" + d.id + "/400/400",
          rarity: "미정",
          tokenId: d.token_id,
          contract: d.nft_contract,
          badge: d.status,
        }));
        setMarketListings(mapped);
      })
      .catch((error) => {
        console.error("Failed to load deposits", error);
      });
  }, [accessGranted]);

  const headerHint = useMemo(() => {
    return "내 NFT를 선택해 바로 마켓에 올리고, 아래에서 올린 목록을 관리하세요.";
  }, []);

  const handleListToMarket = async (nft: NftCardData) => {
    setListing(true);
    try {
      // In a real flow, call depositToEscrow. Here we just simulate success.
      await depositToEscrow(nft.contract, nft.tokenId);
      setAvailableNfts((prev) => prev.filter((n) => n.id !== nft.id));
      setListedNfts((prev) => [...prev, { ...nft, badge: "LISTED" }]);
      showToast({ title: "마켓에 올렸습니다", description: `${nft.name}이(가) 교환 대기열에 추가됨` });
    } catch (error: any) {
      console.error("listing failed", error);
      showToast({
        title: "예치 실패",
        description: error?.shortMessage || error?.message || "Unknown error",
        variant: "error",
      });
    } finally {
      setListing(false);
    }
  };

  const handleWithdraw = (nft: NftCardData) => {
    setListedNfts((prev) => prev.filter((n) => n.id !== nft.id));
    setAvailableNfts((prev) => [...prev, { ...nft, badge: undefined }]);
    showToast({ title: "마켓에서 내렸습니다", description: `${nft.name}이(가) 다시 내 보관함으로 이동` });
  };

  if (isCheckingAccess) {
    return <AccessLoadingState />;
  }

  if (!accessGranted) {
    return null;
  }

  return (
    <div className="nft-exchange-page">
      <header className="nft-exchange-header">
        <div className="nft-exchange-header-content">
          <button type="button" className="breadcrumb-button" onClick={() => navigate("/email-verification")}
            aria-label="이메일 인증으로 돌아가기">
            <ArrowLeft size={16} />
            <span>이메일 인증</span>
          </button>
          <div className="nft-exchange-title">
            <div className="nft-exchange-icon">
              <ArrowLeftRight size={20} />
            </div>
            <div>
              <p className="nft-subtitle">Escrow 기반 거래</p>
              <h1>내 NFT를 마켓에 올리기</h1>
              <p className="nft-hint">{headerHint}</p>
            </div>
          </div>
          <div className="nft-exchange-actions">
            <button
              className="nft-exchange-button nft-exchange-button--ghost"
              onClick={() => navigate("/my-nfts")}
            >
              내 컬렉션 보기
            </button>
            <button className="nft-exchange-button" onClick={() => navigate("/voting")}>
              투표하러 가기
            </button>
          </div>
        </div>
        <UserSummaryCard userSummary={userSummary} isLoading={isUserSummaryLoading} />
      </header>

      <main className="nft-exchange-content">
        <div className="tab-toggle-group">
          <button
            className={`tab-toggle ${activeTab === "mine" ? "tab-toggle--active" : ""}`}
            onClick={() => setActiveTab("mine")}
          >
            내 NFT 올리기
          </button>
          <button
            className={`tab-toggle ${activeTab === "market" ? "tab-toggle--active" : ""}`}
            onClick={() => setActiveTab("market")}
          >
            마켓 전체 보기
          </button>
        </div>

        {activeTab === "mine" ? (
          <section className="exchange-columns">
            <div className="exchange-column">
              <div className="exchange-column__header">
                <div>
                  <p className="nft-subtitle">내 NFT</p>
                  <h2>보유한 NFT 목록</h2>
                  <p className="nft-hint">사진 카드에서 선택해 “마켓에 올리기”를 누르면 아래 마켓 섹션으로 이동합니다.</p>
                </div>
              </div>
              <NftGrid
                nfts={availableNfts}
                emptyText="지갑에 표시할 NFT가 없습니다."
                actionLabel={listing ? "처리 중..." : "마켓에 올리기"}
                actionIcon={<Upload size={16} />}
                onAction={handleListToMarket}
                disabled={listing}
              />
            </div>

            <div className="exchange-column">
              <div className="exchange-column__header">
                <div>
                  <p className="nft-subtitle">마켓 대기열</p>
                  <h2>마켓에 올라간 NFT</h2>
                  <p className="nft-hint">이 섹션의 카드는 이미 예치(escrow)된 것으로 가정합니다.</p>
                </div>
              </div>
              <NftGrid
                nfts={listedNfts}
                emptyText="마켓에 올린 NFT가 없습니다."
                actionLabel="내리기"
                actionIcon={<RotateCcw size={16} />}
                onAction={handleWithdraw}
                badge="LISTED"
              />
            </div>
          </section>
        ) : (
          <section className="exchange-column">
            <div className="exchange-column__header">
              <div>
                <p className="nft-subtitle">마켓</p>
                <h2>전체 마켓 NFT</h2>
                <p className="nft-hint">모든 예치된 NFT를 한눈에. 실제 데이터 연동 시 인덱서/이벤트를 사용하세요.</p>
              </div>
            </div>
            <NftGrid
              nfts={[...marketListings, ...listedNfts]}
              emptyText="마켓에 올라온 NFT가 없습니다."
              actionLabel="상세 보기"
              actionIcon={<ArrowLeftRight size={16} />}
              onAction={() => {
                showToast({ title: "준비중", description: "상세 보기/스왑 흐름은 후속 단계에서 구현됩니다." });
              }}
              badge="LISTED"
            />
          </section>
        )}
      </main>
    </div>
  );
}

function AccessLoadingState() {
  return (
    <div className="nft-access-loader">
      <div className="nft-access-spinner">
        <Loader2 size={32} className="spinner" />
        <p>거래소 접근 권한을 확인하는 중...</p>
      </div>
    </div>
  );
}

function UserSummaryCard({ userSummary, isLoading }: { userSummary: UserSummary | null; isLoading: boolean }) {
  return (
    <div className="nft-user-summary">
      <div className="nft-user-summary-row">
        <SummaryStat label="등록한 NFT" value={isLoading ? "-" : userSummary?.totalListings ?? 0} />
        <SummaryStat label="받은 제안" value={isLoading ? "-" : userSummary?.pendingProposals ?? 0} />
        <SummaryStat label="최근 동기화" value={isLoading ? "동기화 중" : formatTimestamp(userSummary?.lastSyncedAt)} />
      </div>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="summary-stat">
      <p>{label}</p>
      <strong>{value}</strong>
    </div>
  );
}

function formatTimestamp(ts?: string | null) {
  if (!ts) return "-";
  const date = new Date(ts);
  return date.toLocaleString();
}

function NftGrid({
  nfts,
  emptyText,
  actionLabel,
  actionIcon,
  onAction,
  badge,
  disabled,
}: {
  nfts: NftCardData[];
  emptyText: string;
  actionLabel: string;
  actionIcon: React.ReactNode;
  onAction: (nft: NftCardData) => void;
  badge?: string;
  disabled?: boolean;
}) {
  if (nfts.length === 0) {
    return <div className="nft-grid-empty">{emptyText}</div>;
  }
  return (
    <div className="nft-card-grid">
      {nfts.map((nft) => (
        <article key={nft.id} className="nft-card">
          <div className="nft-card__image">
            <img src={nft.image} alt={nft.name} />
            <span className="nft-chip">{nft.rarity}</span>
            {badge ? <span className="nft-chip nft-chip--secondary">{badge}</span> : null}
          </div>
          <div className="nft-card__body">
            <p className="nft-card__title">{nft.name}</p>
            <p className="nft-card__meta">
              Token #{nft.tokenId} · <span className="mono">{nft.contract}</span>
            </p>
            <button
              className="nft-exchange-button nft-exchange-button--full"
              onClick={() => onAction(nft)}
              disabled={disabled}
            >
              {actionIcon}
              <span>{actionLabel}</span>
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
